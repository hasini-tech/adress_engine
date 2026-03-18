const prisma = require('../lib/prisma');

class ClientService {

  async processBulkImport(clients, importId) {
    if (typeof clients === 'string') return this._processFile(clients, importId);
    return this._processArray(clients, importId);
  }

  _processFile(filePath, importId) {
    return new Promise(async (resolve, reject) => {
      const fs         = require('fs');
      const JSONStream = require('JSONStream');
      const BATCH_SIZE = 500;
      let buffer = [], inserted = 0, updated = 0, failed = 0, total = 0;
      const startTime = Date.now();

      let firstChar = '';
      const peek = fs.createReadStream(filePath, { start: 0, end: 200, encoding: 'utf8' });
      await new Promise(r => { peek.on('data', c => { firstChar = c.trimStart()[0]; }); peek.on('close', r); });

      const parser = firstChar === '[' ? JSONStream.parse([true]) : JSONStream.parse(['data', true]);
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });

      const processBatch = async (batch) => {
        try {
          const r = await this.processBatch(batch, importId);
          inserted += r.inserted; updated += r.updated; failed += r.failed;
        } catch (e) {
          console.error(`[${importId}] Batch error:`, e.message);
          failed += batch.length;
        }
      };

      parser.on('data', (record) => {
        if (total === 0) {
          const sample = this.transformRecord(record, importId);
          console.log('\n========== FIRST RECORD TRANSFORMED ==========');
          console.log(JSON.stringify(sample, null, 2));
          console.log('==============================================\n');
        }
        total++;
        buffer.push(record);
        if (buffer.length >= BATCH_SIZE) {
          parser.pause();
          const batch = buffer.splice(0, BATCH_SIZE);
          processBatch(batch).then(() => {
            prisma.importLog.update({
              where: { import_id: importId },
              data: { processed: total, inserted_records: inserted, updated_records: updated, failed_records: failed }
            }).catch(() => {});
            parser.resume();
          }).catch(() => parser.resume());
        }
      });

      parser.on('end', async () => {
        if (buffer.length > 0) await processBatch(buffer);
        const duration = Date.now() - startTime;
        try { resolve(await this._finalize(importId, inserted, updated, failed, duration, total)); }
        catch (e) { reject(e); }
      });

      parser.on('error', (err) => reject(new Error(`JSON parse failed: ${err.message}`)));
      stream.on('error', reject);
      stream.pipe(parser);
    });
  }

  async _processArray(clients, importId) {
    const BATCH_SIZE = 500, startTime = Date.now();
    let inserted = 0, updated = 0, failed = 0;

    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE);
      try {
        const r = await this.processBatch(batch, importId);
        inserted += r.inserted; updated += r.updated; failed += r.failed;
        prisma.importLog.update({
          where: { import_id: importId },
          data: { processed: i + batch.length, inserted_records: inserted, updated_records: updated, failed_records: failed }
        }).catch(() => {});
      } catch (e) {
        console.error(`[${importId}] Batch error:`, e.message);
        failed += batch.length;
      }
    }
    return this._finalize(importId, inserted, updated, failed, Date.now() - startTime, clients.length);
  }

  async _finalize(importId, inserted, updated, failed, duration, total) {
    await prisma.importLog.update({
      where: { import_id: importId },
      data: {
        status:           failed === 0 ? 'completed' : 'completed_with_errors',
        completed_at:     new Date(),
        duration_ms:      duration,
        inserted_records: inserted,
        updated_records:  updated,
        failed_records:   failed,
        processed:        total
      }
    });
    console.log(`[${importId}] ✅ Done in ${(duration/1000).toFixed(1)}s — inserted:${inserted} updated:${updated} failed:${failed}`);
    return {
      totalReceived:   total,
      newlyInserted:   inserted,
      existingUpdated: updated,
      failedToProcess: failed,
      processingTime:  `${(duration/1000).toFixed(2)}s`,
      speed:           `${Math.round(total / Math.max(duration/1000, 1))} records/sec`
    };
  }

  async processBatch(records, importId) {
    const validRecords = [];
    let failed = 0;
    for (const record of records) {
      try {
        const t = this.transformRecord(record, importId);
        if (t) validRecords.push(t); else failed++;
      } catch (e) {
        console.error('Transform error:', e.message);
        failed++;
      }
    }
    if (validRecords.length === 0) return { inserted: 0, updated: 0, failed };

    const clientIds   = validRecords.map(r => r.client_id);
    const existing    = await prisma.client.findMany({
      where: { client_id: { in: clientIds } },
      select: { client_id: true }
    });
    const existingSet = new Set(existing.map(e => e.client_id));
    const toInsert    = validRecords.filter(r => !existingSet.has(r.client_id));
    const toUpdate    = validRecords.filter(r =>  existingSet.has(r.client_id));

    if (toInsert.length > 0) {
      await prisma.client.createMany({
        data: toInsert.map(r => ({
          client_id:   r.client_id,
          name:        r.name,
          email:       r.email,
          phone:       r.phone,
          company:     r.company,
          address:     r.address,
          city:        r.city,
          state:       r.state,
          country:     r.country,
          postal_code: r.postal_code,
          metadata:    r.metadata ?? undefined,
          is_active:   true,
          import_id:   importId
        })),
        skipDuplicates: true
      });
    }

    if (toUpdate.length > 0) {
      await Promise.all(toUpdate.map(r =>
        prisma.client.updateMany({
          where: { client_id: r.client_id },
          data: {
            name:        r.name,
            email:       r.email,
            phone:       r.phone,
            company:     r.company,
            address:     r.address,
            city:        r.city,
            state:       r.state,
            country:     r.country,
            postal_code: r.postal_code,
            metadata:    r.metadata ?? undefined,
            is_active:   true,
            import_id:   importId,
            updated_at:  new Date()
          }
        })
      ));
    }

    return { inserted: toInsert.length, updated: toUpdate.length, failed };
  }

  // ── Extract fields from your MongoDB export format ────────────────────────
  // Top level:   phone, originalPhone, customerName, email, tenantName
  // Nested:      billingAddress.{ address1, address2, city, state, postcode, country, company }
  // Fallback:    shippingAddress.{ same fields }
  transformRecord(raw, importId) {
    if (!raw || typeof raw !== 'object') return null;

    // ── ID ────────────────────────────────────────────────────────────────
    let clientId = null;
    if (raw._id) {
      clientId = (typeof raw._id === 'object' && raw._id.$oid)
        ? raw._id.$oid
        : String(raw._id);
    }
    if (!clientId) {
      clientId = raw.client_id || raw.clientId || raw.id ||
        `CLI_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    }

    // ── Name ──────────────────────────────────────────────────────────────
    let name = raw.customerName || raw.customer_name || raw.name || null;
    if (!name) {
      const b = raw.billingAddress || raw.shippingAddress || {};
      const first = b.firstName || b.first_name || '';
      const last  = b.lastName  || b.last_name  || '';
      if (first || last) name = `${first} ${last}`.trim();
    }
    if (!name) return null;

    // ── Phone ─────────────────────────────────────────────────────────────
    const phone =
      raw.phone ||
      raw.originalPhone ||
      (raw.billingAddress  && raw.billingAddress.phone)  ||
      (raw.shippingAddress && raw.shippingAddress.phone) ||
      null;

    // ── Email ─────────────────────────────────────────────────────────────
    const email =
      raw.email ||
      (raw.billingAddress  && raw.billingAddress.email)  ||
      (raw.shippingAddress && raw.shippingAddress.email) ||
      null;

    // ── Nested address objects ────────────────────────────────────────────
    const b = (raw.billingAddress  && typeof raw.billingAddress  === 'object') ? raw.billingAddress  : {};
    const s = (raw.shippingAddress && typeof raw.shippingAddress === 'object') ? raw.shippingAddress : {};

    // Company
    const company =
      (b.company && String(b.company).trim()) ||
      raw.tenantName ||
      (s.company && String(s.company).trim()) ||
      null;

    // Address — combine address1 + address2
    const addr1   = b.address1 || s.address1 || raw.address || '';
    const addr2   = b.address2 || s.address2 || '';
    const address = [addr1, addr2].filter(x => x && String(x).trim()).join(', ').trim() || null;

    // City
    const city = b.city || s.city || raw.city || null;

    // State
    const state = b.state || s.state || raw.state || null;

    // Country
    const country = b.country || s.country || raw.country || raw.countryCode || null;

    // Postal code — your field is "postcode"
    const postal_code =
      b.postcode    || b.postal_code || b.zip || b.zipCode ||
      s.postcode    || s.postal_code || s.zip || s.zipCode ||
      raw.postcode  || raw.postal_code || raw.zip ||
      null;

    // ── Metadata ──────────────────────────────────────────────────────────
    const meta = {};
    if (raw.tenantId)        meta.tenantId        = raw.tenantId;
    if (raw.tenantName)      meta.tenantName      = raw.tenantName;
    if (raw.totalOrders)     meta.totalOrders     = raw.totalOrders;
    if (raw.lastOrderId)     meta.lastOrderId     = raw.lastOrderId;
    if (raw.lastOrderNumber) meta.lastOrderNumber = raw.lastOrderNumber;
    if (raw.isIndianNumber != null) meta.isIndianNumber = raw.isIndianNumber;
    if (raw.countryCode)     meta.countryCode     = raw.countryCode;
    if (raw.lastOrderDate)   meta.lastOrderDate   = raw.lastOrderDate?.$date || raw.lastOrderDate;

    return {
      client_id:   String(clientId).substring(0, 100),
      name:        String(name).substring(0, 255),
      email:       email       ? String(email).toLowerCase().substring(0, 255) : null,
      phone:       phone       ? String(phone).substring(0, 50)                : null,
      company:     company     ? String(company).substring(0, 255)             : null,
      address:     address     ? String(address).substring(0, 65000)           : null,
      city:        city        ? String(city).substring(0, 100)                : null,
      state:       state       ? String(state).substring(0, 100)               : null,
      country:     country     ? String(country).substring(0, 100)             : null,
      postal_code: postal_code ? String(postal_code).substring(0, 50)         : null,
      metadata:    Object.keys(meta).length > 0 ? meta : null,
      is_active:   true,
      import_id:   importId
    };
  }

  async searchClients(query, page = 1, limit = 50) {
    const skip  = (page - 1) * limit;
    const where = query?.trim() ? {
      OR: [
        { name:      { contains: query } },
        { email:     { contains: query } },
        { company:   { contains: query } },
        { phone:     { contains: query } },
        { city:      { contains: query } },
        { client_id: { contains: query } }
      ]
    } : {};
    const [clients, total] = await Promise.all([
      prisma.client.findMany({ where, take: limit, skip, orderBy: { updated_at: 'desc' } }),
      prisma.client.count({ where })
    ]);
    return { clients: this.serializeClients(clients), total, page, limit };
  }

  async getAllClients(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [clients, total] = await Promise.all([
      prisma.client.findMany({ take: limit, skip, orderBy: { updated_at: 'desc' } }),
      prisma.client.count()
    ]);
    return { clients: this.serializeClients(clients), total, page, limit, totalPages: Math.ceil(total/limit) };
  }

  serializeClients(clients) {
    return clients.map(c => ({ ...c, id: c.id.toString() }));
  }
}

module.exports = new ClientService();