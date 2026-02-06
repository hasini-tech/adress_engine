const prisma = require('../lib/prisma');

class ClientService {
  
  async processBulkImport(clients, importId) {
    const BATCH_SIZE = 2000;
    const startTime = Date.now();
    
    let inserted = 0;
    let updated = 0;
    let failed = 0;

    console.log(`[${importId}] Starting import of ${clients.length} records`);

    const totalBatches = Math.ceil(clients.length / BATCH_SIZE);
    
    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      try {
        const result = await this.processBatch(batch, importId);
        inserted += result.inserted;
        updated += result.updated;
        failed += result.failed;

        console.log(`[${importId}] Batch ${batchNum}/${totalBatches}: +${result.inserted} new, ~${result.updated} updated, x${result.failed} failed`);

        await prisma.importLog.update({
          where: { import_id: importId },
          data: {
            processed: i + batch.length,
            inserted_records: inserted,
            updated_records: updated,
            failed_records: failed
          }
        });

      } catch (batchError) {
        console.error(`[${importId}] Batch ${batchNum} error:`, batchError.message);
        failed += batch.length;
      }
    }

    const duration = Date.now() - startTime;

    await prisma.importLog.update({
      where: { import_id: importId },
      data: {
        status: failed === 0 ? 'completed' : 'completed_with_errors',
        completed_at: new Date(),
        duration_ms: duration,
        inserted_records: inserted,
        updated_records: updated,
        failed_records: failed
      }
    });

    console.log(`[${importId}] ✅ Complete in ${(duration/1000).toFixed(1)}s`);

    return {
      totalReceived: clients.length,
      newlyInserted: inserted,
      existingUpdated: updated,
      failedToProcess: failed,
      processingTime: `${(duration / 1000).toFixed(2)}s`,
      speed: `${Math.round(clients.length / (duration / 1000))} records/sec`
    };
  }

  async processBatch(records, importId) {
    const validRecords = [];
    let failed = 0;

    for (const record of records) {
      try {
        const transformed = this.transformRecord(record, importId);
        if (transformed) {
          validRecords.push(transformed);
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
    }

    if (validRecords.length === 0) {
      return { inserted: 0, updated: 0, failed };
    }

    const clientIds = validRecords.map(r => r.client_id);
    const existing = await prisma.client.findMany({
      where: { client_id: { in: clientIds } },
      select: { client_id: true }
    });
    const existingSet = new Set(existing.map(e => e.client_id));

    let inserted = 0;
    let updated = 0;

    validRecords.forEach(r => {
      if (existingSet.has(r.client_id)) {
        updated++;
      } else {
        inserted++;
      }
    });

    const placeholders = validRecords.map(() => 
      '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).join(', ');

    const values = validRecords.flatMap(r => [
      r.client_id,
      r.name,
      r.email,
      r.phone,
      r.company,
      r.address,
      r.city,
      r.state,
      r.country,
      r.postal_code,
      r.metadata ? JSON.stringify(r.metadata) : null,
      r.is_active ? 1 : 0,
      r.import_id,
      new Date()
    ]);

    const sql = `
      INSERT INTO clients 
        (client_id, name, email, phone, company, address, city, state, country, postal_code, metadata, is_active, import_id, updated_at)
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        email = VALUES(email),
        phone = VALUES(phone),
        company = VALUES(company),
        address = VALUES(address),
        city = VALUES(city),
        state = VALUES(state),
        country = VALUES(country),
        postal_code = VALUES(postal_code),
        metadata = VALUES(metadata),
        import_id = VALUES(import_id),
        updated_at = NOW()
    `;

    await prisma.$executeRawUnsafe(sql, ...values);

    return { inserted, updated, failed };
  }

  transformRecord(raw, importId) {
    if (!raw || typeof raw !== 'object') return null;

    const clientId = raw.client_id || raw.clientId || raw.id || raw.ID ||
                     raw.customer_id || raw.customerId ||
                     `CLI_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    const name = raw.name || raw.full_name || raw.fullName || 
                 raw.customer_name || raw.customerName ||
                 raw.display_name || raw.displayName || null;

    if (!name) return null;

    const email = raw.email || raw.email_address || raw.emailAddress || null;
    const phone = raw.phone || raw.phone_number || raw.phoneNumber || 
                  raw.telephone || raw.mobile || null;
    const company = raw.company || raw.company_name || raw.companyName || 
                    raw.organization || null;
    const address = raw.address || raw.street || raw.street_address || null;
    const city = raw.city || raw.town || raw.locality || null;
    const state = raw.state || raw.province || raw.region || null;
    const country = raw.country || raw.nation || null;
    const postalCode = raw.postal_code || raw.postalCode || raw.zip || 
                       raw.zipCode || raw.postcode || null;

    const knownFields = new Set([
      'client_id', 'clientId', 'id', 'ID', 'customer_id', 'customerId',
      'name', 'full_name', 'fullName', 'customer_name', 'customerName',
      'display_name', 'displayName', 'email', 'email_address', 'emailAddress',
      'phone', 'phone_number', 'phoneNumber', 'telephone', 'mobile',
      'company', 'company_name', 'companyName', 'organization',
      'address', 'street', 'street_address', 'city', 'town', 'locality',
      'state', 'province', 'region', 'country', 'nation',
      'postal_code', 'postalCode', 'zip', 'zipCode', 'postcode'
    ]);

    const metadata = {};
    Object.keys(raw).forEach(key => {
      if (!knownFields.has(key) && raw[key] != null && raw[key] !== '') {
        metadata[key] = raw[key];
      }
    });

    return {
      client_id: String(clientId).substring(0, 100),
      name: String(name).substring(0, 255),
      email: email ? String(email).toLowerCase().substring(0, 255) : null,
      phone: phone ? String(phone).substring(0, 50) : null,
      company: company ? String(company).substring(0, 255) : null,
      address: address ? String(address).substring(0, 65000) : null,
      city: city ? String(city).substring(0, 100) : null,
      state: state ? String(state).substring(0, 100) : null,
      country: country ? String(country).substring(0, 100) : null,
      postal_code: postalCode ? String(postalCode).substring(0, 50) : null,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      is_active: true,
      import_id: importId
    };
  }

  async searchClients(query, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    if (!query || query.trim() === '') {
      const [clients, total] = await Promise.all([
        prisma.client.findMany({
          take: limit,
          skip,
          orderBy: { updated_at: 'desc' }
        }),
        prisma.client.count()
      ]);

      return {
        clients: this.serializeClients(clients),
        total,
        page,
        limit
      };
    }

    const where = {
      OR: [
        { name: { contains: query } },
        { email: { contains: query } },
        { company: { contains: query } },
        { phone: { contains: query } },
        { city: { contains: query } },
        { client_id: { contains: query } }
      ]
    };

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        take: limit,
        skip,
        orderBy: { updated_at: 'desc' }
      }),
      prisma.client.count({ where })
    ]);

    return {
      clients: this.serializeClients(clients),
      total,
      page,
      limit
    };
  }

  serializeClients(clients) {
    return clients.map(c => ({
      ...c,
      id: c.id.toString()
    }));
  }

  async getAllClients(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        take: limit,
        skip,
        orderBy: { updated_at: 'desc' }
      }),
      prisma.client.count()
    ]);

    return {
      clients: this.serializeClients(clients),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}

module.exports = new ClientService();