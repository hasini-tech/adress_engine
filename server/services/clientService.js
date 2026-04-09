const crypto = require('crypto');
const prisma = require('../lib/prisma');

class ClientService {

  constructor() {
    this.ensureQualityColumnsPromise = null;
  }

  createEmptyQualityStats() {
    return {
      scoredRecords: 0,
      totalQualityScore: 0,
      highestQualityScore: null,
      lowestQualityScore: null,
      qualityBands: {
        excellent: 0,
        good: 0,
        fair: 0,
        low: 0
      }
    };
  }

  getQualityBand(score) {
    if (typeof score !== 'number' || Number.isNaN(score)) return 'low';
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    return 'low';
  }

  mergeQualityStats(target, source) {
    if (!source) return;

    target.scoredRecords += source.scoredRecords || 0;
    target.totalQualityScore += source.totalQualityScore || 0;

    if (typeof source.highestQualityScore === 'number') {
      target.highestQualityScore = target.highestQualityScore === null
        ? source.highestQualityScore
        : Math.max(target.highestQualityScore, source.highestQualityScore);
    }

    if (typeof source.lowestQualityScore === 'number') {
      target.lowestQualityScore = target.lowestQualityScore === null
        ? source.lowestQualityScore
        : Math.min(target.lowestQualityScore, source.lowestQualityScore);
    }

    for (const band of Object.keys(target.qualityBands)) {
      target.qualityBands[band] += source.qualityBands?.[band] || 0;
    }
  }

  buildQualitySummary(qualityStats) {
    if (!qualityStats.scoredRecords) {
      return {
        averageQualityScore: null,
        highestQualityScore: null,
        lowestQualityScore: null,
        averageQualityBand: null,
        qualityBands: qualityStats.qualityBands
      };
    }

    const averageQualityScore = Number(
      (qualityStats.totalQualityScore / qualityStats.scoredRecords).toFixed(1)
    );

    return {
      averageQualityScore,
      highestQualityScore: qualityStats.highestQualityScore,
      lowestQualityScore: qualityStats.lowestQualityScore,
      averageQualityBand: this.getQualityBand(averageQualityScore),
      qualityBands: qualityStats.qualityBands
    };
  }

  async ensureQualityColumns() {
    if (!this.ensureQualityColumnsPromise) {
      this.ensureQualityColumnsPromise = (async () => {
        const columns = await prisma.$queryRawUnsafe(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'clients'
            AND COLUMN_NAME IN ('quality_score', 'quality_band')
        `);

        const columnNames = new Set(
          columns.map((column) => column.COLUMN_NAME || column.column_name)
        );

        const missingColumns = [];
        if (!columnNames.has('quality_score')) missingColumns.push('ADD COLUMN quality_score INT NULL');
        if (!columnNames.has('quality_band')) missingColumns.push('ADD COLUMN quality_band VARCHAR(50) NULL');

        for (const clause of missingColumns) {
          try {
            await prisma.$executeRawUnsafe(`ALTER TABLE clients ${clause}`);
          } catch (error) {
            if (!String(error.message).toLowerCase().includes('duplicate')) {
              throw error;
            }
          }
        }
      })().catch((error) => {
        this.ensureQualityColumnsPromise = null;
        throw error;
      });
    }

    return this.ensureQualityColumnsPromise;
  }

  async processBulkImport(clients, importId) {
    await this.ensureQualityColumns();
    if (typeof clients === 'string') return this._processFile(clients, importId);
    return this._processArray(clients, importId);
  }

  _processFile(filePath, importId) {
    return new Promise(async (resolve, reject) => {
      const fs         = require('fs');
      const JSONStream = require('JSONStream');
      const BATCH_SIZE = 500;
      let buffer = [], inserted = 0, updated = 0, failed = 0, total = 0;
      const qualityStats = this.createEmptyQualityStats();
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
          this.mergeQualityStats(qualityStats, r.qualityStats);
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
        try { resolve(await this._finalize(importId, inserted, updated, failed, duration, total, qualityStats)); }
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
    const qualityStats = this.createEmptyQualityStats();

    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE);
      try {
        const r = await this.processBatch(batch, importId);
        inserted += r.inserted; updated += r.updated; failed += r.failed;
        this.mergeQualityStats(qualityStats, r.qualityStats);
        prisma.importLog.update({
          where: { import_id: importId },
          data: { processed: i + batch.length, inserted_records: inserted, updated_records: updated, failed_records: failed }
        }).catch(() => {});
      } catch (e) {
        console.error(`[${importId}] Batch error:`, e.message);
        failed += batch.length;
      }
    }
    return this._finalize(importId, inserted, updated, failed, Date.now() - startTime, clients.length, qualityStats);
  }

  async _finalize(importId, inserted, updated, failed, duration, total, qualityStats = this.createEmptyQualityStats()) {
    const qualitySummary = this.buildQualitySummary(qualityStats);
    await prisma.importLog.update({
      where: { import_id: importId },
      data: {
        status:           failed === 0 ? 'completed' : 'completed_with_errors',
        completed_at:     new Date(),
        duration_ms:      duration,
        total_records:    total,
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
      speed:           `${Math.round(total / Math.max(duration/1000, 1))} records/sec`,
      ...qualitySummary
    };
  }

  async processBatch(records, importId) {
    await this.ensureQualityColumns();
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
    const qualityStats = validRecords.reduce((stats, record) => {
      if (typeof record.qualityScore !== 'number' || Number.isNaN(record.qualityScore)) {
        return stats;
      }

      stats.scoredRecords += 1;
      stats.totalQualityScore += record.qualityScore;
      stats.highestQualityScore = stats.highestQualityScore === null
        ? record.qualityScore
        : Math.max(stats.highestQualityScore, record.qualityScore);
      stats.lowestQualityScore = stats.lowestQualityScore === null
        ? record.qualityScore
        : Math.min(stats.lowestQualityScore, record.qualityScore);
      stats.qualityBands[record.qualityBand] = (stats.qualityBands[record.qualityBand] || 0) + 1;
      return stats;
    }, this.createEmptyQualityStats());

    if (validRecords.length === 0) return { inserted: 0, updated: 0, failed, qualityStats };

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

    await Promise.all(validRecords.map((record) =>
      prisma.$executeRaw`
        UPDATE clients
        SET quality_score = ${record.qualityScore},
            quality_band = ${record.qualityBand}
        WHERE client_id = ${record.client_id}
      `
    ));

    return { inserted: toInsert.length, updated: toUpdate.length, failed, qualityStats };
  }

  pickFirstNonEmpty(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const normalized = String(value).trim();
      if (normalized) return value;
    }
    return null;
  }

  normalizePhone(phone) {
    if (phone === undefined || phone === null) return null;
    const raw = String(phone).trim();
    if (!raw) return null;

    const firstSegment = raw.split('/')[0].trim();
    const normalized = firstSegment.replace(/[^\d+]/g, '');
    return normalized || raw;
  }

  hasMeaningfulValue(value) {
    if (value === undefined || value === null) return false;
    return String(value).trim().length > 0;
  }

  normalizeQualityScore(value) {
    if (value === undefined || value === null || value === '') return null;

    const score = Number(value);
    if (!Number.isFinite(score)) return null;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  looksLikeEmail(value) {
    if (value === undefined || value === null) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(value).trim());
  }

  looksLikePhone(value) {
    if (value === undefined || value === null) return false;

    const raw = String(value).trim();
    if (!raw || !/^\+?[\d\s()/.-]+$/.test(raw)) return false;

    const normalized = this.normalizePhone(value);
    if (!normalized) return false;

    const digits = normalized.replace(/[^\d]/g, '');
    return digits.length >= 8 && digits.length <= 15;
  }

  looksLikePostalCode(value) {
    if (value === undefined || value === null) return false;

    const raw = String(value).trim();
    if (!raw || !/^[\d\s-]+$/.test(raw)) return false;

    const digits = raw.replace(/\D/g, '');
    return digits.length >= 5 && digits.length <= 7;
  }

  looksLikePersonText(value) {
    if (value === undefined || value === null) return false;

    const text = String(value).trim();
    if (!text || text.length > 60) return false;
    if (/\d/.test(text)) return false;
    if (!/[A-Za-z]/.test(text)) return false;
    if (/[<>@]/.test(text)) return false;
    if (/courier|parcel|payment|razorpay|phonepe|gateway|tracking|barcode|weight|document|merged|print|order|shipping/i.test(text)) {
      return false;
    }

    return /^[A-Za-z][A-Za-z .,'&()/-]*$/.test(text);
  }

  looksLikePersonKey(key) {
    if (key === undefined || key === null) return false;

    const text = String(key).trim();
    if (!text || text.length > 30) return false;
    if (text.startsWith('__EMPTY')) return false;
    if (/\d/.test(text)) return false;
    if (!/[A-Za-z]/.test(text)) return false;
    if (/courier|parcel|payment|razorpay|phonepe|gateway|tracking|barcode|weight|document|merged|print|order|address|country|postcode|zip|shipping|email|phone/i.test(text)) {
      return false;
    }
    if (/^[A-Z]{2,3}$/.test(text)) return false;

    return /^[A-Za-z][A-Za-z .,'&()/-]*$/.test(text);
  }

  looksLikeAddressKey(key) {
    if (key === undefined || key === null) return false;

    const text = String(key).trim();
    if (!text) return false;
    if (text.startsWith('__EMPTY')) return true;
    if (/billing address|address/i.test(text)) return true;
    if (/\sx\s\d+/i.test(text)) return false;
    if (/pack|powder|oil|brush|tooth|loofah|hydrosol|mask|bowl|spoon|tea|soap/i.test(text)) return false;

    return /[A-Za-z]/.test(text) && /\d/.test(text) && text.length >= 8;
  }

  looksLikeAddressValue(value) {
    if (value === undefined || value === null) return false;

    const text = String(value).trim();
    if (!text || text.length < 5) return false;
    if (this.looksLikeEmail(text) || /^https?:/i.test(text)) return false;

    return /[A-Za-z]/.test(text) && (/\d/.test(text) || /,|\n|#|-/.test(text) || text.length > 20);
  }

  findEntryValue(raw, predicate) {
    for (const [key, value] of Object.entries(raw || {})) {
      if (!this.hasMeaningfulValue(value)) continue;
      if (predicate(key, value)) return value;
    }

    return null;
  }

  inferSpreadsheetFallback(raw) {
    const entries = Object.entries(raw || {}).filter(([, value]) => this.hasMeaningfulValue(value));

    const email = this.findEntryValue(raw, (_key, value) => this.looksLikeEmail(value));

    const phoneEntries = entries.filter(([_key, value]) => this.looksLikePhone(value));
    const preferredPhoneEntry = phoneEntries.find(([key]) =>
      /phone/i.test(String(key)) || /^\d{8,}$/.test(String(key).trim()) || this.looksLikePhone(key)
    );
    const phone = preferredPhoneEntry?.[1] ?? phoneEntries[0]?.[1] ?? null;

    const personLikeEntries = entries.filter(([key, value]) =>
      this.looksLikePersonKey(key) && this.looksLikePersonText(value)
    );

    const nameParts = personLikeEntries
      .slice(0, 2)
      .map(([, value]) => String(value).trim())
      .filter(Boolean);
    const name = nameParts.length > 0 ? nameParts.join(' ').trim() : null;

    const cityCandidate = personLikeEntries
      .slice(nameParts.length > 0 ? 2 : 0)
      .find(([key]) => String(key).trim().length > 2);
    const city = cityCandidate?.[1] ?? null;

    const stateEntry = entries.find(([key, value]) =>
      (/^state$/i.test(String(key).trim()) || /^[A-Z]{2,3}$/.test(String(key).trim())) &&
      this.hasMeaningfulValue(value)
    );
    const state = stateEntry?.[1] ?? null;

    const addressEntries = entries.filter(([key, value]) =>
      this.looksLikeAddressKey(key) && this.looksLikeAddressValue(value)
    );
    const address1 = addressEntries[0]?.[1] ?? null;
    const address2 = addressEntries[1]?.[1] ?? null;

    const postalEntries = entries.filter(([_key, value]) => this.looksLikePostalCode(value));
    const preferredPostalEntry = postalEntries.find(([key]) =>
      /post|zip/i.test(String(key)) || /^\d{6,7}$/.test(String(key).trim())
    );
    const postal_code = preferredPostalEntry?.[1] ?? postalEntries[0]?.[1] ?? null;

    const countryEntry = entries.find(([key, value]) =>
      /^__EMPTY$/i.test(String(key).trim()) &&
      /^(india|indian|bharat|in)$/i.test(String(value).trim()) &&
      !/completed|pending|processing|cancelled|failed|courier|parcel|payment/i.test(String(value).trim())
    );
    const country = countryEntry?.[1] ?? null;

    return {
      name,
      email,
      phone,
      address1,
      address2,
      city,
      state,
      postal_code,
      country
    };
  }

  calculateQualityScore(fields) {
    const weights = {
      name: 20,
      email: 20,
      phone: 15,
      company: 5,
      address: 15,
      city: 10,
      state: 5,
      country: 5,
      postal_code: 5
    };

    let score = 0;

    for (const [field, weight] of Object.entries(weights)) {
      if (this.hasMeaningfulValue(fields[field])) score += weight;
    }

    return {
      score,
      band: this.getQualityBand(score)
    };
  }

  buildClientId(raw, email, phone, name) {
    const explicitId = this.pickFirstNonEmpty(
      raw._id && typeof raw._id === 'object' ? raw._id.$oid : raw._id,
      raw.client_id,
      raw.clientId,
      raw.id
    );
    if (explicitId) return String(explicitId);

    const emailValue = email ? String(email).toLowerCase().trim() : '';
    if (emailValue) {
      return `EMAIL_${crypto.createHash('md5').update(emailValue).digest('hex')}`;
    }

    const normalizedPhone = this.normalizePhone(phone);
    if (normalizedPhone) {
      return `PHONE_${normalizedPhone.replace(/[^\d+]/g, '').slice(0, 40)}`;
    }

    const orderId = this.pickFirstNonEmpty(raw['Order ID'], raw.orderId, raw.order_id);
    if (orderId) {
      return `ORDER_${String(orderId)}`;
    }

    const fallbackBase = this.pickFirstNonEmpty(name, raw['Billing Email'], raw['Billing First name']);
    if (fallbackBase) {
      return `CLI_${crypto.createHash('md5').update(String(fallbackBase)).digest('hex')}`;
    }

    return `CLI_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  // ── Extract fields from MongoDB exports and order-sheet JSON exports ─────
  // Mongo-style:  phone, originalPhone, customerName, email, tenantName
  // Nested:       billingAddress.{ address1, address2, city, state, postcode, country, company }
  // Order-sheet:  Billing First name, Billing Last name, Billing Email, Billing Address 1, Order ID
  transformRecord(raw, importId) {
    if (!raw || typeof raw !== 'object') return null;
    const spreadsheetFallback = this.inferSpreadsheetFallback(raw);

    // ── Name ──────────────────────────────────────────────────────────────
    let name = this.pickFirstNonEmpty(
      raw.customerName,
      raw.customer_name,
      raw.name,
      raw['Billing Name']
    );
    if (!name) {
      const first = this.pickFirstNonEmpty(raw['Billing First name'], raw['First Name']);
      const last = this.pickFirstNonEmpty(raw['Billing Last name'], raw['Last Name']);
      if (first || last) {
        name = [first, last].filter(Boolean).join(' ').trim();
      }
    }
    if (!name) {
      const b = raw.billingAddress || raw.shippingAddress || {};
      const first = b.firstName || b.first_name || '';
      const last  = b.lastName  || b.last_name  || '';
      if (first || last) name = `${first} ${last}`.trim();
    }

    // ── Phone ─────────────────────────────────────────────────────────────
    const phone = this.normalizePhone(
      this.pickFirstNonEmpty(
        raw.phone,
        raw.originalPhone,
        raw['Phone'],
        raw['Billing Phone'],
        raw.billingAddress && raw.billingAddress.phone,
        raw.shippingAddress && raw.shippingAddress.phone,
        spreadsheetFallback.phone
      )
    );

    // ── Email ─────────────────────────────────────────────────────────────
    const email = this.pickFirstNonEmpty(
      raw.email,
      raw['Billing Email'],
      raw['Email'],
      raw.billingAddress && raw.billingAddress.email,
      raw.shippingAddress && raw.shippingAddress.email,
      spreadsheetFallback.email
    );

    if (!name) {
      name = this.pickFirstNonEmpty(
        spreadsheetFallback.name,
        email ? String(email).split('@')[0].replace(/[._-]+/g, ' ') : null,
        phone ? `Phone ${String(phone).slice(-4)}` : null
      );
    }
    if (!name) return null;

    // ── Nested address objects ────────────────────────────────────────────
    const b = (raw.billingAddress  && typeof raw.billingAddress  === 'object') ? raw.billingAddress  : {};
    const s = (raw.shippingAddress && typeof raw.shippingAddress === 'object') ? raw.shippingAddress : {};

    const clientId = this.buildClientId(raw, email, phone, name);

    // Company
    const company = this.pickFirstNonEmpty(
      b.company,
      raw.tenantName,
      s.company,
      raw.company,
      raw['Company'],
      raw['Billing Company']
    );

    // Address — combine address1 + address2
    const addr1 = this.pickFirstNonEmpty(
      b.address1,
      s.address1,
      raw.address,
      raw['Billing Address 1'],
      raw['Address 1'],
      raw['Address'],
      spreadsheetFallback.address1
    ) || '';
    const addr2 = this.pickFirstNonEmpty(
      b.address2,
      s.address2,
      raw['Billing Address 2'],
      raw['Address 2'],
      spreadsheetFallback.address2
    ) || '';
    const address = [addr1, addr2].filter(x => x && String(x).trim()).join(', ').trim() || null;

    // City
    const city = this.pickFirstNonEmpty(
      b.city,
      s.city,
      raw.city,
      raw['City'],
      raw['Billing City'],
      spreadsheetFallback.city
    );

    // State
    const state = this.pickFirstNonEmpty(
      b.state,
      s.state,
      raw.state,
      raw['State'],
      raw['Billing State'],
      spreadsheetFallback.state
    );

    // Country
    const country = this.pickFirstNonEmpty(
      b.country,
      s.country,
      raw.country,
      raw.countryCode,
      raw['Country'],
      raw['Billing Country'],
      raw['Country Code'],
      spreadsheetFallback.country
    );

    // Postal code — your field is "postcode"
    const postal_code = this.pickFirstNonEmpty(
      b.postcode,
      b.postal_code,
      b.zip,
      b.zipCode,
      s.postcode,
      s.postal_code,
      s.zip,
      s.zipCode,
      raw.postcode,
      raw.postal_code,
      raw.zip,
      raw.zipCode,
      raw['Postcode'],
      raw['Postal Code'],
      spreadsheetFallback.postal_code
    );

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
    if (raw['Order ID'])     meta.orderId         = raw['Order ID'];
    if (raw['Order'])        meta.order           = raw['Order'];
    if (raw['Date'])         meta.orderDate       = raw['Date'];
    if (raw['Total'] != null) meta.total          = raw['Total'];
    if (raw['Shipping'] != null) meta.shipping    = raw['Shipping'];
    if (raw['Shipping Method']) meta.shippingMethod = raw['Shipping Method'];
    if (raw['Gateway'])      meta.gateway         = raw['Gateway'];
    if (raw['Tracking'])     meta.tracking        = raw['Tracking'];
    if (raw['Weight'] != null) meta.weight        = raw['Weight'];
    if (raw['Barcode'])      meta.barcode         = raw['Barcode'];
    if (raw['Print'])        meta.print           = raw['Print'];
    if (raw['Customer Note']) meta.customerNote   = raw['Customer Note'];
    if (raw['Document Merge Status - Print Order']) meta.documentMergeStatus = raw['Document Merge Status - Print Order'];
    if (raw['Merged Doc URL - Print Order']) meta.mergedDocUrl = raw['Merged Doc URL - Print Order'];

    const quality = this.calculateQualityScore({
      name,
      email,
      phone,
      company,
      address,
      city,
      state,
      country,
      postal_code
    });

    meta.qualityScore = quality.score;
    meta.qualityBand = quality.band;

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
      qualityScore: quality.score,
      qualityBand: quality.band,
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
    return clients.map(c => {
      const metadata = c.metadata && typeof c.metadata === 'object' ? c.metadata : null;
      const qualityScore = this.normalizeQualityScore(
        c.quality_score ?? metadata?.qualityScore ?? metadata?.quality_score
      );

      return {
        ...c,
        id: c.id.toString(),
        qualityScore,
        qualityBand: c.quality_band || metadata?.qualityBand || metadata?.quality_band || (qualityScore !== null ? this.getQualityBand(qualityScore) : null)
      };
    });
  }
}

module.exports = new ClientService();
