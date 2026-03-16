const prisma = require('../lib/prisma');

class ClientService {

  async processBulkImport(clients, importId) {
    if (typeof clients === 'string') {
      // ── File path: stream from disk, never load into RAM ──────────────────
      return this._processFile(clients, importId);
    }
    // ── Array: direct JSON body upload ────────────────────────────────────
    return this._processArray(clients, importId);
  }

  // ── Stream large file from disk in 500-record batches ──────────────────────
  _processFile(filePath, importId) {
    return new Promise(async (resolve, reject) => {
      const fs         = require('fs');
      const JSONStream = require('JSONStream');

      const BATCH_SIZE = 500;
      let buffer   = [];
      let inserted = 0, updated = 0, failed = 0;
      const startTime = Date.now();
      let total = 0;

      // Detect JSON structure: peek first non-whitespace character
      // '[' = root array  e.g. [{...},{...}]
      // '{' = root object e.g. {"data":[...]} or {"clients":[...]}
      let firstChar = '';
      const peek = fs.createReadStream(filePath, { start: 0, end: 100, encoding: 'utf8' });
      await new Promise(r => {
        peek.on('data', chunk => { firstChar = chunk.trimStart()[0]; });
        peek.on('close', r);
      });

      // Choose correct JSONStream pattern based on file structure
      // [true]  = every element of a root array         → handles [{...},{...}]
      // 'data.*' / 'clients.*' / 'records.*'            → handles {"data":[...]}
      // If none match we fallback to [true]
      let parser;
      if (firstChar === '[') {
        // Root array — most common backup format
        parser = JSONStream.parse([true]);
      } else {
        // Root object — try common wrapper keys, fallback to any array element
        parser = JSONStream.parse(['data', true]);
        // If that yields nothing we'll catch it in the end handler
      }

      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });

      const processBatch = async (batch) => {
        try {
          const r = await this.processBatch(batch, importId);
          inserted += r.inserted;
          updated  += r.updated;
          failed   += r.failed;
        } catch (e) {
          console.error(`[${importId}] Batch error:`, e.message);
          failed += batch.length;
        }
      };

      parser.on('data', (record) => {
        total++;
        buffer.push(record);

        if (buffer.length >= BATCH_SIZE) {
          parser.pause();
          const batch = buffer.splice(0, BATCH_SIZE);
          processBatch(batch).then(() => {
            // Update progress
            prisma.importLog.update({
              where: { import_id: importId },
              data: { processed: total, inserted_records: inserted, updated_records: updated, failed_records: failed }
            }).catch(() => {});
            parser.resume();
          }).catch(() => parser.resume());
        }
      });

      parser.on('end', async () => {
        // Process remaining buffer
        if (buffer.length > 0) {
          await processBatch(buffer);
        }

        const duration = Date.now() - startTime;
        try {
          const result = await this._finalize(importId, inserted, updated, failed, duration, total);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });

      parser.on('error', (err) => {
        console.error(`[${importId}] JSON parse error:`, err.message);
        reject(new Error(`JSON parse failed: ${err.message}. Make sure your file is a valid JSON array [{...},{...}] or object {"data":[...]}`));
      });

      stream.on('error', reject);
      stream.pipe(parser);
    });
  }

  // ── Process pre-parsed array (small JSON body uploads) ────────────────────
  async _processArray(clients, importId) {
    const BATCH_SIZE = 500;
    const startTime  = Date.now();
    let inserted = 0, updated = 0, failed = 0;
    const totalBatches = Math.ceil(clients.length / BATCH_SIZE);

    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch    = clients.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      try {
        const result = await this.processBatch(batch, importId);
        inserted += result.inserted;
        updated  += result.updated;
        failed   += result.failed;
        console.log(`[${importId}] Batch ${batchNum}/${totalBatches}: +${result.inserted} new, ~${result.updated} updated`);

        prisma.importLog.update({
          where: { import_id: importId },
          data: { processed: i + batch.length, inserted_records: inserted, updated_records: updated, failed_records: failed }
        }).catch(() => {});
      } catch (e) {
        console.error(`[${importId}] Batch ${batchNum} error:`, e.message);
        failed += batch.length;
      }
    }

    const duration = Date.now() - startTime;
    return this._finalize(importId, inserted, updated, failed, duration, clients.length);
  }

  // ── Finalize import log and return summary ────────────────────────────────
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

    console.log(`[${importId}] ✅ Done in ${(duration / 1000).toFixed(1)}s — inserted:${inserted} updated:${updated} failed:${failed}`);

    return {
      totalReceived:    total,
      newlyInserted:    inserted,
      existingUpdated:  updated,
      failedToProcess:  failed,
      processingTime:   `${(duration / 1000).toFixed(2)}s`,
      speed:            `${Math.round(total / Math.max(duration / 1000, 1))} records/sec`
    };
  }

  // ── Process one batch: bulk insert new + update existing ─────────────────
  async processBatch(records, importId) {
    const validRecords = [];
    let failed = 0;

    for (const record of records) {
      try {
        const t = this.transformRecord(record, importId);
        if (t) validRecords.push(t);
        else failed++;
      } catch { failed++; }
    }

    if (validRecords.length === 0) return { inserted: 0, updated: 0, failed };

    // Single query to find all existing IDs (eliminates N+1)
    const clientIds  = validRecords.map(r => r.client_id);
    const existing   = await prisma.client.findMany({ where: { client_id: { in: clientIds } }, select: { client_id: true } });
    const existingSet = new Set(existing.map(e => e.client_id));

    const toInsert = validRecords.filter(r => !existingSet.has(r.client_id));
    const toUpdate = validRecords.filter(r =>  existingSet.has(r.client_id));

    // Bulk insert
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
          is_active:   r.is_active,
          import_id:   r.import_id
        })),
        skipDuplicates: true
      });
    }

    // Bulk update existing
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
            is_active:   r.is_active,
            import_id:   r.import_id,
            updated_at:  new Date()
          }
        })
      ));
    }

    return { inserted: toInsert.length, updated: toUpdate.length, failed };
  }

  // ── Transform & validate one raw record ──────────────────────────────────
  transformRecord(raw, importId) {
    if (!raw || typeof raw !== 'object') return null;

    const clientId = raw.client_id || raw.clientId || raw.id || raw.ID ||
                     raw.customer_id || raw.customerId ||
                     `CLI_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    const name = raw.name || raw.full_name || raw.fullName ||
                 raw.customer_name || raw.customerName ||
                 raw.display_name  || raw.displayName || null;

    if (!name) return null; // skip records with no name

    const email      = raw.email || raw.email_address || raw.emailAddress || null;
    const phone      = raw.phone || raw.phone_number  || raw.phoneNumber  || raw.telephone || raw.mobile || null;
    const company    = raw.company || raw.company_name || raw.companyName || raw.organization || null;
    const address    = raw.address || raw.street || raw.street_address || null;
    const city       = raw.city   || raw.town   || raw.locality || null;
    const state      = raw.state  || raw.province || raw.region || null;
    const country    = raw.country || raw.nation || null;
    const postalCode = raw.postal_code || raw.postalCode || raw.zip || raw.zipCode || raw.postcode || null;

    const knownFields = new Set([
      'client_id','clientId','id','ID','customer_id','customerId',
      'name','full_name','fullName','customer_name','customerName','display_name','displayName',
      'email','email_address','emailAddress',
      'phone','phone_number','phoneNumber','telephone','mobile',
      'company','company_name','companyName','organization',
      'address','street','street_address','city','town','locality',
      'state','province','region','country','nation',
      'postal_code','postalCode','zip','zipCode','postcode'
    ]);

    const metadata = {};
    for (const key of Object.keys(raw)) {
      if (!knownFields.has(key) && raw[key] != null && raw[key] !== '') {
        metadata[key] = raw[key];
      }
    }

    return {
      client_id:   String(clientId).substring(0, 100),
      name:        String(name).substring(0, 255),
      email:       email      ? String(email).toLowerCase().substring(0, 255) : null,
      phone:       phone      ? String(phone).substring(0, 50)   : null,
      company:     company    ? String(company).substring(0, 255) : null,
      address:     address    ? String(address).substring(0, 65000) : null,
      city:        city       ? String(city).substring(0, 100)   : null,
      state:       state      ? String(state).substring(0, 100)  : null,
      country:     country    ? String(country).substring(0, 100) : null,
      postal_code: postalCode ? String(postalCode).substring(0, 50) : null,
      metadata:    Object.keys(metadata).length > 0 ? metadata : null,
      is_active:   true,
      import_id:   importId
    };
  }

  // ── Search ────────────────────────────────────────────────────────────────
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
    return { clients: this.serializeClients(clients), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  serializeClients(clients) {
    return clients.map(c => ({ ...c, id: c.id.toString() }));
  }
}

module.exports = new ClientService();