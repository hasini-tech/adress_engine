const crypto = require('crypto');
const prisma = require('../lib/prisma');
const DataValidator = require('../utils/validators');

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

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  normalizeLookupKey(value) {
    if (!this.hasMeaningfulValue(value)) return '';
    return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  isConnectionPoolTimeout(error) {
    const message = String(error?.message || error || '');
    return /Timed out fetching a new connection from the connection pool/i.test(message);
  }

  isUniqueConstraintError(error) {
    const message = String(error?.message || error || '');
    return error?.code === 'P2002' || /Unique constraint failed/i.test(message);
  }

  async withDatabaseRetry(operation, { label = 'database operation', retries = 3, baseDelayMs = 250 } = {}) {
    let attempt = 0;

    while (true) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isConnectionPoolTimeout(error) || attempt >= retries) {
          throw error;
        }

        const waitMs = baseDelayMs * (2 ** attempt);
        attempt += 1;
        console.warn(`[${label}] connection pool timeout, retrying in ${waitMs}ms (${attempt}/${retries})`);
        await this.sleep(waitMs);
      }
    }
  }

  async runWithConcurrency(items, concurrency, handler) {
    if (!Array.isArray(items) || items.length === 0) return;

    const limit = Math.max(1, Math.min(concurrency || 1, items.length));
    let index = 0;

    const workers = Array.from({ length: limit }, async () => {
      while (index < items.length) {
        const currentIndex = index++;
        if (currentIndex >= items.length) return;
        await handler(items[currentIndex], currentIndex);
      }
    });

    await Promise.all(workers);
  }

  buildClientWriteData(record, importId) {
    return {
      client_id:   record.client_id,
      name:        record.name,
      email:       record.email,
      phone:       record.phone,
      company:     record.company,
      address:     record.address,
      city:        record.city,
      state:       record.state,
      country:     record.country,
      postal_code: record.postal_code,
      quality_score: record.qualityScore,
      quality_band:  record.qualityBand,
      metadata:    record.metadata ?? undefined,
      is_active:   true,
      import_id:   importId
    };
  }

  readFilePreview(filePath, maxBytes = 32768) {
    const fs = require('fs');
    const fd = fs.openSync(filePath, 'r');

    try {
      const size = Math.max(1, maxBytes);
      const buffer = Buffer.alloc(size);
      const bytesRead = fs.readSync(fd, buffer, 0, size, 0);
      return buffer.toString('utf8', 0, bytesRead);
    } finally {
      fs.closeSync(fd);
    }
  }

  isLikelyWordPressBackup(preview) {
    const text = String(preview || '');
    return /^#\s*WordPress MySQL database backup/i.test(text) ||
      /^#\s*Created by UpdraftPlus/i.test(text) ||
      /^--\s*WordPress database dump/i.test(text) ||
      /\bINSERT INTO\s+`?wp_/i.test(text) ||
      /\bCREATE TABLE\s+`?wp_/i.test(text);
  }

  detectRootArrayKey(preview) {
    const text = String(preview || '');

    for (const key of ['clients', 'records', 'data']) {
      const matcher = new RegExp(`["']${key}["']\\s*:\\s*\\[`, 'i');
      if (matcher.test(text)) {
        return key;
      }
    }

    const genericMatch = text.match(/["']([^"']+)["']\s*:\s*\[\s*\{/);
    if (genericMatch) {
      return genericMatch[1];
    }

    return null;
  }

  validateImportPreview(filePath) {
    const preview = this.readFilePreview(filePath);
    const trimmed = preview.replace(/^\uFEFF/, '').trimStart();

    if (!trimmed) {
      throw new Error('Uploaded file is empty.');
    }

    if (this.isLikelyWordPressBackup(trimmed)) {
      throw new Error('Uploaded file looks like a WordPress database backup, not a JSON client export.');
    }

    const firstChar = trimmed[0];
    if (firstChar !== '[' && firstChar !== '{') {
      throw new Error('Invalid import file. Expected a JSON array or object.');
    }

    return {
      firstChar,
      preview: trimmed
    };
  }

  async ensureQualityColumns() {
    if (!this.ensureQualityColumnsPromise) {
      this.ensureQualityColumnsPromise = (async () => {
        const columns = await this.withDatabaseRetry(
          () => prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'clients'
              AND COLUMN_NAME IN ('quality_score', 'quality_band')
          `),
          { label: 'ensureQualityColumns lookup' }
        );

        const columnNames = new Set(
          columns.map((column) => column.COLUMN_NAME || column.column_name)
        );

        const missingColumns = [];
        if (!columnNames.has('quality_score')) missingColumns.push('ADD COLUMN quality_score INT NULL');
        if (!columnNames.has('quality_band')) missingColumns.push('ADD COLUMN quality_band VARCHAR(50) NULL');

        for (const clause of missingColumns) {
          try {
            await this.withDatabaseRetry(
              () => prisma.$executeRawUnsafe(`ALTER TABLE clients ${clause}`),
              { label: `ensureQualityColumns ${clause}` }
            );
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

  async processBulkImport(clients, importId, fieldMappings = null) {
    await this.ensureQualityColumns();
    if (typeof clients === 'string') return this._processFile(clients, importId, fieldMappings);
    return this._processArray(clients, importId, fieldMappings);
  }

  _processFile(filePath, importId, fieldMappings = null) {
    return new Promise(async (resolve, reject) => {
      const fs         = require('fs');
      const JSONStream = require('JSONStream');
      const BATCH_SIZE = 500;
      let buffer = [], inserted = 0, updated = 0, failed = 0, total = 0, scanned = 0;
      const qualityStats = this.createEmptyQualityStats();
      const startTime = Date.now();
      let sampleLogged = false;
      let finished = false;
      let detectedFieldMappings = fieldMappings;
      const sampleRecords = [];
      const pendingBatchPromises = new Set();

      const trackBatchPromise = (promise) => {
        pendingBatchPromises.add(promise);
        promise.finally(() => {
          pendingBatchPromises.delete(promise);
        });
        return promise;
      };

      let filePreview;
      let firstChar;
      try {
        ({ firstChar, preview: filePreview } = this.validateImportPreview(filePath));
      } catch (error) {
        reject(error);
        return;
      }

      const rootKey = firstChar === '[' ? null : this.detectRootArrayKey(filePreview);
      const parser = firstChar === '['
        ? JSONStream.parse([true])
        : rootKey
          ? JSONStream.parse([rootKey, true])
          : JSONStream.parse([true, true]);

      if (firstChar !== '[' && !rootKey) {
        console.warn(`[${importId}] No explicit root array key detected; using a generic top-level array scan.`);
      }
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });

      const processBatch = async (batch) => {
        try {
          const r = await this.processBatch(batch, importId, detectedFieldMappings);
          inserted += r.inserted; updated += r.updated; failed += r.failed;
          this.mergeQualityStats(qualityStats, r.qualityStats);
        } catch (e) {
          console.error(`[${importId}] Batch error:`, e.message);
          failed += batch.length;
        }
      };

      const ingestParsedValue = (value) => {
        if (Array.isArray(value)) {
          for (const item of value) {
            ingestParsedValue(item);
          }
          return;
        }

        if (!value || typeof value !== 'object') {
          return;
        }

        const transformed = this.transformRecord(value, importId, detectedFieldMappings);
        const nestedChildren = Object.values(value).filter((child) => child && typeof child === 'object');

        if (!transformed && nestedChildren.length > 0) {
          for (const nested of nestedChildren) {
            ingestParsedValue(nested);
          }
          return;
        }

        if (this.isIgnorableRecord(value)) {
          return;
        }

        scanned++;

        if (!detectedFieldMappings && value && typeof value === 'object' && !Array.isArray(value)) {
          sampleRecords.push(value);
          if (sampleRecords.length >= 5) {
            detectedFieldMappings = DataValidator.detectFieldMappings(sampleRecords);
          }
        }

        if (!sampleLogged) {
          console.log('\n========== FIRST RECORD TRANSFORMED ==========');
          console.log(JSON.stringify(transformed, null, 2));
          if (!transformed) {
            console.warn(`[${importId}] First parsed record did not map to a client record.`);
          }
          console.log('==============================================\n');
          sampleLogged = true;
        }

        total++;
        buffer.push(value);
        if (buffer.length >= BATCH_SIZE) {
          parser.pause();
          const batch = buffer.splice(0, BATCH_SIZE);
          const batchPromise = processBatch(batch)
            .then(() => {
              return prisma.importLog.update({
                where: { import_id: importId },
                data: { processed: scanned, inserted_records: inserted, updated_records: updated, failed_records: failed }
              }).catch(() => {});
            })
            .finally(() => {
              if (!finished) parser.resume();
            });

          trackBatchPromise(batchPromise);
        }
      };

      const finalizeImport = async (warningMessage = null) => {
        if (finished) return null;
        finished = true;

        if (!detectedFieldMappings && sampleRecords.length > 0) {
          detectedFieldMappings = DataValidator.detectFieldMappings(sampleRecords);
        }

        if (buffer.length > 0) {
          const remaining = buffer.splice(0, buffer.length);
          await processBatch(remaining);
        }

        if (pendingBatchPromises.size > 0) {
          await Promise.allSettled([...pendingBatchPromises]);
        }

        if (!warningMessage) {
          if (scanned === 0) {
            warningMessage = 'No JSON records were found in the uploaded file. Check the root array/object structure.';
          } else if (scanned > 0 && total === 0) {
            warningMessage = 'No valid client records were found in the uploaded file.';
          } else if (total > 0 && inserted === 0 && updated === 0) {
            warningMessage = 'No valid client records were found in the uploaded file.';
          }
        }

        const duration = Date.now() - startTime;
        return this._finalize(importId, inserted, updated, failed, duration, total, qualityStats, warningMessage);
      };

      parser.on('data', ingestParsedValue);

      parser.on('end', async () => {
        try { resolve(await finalizeImport()); }
        catch (e) { reject(e); }
      });

      parser.on('error', async (err) => {
        if (this.isRecoverableTrailingSheetError(err, firstChar, scanned, total)) {
          const warningMessage = 'Ignored trailing workbook sheet data after the first client array.';
          console.warn(`[${importId}] ${warningMessage}`);
          try { resolve(await finalizeImport(warningMessage)); }
          catch (e) { reject(e); }
          return;
        }

        reject(new Error(`JSON parse failed: ${err.message}`));
      });
      stream.on('error', reject);
      stream.pipe(parser);
    });
  }

  async _processArray(clients, importId, fieldMappings = null) {
    const BATCH_SIZE = 500, startTime = Date.now();
    let inserted = 0, updated = 0, failed = 0;
    const qualityStats = this.createEmptyQualityStats();
    const detectedFieldMappings = fieldMappings || (
      clients.length > 0
        ? DataValidator.detectFieldMappings(clients.slice(0, 10))
        : null
    );
    const importableClients = clients.filter((record) => !this.isIgnorableRecord(record));
    const warningMessage = clients.length > 0 && importableClients.length === 0
      ? 'No valid client records were found in the uploaded data.'
      : null;

    for (let i = 0; i < importableClients.length; i += BATCH_SIZE) {
      const batch = importableClients.slice(i, i + BATCH_SIZE);
      try {
        const r = await this.processBatch(batch, importId, detectedFieldMappings);
        inserted += r.inserted; updated += r.updated; failed += r.failed;
        this.mergeQualityStats(qualityStats, r.qualityStats);
        await prisma.importLog.update({
          where: { import_id: importId },
          data: { processed: i + batch.length, inserted_records: inserted, updated_records: updated, failed_records: failed }
        }).catch(() => {});
      } catch (e) {
        console.error(`[${importId}] Batch error:`, e.message);
        failed += batch.length;
      }
    }
    return this._finalize(
      importId,
      inserted,
      updated,
      failed,
      Date.now() - startTime,
      importableClients.length,
      qualityStats,
      warningMessage
    );
  }

  async _finalize(importId, inserted, updated, failed, duration, total, qualityStats = this.createEmptyQualityStats(), warningMessage = null) {
    const qualitySummary = this.buildQualitySummary(qualityStats);
    await prisma.importLog.update({
      where: { import_id: importId },
      data: {
        status:           failed === 0 && !warningMessage ? 'completed' : 'completed_with_errors',
        completed_at:     new Date(),
        duration_ms:      duration,
        total_records:    total,
        inserted_records: inserted,
        updated_records:  updated,
        failed_records:   failed,
        error_message:    warningMessage,
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
      warning:         warningMessage,
      ...qualitySummary
    };
  }

  async processBatch(records, importId, fieldMappings = null) {
    await this.ensureQualityColumns();
    const validRecords = [];
    let failed = 0;
    for (const record of records) {
      try {
        const t = this.transformRecord(record, importId, fieldMappings);
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
    const existing    = await this.withDatabaseRetry(() => prisma.client.findMany({
      where: { client_id: { in: clientIds } },
      select: { client_id: true }
    }), { label: `[${importId}] client lookup` });
    const existingSet = new Set(existing.map(e => e.client_id));
    const toInsert    = validRecords.filter(r => !existingSet.has(r.client_id));
    const toUpdate    = validRecords.filter(r =>  existingSet.has(r.client_id));
    let inserted = 0;
    let updated = 0;

    if (toInsert.length > 0) {
      const insertChunkSize = 100;
      for (let i = 0; i < toInsert.length; i += insertChunkSize) {
        const chunk = toInsert.slice(i, i + insertChunkSize);
        const payload = chunk.map((record) => this.buildClientWriteData(record, importId));

        try {
          const result = await this.withDatabaseRetry(
            () => prisma.client.createMany({
              data: payload,
              skipDuplicates: true
            }),
            { label: `[${importId}] client.createMany` }
          );
          inserted += result?.count ?? payload.length;
        } catch (error) {
          console.warn(`[${importId}] Bulk insert failed for ${chunk.length} records, retrying individually:`, error.message);
          await this.runWithConcurrency(payload, 3, async (data) => {
            try {
              await this.withDatabaseRetry(
                () => prisma.client.create({ data }),
                { label: `[${importId}] client.create ${data.client_id}` }
              );
              inserted += 1;
            } catch (fallbackError) {
              if (this.isUniqueConstraintError(fallbackError)) {
                return;
              }

              console.error(`[${importId}] Insert failed for ${data.client_id}:`, fallbackError.message);
              failed += 1;
            }
          });
        }
      }
    }

    if (toUpdate.length > 0) {
      await this.runWithConcurrency(toUpdate, 3, async (record) => {
        try {
          const result = await this.withDatabaseRetry(
            () => prisma.client.updateMany({
              where: { client_id: record.client_id },
              data: this.buildClientWriteData(record, importId)
            }),
            { label: `[${importId}] client.updateMany ${record.client_id}` }
          );
          updated += result?.count ?? 0;
        } catch (error) {
          console.error(`[${importId}] Update failed for ${record.client_id}:`, error.message);
          failed += 1;
        }
      });
    }

    return { inserted, updated, failed, qualityStats };
  }

  getMappedValue(raw, fieldMappings, fieldName) {
    const mappings = fieldMappings?.mappings || fieldMappings;
    const mappedField = mappings?.[fieldName];
    if (!mappedField) return null;

    const value = this.getRawValue(raw, mappedField);
    return this.hasMeaningfulValue(value) ? value : null;
  }

  getRawValue(raw, ...fieldNames) {
    if (!raw || typeof raw !== 'object') return null;

    const normalizedEntries = Object.entries(raw).map(([key, value]) => [this.normalizeLookupKey(key), value]);

    for (const fieldName of fieldNames) {
      if (!this.hasMeaningfulValue(fieldName)) continue;

      const directValue = raw[fieldName];
      if (this.hasMeaningfulValue(directValue) && typeof directValue !== 'object' && typeof directValue !== 'boolean') {
        return directValue;
      }

      const normalizedFieldName = this.normalizeLookupKey(fieldName);
      if (!normalizedFieldName) continue;

      for (const [normalizedKey, value] of normalizedEntries) {
        if (
          normalizedKey === normalizedFieldName &&
          this.hasMeaningfulValue(value) &&
          typeof value !== 'object' &&
          typeof value !== 'boolean'
        ) {
          return value;
        }
      }
    }

    return null;
  }

  pickFirstNonEmpty(...values) {
    for (const value of values) {
      if (!this.hasMeaningfulValue(value)) continue;
      return value;
    }
    return null;
  }

  normalizePhone(phone) {
    if (!this.hasMeaningfulValue(phone)) return null;
    const raw = String(phone).trim();

    const firstSegment = raw.split('/')[0].trim();
    const normalized = firstSegment.replace(/[^\d+]/g, '');
    return normalized || raw;
  }

  isPlaceholderValue(value) {
    if (value === undefined || value === null) return true;

    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return true;

    return ['#n/a', '#ref!', 'n/a', 'na', 'null', 'undefined'].includes(normalized);
  }

  hasMeaningfulValue(value) {
    return !this.isPlaceholderValue(value);
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

  looksLikeStateCode(value) {
    if (!this.hasMeaningfulValue(value)) return false;

    return /^[A-Za-z]{2,3}$/.test(String(value).trim());
  }

  looksLikeOrderText(value) {
    if (!this.hasMeaningfulValue(value)) return false;

    const text = String(value).trim();
    if (text.length < 8 || this.looksLikeEmail(text)) return false;

    return /( x \d+|oil|pack|powder|brush|tooth|loofah|hydrosol|mask|soap|comb|scrub|tea|bowl|spoon|jaggery|cleanser|shikakai|henna|indigo|amla|sesame|coconut|castor|flax|almond|papaya|banana|hibiscus)/i.test(text);
  }

  looksLikeSpreadsheetSerialDate(value) {
    if (!this.hasMeaningfulValue(value)) return false;

    const numericValue = Number(value);
    return Number.isInteger(numericValue) && numericValue >= 30000 && numericValue <= 60000;
  }

  looksLikePersonText(value) {
    if (value === undefined || value === null) return false;

    const text = String(value).trim();
    if (!text || text.length > 60) return false;
    if (/\d/.test(text)) return false;
    if (!/[A-Za-z]/.test(text)) return false;
    if (this.looksLikeStateCode(text) || this.looksLikePostalCode(text) || this.looksLikeSpreadsheetSerialDate(text)) {
      return false;
    }
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
    if (/(^|_)id$/i.test(text)) return false;
    if (!/[A-Za-z]/.test(text)) return false;
    if (/courier|parcel|payment|razorpay|phonepe|gateway|tracking|barcode|weight|document|merged|print|order|address|city|town|village|district|state|province|region|country|postcode|postal|zip|shipping|email|phone|location|area|county|mandal|taluka|taluk|pincode/i.test(text)) {
      return false;
    }
    if (/^[A-Z]{2,3}$/.test(text)) return false;

    return /^[A-Za-z][A-Za-z .,'&()/_-]*$/.test(text);
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
    if (this.looksLikeSpreadsheetSerialDate(text) || this.looksLikePhone(text)) return false;
    if (this.looksLikeEmail(text) || /^https?:/i.test(text)) return false;

    return /[A-Za-z]/.test(text) && (/\d/.test(text) || /,|\n|#|-/.test(text) || text.length > 20);
  }

  isAuxiliaryOnlyField(key) {
    if (key === undefined || key === null) return false;

    return /^(razorpay|phonepe|tracking|weight|barcode)$/i.test(String(key).trim()) ||
      /merged doc|link to merged doc|document merge status|print order|print$/i.test(String(key).trim());
  }

  isIgnorableRecord(raw) {
    if (!raw || typeof raw !== 'object') return true;

    const meaningfulEntries = Object.entries(raw).filter(([, value]) => this.hasMeaningfulValue(value));
    if (meaningfulEntries.length === 0) return true;

    if (meaningfulEntries.every(([, value]) => typeof value === 'number' || typeof value === 'bigint')) {
      return true;
    }

    if (this.looksLikeLogisticsManifestRecord(raw, meaningfulEntries)) return true;

    return meaningfulEntries.every(([key]) => this.isAuxiliaryOnlyField(key));
  }

  isContainerMetadataKey(key) {
    if (key === undefined || key === null) return false;

    const normalizedKey = this.normalizeLookupKey(key);
    if (!normalizedKey) return false;

    return /^(sourcefile|sourcetype|generatedutc|generatedat|generatedon|containscustomerdata|exportedtables|rowcounts|tables|metadata|meta|summary)$/.test(normalizedKey) ||
      /^(table|tables|rows|records|data)$/.test(normalizedKey) ||
      /source(file|type)|generated|rowcounts?|exportedtables?|containscustomerdata/.test(normalizedKey);
  }

  shouldTraverseNestedRecords(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;

    const meaningfulEntries = Object.entries(raw).filter(([, value]) => this.hasMeaningfulValue(value));
    if (meaningfulEntries.length === 0) return false;

    const hasCollectionChildren = meaningfulEntries.some(([, value]) => value && typeof value === 'object');
    if (!hasCollectionChildren) return false;

    const hasKnownNestedCollections = meaningfulEntries.some(([key, value]) => {
      if (!this.isContainerMetadataKey(key) || !value || typeof value !== 'object') return false;

      if (Array.isArray(value)) {
        return value.some((entry) => entry && typeof entry === 'object');
      }

      return Object.values(value).some((entry) =>
        Array.isArray(entry)
          ? entry.some((nested) => nested && typeof nested === 'object')
          : !!entry && typeof entry === 'object'
      );
    });

    if (hasKnownNestedCollections) return true;

    const scalarEntries = meaningfulEntries.filter(([, value]) => !value || typeof value !== 'object');
    if (scalarEntries.length > 0 && scalarEntries.every(([key]) => this.isContainerMetadataKey(key))) {
      return true;
    }

    const hasClientSignals = meaningfulEntries.some(([key, value]) => {
      if (value && typeof value === 'object') return false;

      const normalizedKey = this.normalizeLookupKey(key);
      if (!normalizedKey) return false;
      if (this.isContainerMetadataKey(key)) return false;

      if (/client|customer|name|email|phone|address|city|state|country|postcode|postal|zip|company|order|first|last|billing|shipping|username|userid/.test(normalizedKey)) {
        return true;
      }

      return this.looksLikeEmail(value) ||
        this.looksLikePhone(value) ||
        this.looksLikePostalCode(value) ||
        this.looksLikeStateCode(value) ||
        this.looksLikePersonText(value) ||
        this.looksLikeAddressValue(value);
    });

    return hasCollectionChildren && !hasClientSignals;
  }

  looksLikeLogisticsManifestRecord(raw, meaningfulEntries = null) {
    if (!raw || typeof raw !== 'object') return false;

    const entries = meaningfulEntries || Object.entries(raw).filter(([, value]) => this.hasMeaningfulValue(value));
    if (entries.length === 0) return false;

    const normalizedKeys = entries.map(([key]) => String(key).trim().toLowerCase());
    const manifestKeys = new Set([
      's.no',
      'date',
      'bkg numbr',
      'destination',
      'weight',
      'amount',
      'weight vv',
      'amount according tariff'
    ]);

    const hasClientField = normalizedKeys.some((key) =>
      /billing|customer|email|phone|address|city|state|postcode|postal|country|tenant|company|order/.test(key)
    );
    if (hasClientField) return false;

    const hasStrongManifestKey = normalizedKeys.some((key) =>
      key === 's.no' || key === 'destination' || key === 'bkg numbr' || key === 'weight vv' || key === 'amount according tariff'
    );
    const hasOnlyManifestColumns = normalizedKeys.every((key) =>
      manifestKeys.has(key) || /^column\d+$/i.test(key) || this.isAuxiliaryOnlyField(key)
    );
    if (!hasOnlyManifestColumns) return false;

    if (hasStrongManifestKey) return true;

    return normalizedKeys.every((key) => key === 'date' || key === 'destination' || /^column\d+$/i.test(key));
  }

  isRecoverableTrailingSheetError(error, firstChar, scanned, total) {
    if (firstChar !== '[' || scanned === 0 || total === 0) return false;

    const message = String(error?.message || error || '');
    return /Unexpected COMMA\(",\"\) in state VALUE/i.test(message);
  }

  normalizeCompanyCandidate(value, phone = null) {
    if (!this.hasMeaningfulValue(value)) return null;

    const text = String(value).trim();
    const normalizedPhone = this.normalizePhone(phone);
    if (this.looksLikePhone(text)) return null;
    if (normalizedPhone && this.normalizePhone(text) === normalizedPhone) return null;
    if (!/[A-Za-z]/.test(text)) return null;
    if (/^<a\s/i.test(text)) return null;

    return text;
  }

  pickMeaningfulCompany(phone, ...values) {
    for (const value of values) {
      const company = this.normalizeCompanyCandidate(value, phone);
      if (company) return company;
    }

    return null;
  }

  normalizeAddressSegment(value) {
    if (!this.hasMeaningfulValue(value)) return null;
    if (this.looksLikeSpreadsheetSerialDate(value) || this.looksLikePhone(value)) return null;

    const text = String(value).replace(/^[,\s]+|[,\s]+$/g, '').trim();
    return text || null;
  }

  looksLikeShiftedOrderExport(raw) {
    if (!raw || typeof raw !== 'object') return false;

    return this.looksLikeEmail(raw['Order']) &&
      !this.looksLikeEmail(raw['Billing Email']) &&
      this.looksLikeOrderText(raw['Billing First name']) &&
      (this.looksLikePhone(raw['Billing Address 1']) || this.looksLikePhone(raw['Customer Note'])) &&
      this.looksLikePostalCode(raw['Phone']) &&
      this.looksLikeStateCode(raw['Postcode']) &&
      this.hasMeaningfulValue(raw['Billing Address 2']);
  }

  inferShiftedOrderExport(raw) {
    if (!this.looksLikeShiftedOrderExport(raw)) return null;

    const firstName = this.pickFirstNonEmpty(raw['Billing Last name']);
    const lastName = this.normalizeCompanyCandidate(raw['Company']);
    const name = [firstName, lastName].filter(Boolean).join(' ').trim() || firstName || lastName || null;
    const phone = this.normalizePhone(
      this.pickFirstNonEmpty(
        this.looksLikePhone(raw['Billing Address 1']) ? raw['Billing Address 1'] : null,
        this.looksLikePhone(raw['Customer Note']) ? raw['Customer Note'] : null
      )
    );
    const customerNote = this.hasMeaningfulValue(raw['Order ID']) && !this.looksLikePostalCode(raw['Order ID'])
      ? raw['Order ID']
      : null;

    return {
      clientIdEmailSeed: this.pickFirstNonEmpty(raw['Billing Email']),
      name,
      email: raw['Order'],
      phone,
      company: null,
      address1: this.normalizeAddressSegment(raw['Billing Address 2']),
      address2: this.normalizeAddressSegment(raw['City']),
      city: this.pickFirstNonEmpty(raw['State']),
      state: this.looksLikeStateCode(raw['Postcode']) ? String(raw['Postcode']).trim().toUpperCase() : null,
      postal_code: this.looksLikePostalCode(raw['Phone']) ? raw['Phone'] : null,
      orderId: raw['Billing Email'],
      order: raw['Billing First name'],
      customerNote
    };
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

  buildClientId(raw, email, phone, name, fieldMappings = null) {
    const mappedClientId = this.getMappedValue(raw, fieldMappings, 'client_id');
    const addressType = this.pickFirstNonEmpty(raw.address_type, raw.addressType);
    const customerId = this.pickFirstNonEmpty(raw.customer_id, raw.customerId);
    const rowId = this.pickFirstNonEmpty(
      raw._id && typeof raw._id === 'object' ? raw._id.$oid : raw._id,
      raw.id
    );
    const explicitId = this.pickFirstNonEmpty(
      mappedClientId,
      raw.client_id,
      raw.clientId,
      customerId ? `CUSTOMER_${String(customerId)}` : null,
      rowId ? `ROW_${addressType ? `${String(addressType).trim().toUpperCase()}_` : ''}${String(rowId)}` : null
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

    const fallbackBase = this.pickFirstNonEmpty(
      name,
      this.getRawValue(raw, 'Email', 'Billing Email', 'Shipping Email', 'Email Address'),
      this.getRawValue(raw, 'Billing First name', 'First Name')
    );
    if (fallbackBase) {
      return `CLI_${crypto.createHash('md5').update(String(fallbackBase)).digest('hex')}`;
    }

    return `CLI_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  buildFallbackDisplayName({ name, company, address, city, state, email, phone, spreadsheetName = null }) {
    const emailLabel = this.looksLikeEmail(email)
      ? String(email).split('@')[0].replace(/[._-]+/g, ' ').trim()
      : null;
    const normalizedPhone = this.normalizePhone(phone);
    const phoneLabel = normalizedPhone
      ? `Phone ${String(normalizedPhone).replace(/[^\d]/g, '').slice(-4)}`
      : null;
    const locationLabel = [city, state].filter(Boolean).join(' ').trim() || city || state;

    return this.pickFirstNonEmpty(
      name,
      spreadsheetName,
      company,
      address,
      locationLabel,
      emailLabel,
      phoneLabel,
      'Unknown'
    );
  }

  extractPhoneFromAddress(address) {
    if (!this.hasMeaningfulValue(address)) {
      return { phone: null, remainder: null };
    }

    const text = String(address).trim();
    const match = text.match(/^([^,]+),(.*)$/);
    if (!match || !this.looksLikePhone(match[1])) {
      return { phone: null, remainder: text };
    }

    return {
      phone: this.normalizePhone(match[1]),
      remainder: match[2].replace(/^[,\s]+|[,\s]+$/g, '').trim() || null
    };
  }

  extractLegacyShiftedName(name, company) {
    if (!this.hasMeaningfulValue(name)) return null;

    const rawName = String(name).trim();
    let firstPart = rawName;
    const quantityTail = rawName.replace(/^.*\bx\s*\d+\s*/i, '').trim();

    if (quantityTail && quantityTail !== rawName && this.looksLikePersonText(quantityTail)) {
      firstPart = quantityTail;
    } else {
      const fallbackTail = rawName.split(',').pop()?.trim();
      if (this.looksLikePersonText(fallbackTail)) {
        firstPart = fallbackTail;
      }
    }

    const companyPart = this.normalizeCompanyCandidate(company);
    const parts = [firstPart, companyPart].filter(Boolean);
    const uniqueParts = parts.filter((part, index) =>
      parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index
    );

    return uniqueParts.join(' ').trim() || rawName;
  }

  looksLikeLegacyShiftedClient(client, metadata) {
    return !!metadata &&
      this.looksLikeEmail(metadata.order) &&
      !this.looksLikeEmail(client.email) &&
      this.looksLikePostalCode(client.phone) &&
      this.looksLikeStateCode(client.postal_code) &&
      this.hasMeaningfulValue(client.address) &&
      this.looksLikePhone(String(client.address).split(',')[0]);
  }

  normalizeLegacyShiftedClient(client, metadata) {
    const { phone: addressPhone, remainder } = this.extractPhoneFromAddress(client.address);
    const actualCity = this.pickFirstNonEmpty(client.state, client.city);
    const stateCode = this.looksLikeStateCode(client.postal_code)
      ? String(client.postal_code).trim().toUpperCase()
      : client.postal_code;
    const normalizedPhone = this.normalizePhone(
      this.pickFirstNonEmpty(
        addressPhone,
        this.looksLikePhone(metadata?.customerNote) ? metadata.customerNote : null
      )
    );
    const addressParts = [
      remainder,
      this.hasMeaningfulValue(client.city) && String(client.city).trim() !== String(actualCity || '').trim()
        ? client.city
        : null
    ].filter(Boolean);

    return {
      name: this.extractLegacyShiftedName(client.name, client.company),
      email: metadata.order,
      phone: normalizedPhone || client.phone,
      address: addressParts.join(', ').trim() || remainder || client.address,
      city: actualCity,
      state: stateCode || client.state,
      postal_code: this.looksLikePostalCode(client.phone) ? client.phone : client.postal_code,
      company: null
    };
  }

  // ── Extract fields from MongoDB exports and order-sheet JSON exports ─────
  // Mongo-style:  phone, originalPhone, customerName, email, tenantName
  // Nested:       billingAddress.{ address1, address2, city, state, postcode, country, company }
  // Order-sheet:  Billing First name, Billing Last name, Billing Email, Billing Address 1, Order ID
  transformRecord(raw, importId, fieldMappings = null) {
    if (!raw || typeof raw !== 'object' || this.isIgnorableRecord(raw) || this.shouldTraverseNestedRecords(raw)) return null;
    const shiftedOrderFallback = this.inferShiftedOrderExport(raw);
    const spreadsheetFallback = this.inferSpreadsheetFallback(raw);
    const mapped = {
      client_id: this.getMappedValue(raw, fieldMappings, 'client_id'),
      name: this.getMappedValue(raw, fieldMappings, 'name'),
      email: this.getMappedValue(raw, fieldMappings, 'email'),
      phone: this.getMappedValue(raw, fieldMappings, 'phone'),
      company: this.getMappedValue(raw, fieldMappings, 'company'),
      address: this.getMappedValue(raw, fieldMappings, 'address'),
      address1: this.getMappedValue(raw, fieldMappings, 'address1'),
      address2: this.getMappedValue(raw, fieldMappings, 'address2'),
      city: this.getMappedValue(raw, fieldMappings, 'city'),
      state: this.getMappedValue(raw, fieldMappings, 'state'),
      country: this.getMappedValue(raw, fieldMappings, 'country'),
      postal_code: this.getMappedValue(raw, fieldMappings, 'postal_code')
    };

    // ── Name ──────────────────────────────────────────────────────────────
    const rawName = this.pickFirstNonEmpty(
      mapped.name,
      shiftedOrderFallback && shiftedOrderFallback.name,
      raw.customerName,
      raw.customer_name,
      this.getRawValue(raw, 'Customer Name', 'CustomerName'),
      raw.name,
      this.getRawValue(raw, 'Billing Name', 'Billing Name ')
    );
    let name = rawName;

    if (!name) {
      const first = this.pickFirstNonEmpty(
        this.getRawValue(raw, 'Billing First name', 'First Name'),
        this.getRawValue(raw, 'Billing Name')
      );
      const last = this.pickFirstNonEmpty(
        this.getRawValue(raw, 'Billing Last name', 'Last Name')
      );
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
    if (!name) {
      name = spreadsheetFallback.name;
    }

    // ── Phone ─────────────────────────────────────────────────────────────
    const phone = this.normalizePhone(
      this.pickFirstNonEmpty(
        mapped.phone,
        shiftedOrderFallback && shiftedOrderFallback.phone,
        this.getRawValue(raw, 'Phone', 'Billing Phone', 'Shipping Phone', 'Contact', 'Billing Contact'),
        raw.phone,
        raw.originalPhone,
        raw.billingAddress && raw.billingAddress.phone,
        raw.shippingAddress && raw.shippingAddress.phone,
        this.looksLikePhone(raw['Customer Note']) ? raw['Customer Note'] : null,
        this.looksLikePhone(raw['Company']) ? raw['Company'] : null,
        spreadsheetFallback.phone
      )
    );

    // ── Email ─────────────────────────────────────────────────────────────
    const email = this.pickFirstNonEmpty(
      mapped.email,
      shiftedOrderFallback && shiftedOrderFallback.email,
      this.getRawValue(raw, 'Email', 'Billing Email', 'Shipping Email', 'Billing Mail', 'Mail', 'Email Address'),
      raw.email,
      raw['Email'],
      raw.billingAddress && raw.billingAddress.email,
      raw.shippingAddress && raw.shippingAddress.email,
      spreadsheetFallback.email
    );

    // ── Nested address objects ────────────────────────────────────────────
    const b = (raw.billingAddress  && typeof raw.billingAddress  === 'object') ? raw.billingAddress  : {};
    const s = (raw.shippingAddress && typeof raw.shippingAddress === 'object') ? raw.shippingAddress : {};

    // Company
    const company = this.pickMeaningfulCompany(
      phone,
      mapped.company,
      shiftedOrderFallback && shiftedOrderFallback.company,
      this.getRawValue(raw, 'Company', 'Billing Company', 'Shipping Company'),
      b.company,
      raw.tenantName,
      s.company,
      raw.company,
      raw['Billing Company'],
      shiftedOrderFallback ? null : raw['Company']
    );

    // Address — combine address1 + address2
    const addr1 = this.pickFirstNonEmpty(
      shiftedOrderFallback && shiftedOrderFallback.address1,
      mapped.address1,
      this.normalizeAddressSegment(mapped.address),
      this.normalizeAddressSegment(this.getRawValue(raw, 'Address 1', 'Billing Address 1', 'Shipping Address 1', 'Address', 'Billing Address', 'Shipping Address')),
      this.normalizeAddressSegment(b.address1),
      this.normalizeAddressSegment(s.address1),
      this.normalizeAddressSegment(raw.address),
      this.normalizeAddressSegment(raw['Billing Address 1']),
      this.normalizeAddressSegment(this.getRawValue(raw, 'Billing Address', 'Billing Address ')),
      this.normalizeAddressSegment(raw['Address 1']),
      this.normalizeAddressSegment(raw['Address']),
      this.normalizeAddressSegment(spreadsheetFallback.address1)
    ) || '';
    const addr2 = this.pickFirstNonEmpty(
      shiftedOrderFallback && shiftedOrderFallback.address2,
      mapped.address2,
      this.normalizeAddressSegment(this.getRawValue(raw, 'Address 2', 'Billing Address 2', 'Shipping Address 2')),
      this.normalizeAddressSegment(b.address2),
      this.normalizeAddressSegment(s.address2),
      this.normalizeAddressSegment(raw['Billing Address 2']),
      this.normalizeAddressSegment(raw['Address 2']),
      this.normalizeAddressSegment(spreadsheetFallback.address2)
    ) || '';
    const address = [addr1, addr2].filter(x => x && String(x).trim()).join(', ').trim() || null;

    // City
    const city = this.pickFirstNonEmpty(
      mapped.city,
      shiftedOrderFallback && shiftedOrderFallback.city,
      b.city,
      s.city,
      this.getRawValue(raw, 'City', 'Billing City', 'Shipping City'),
      raw.city,
      raw['City'],
      raw['Billing City'],
      spreadsheetFallback.city
    );

    // State
    const state = this.pickFirstNonEmpty(
      mapped.state,
      shiftedOrderFallback && shiftedOrderFallback.state,
      b.state,
      s.state,
      this.getRawValue(raw, 'State', 'Billing State', 'Shipping State'),
      raw.state,
      raw['State'],
      raw['Billing State'],
      this.getRawValue(raw, 'Emirates'),
      spreadsheetFallback.state
    );

    // Country
    const country = this.pickFirstNonEmpty(
      mapped.country,
      b.country,
      s.country,
      this.getRawValue(raw, 'Country', 'Billing Country', 'Shipping Country', 'Country Code'),
      raw.country,
      raw.countryCode,
      raw['Country'],
      raw['Billing Country'],
      raw['Country Code'],
      this.getRawValue(raw, 'Emirates') ? 'UAE' : null,
      spreadsheetFallback.country
    );

    // Postal code — your field is "postcode"
    const postal_code = this.pickFirstNonEmpty(
      mapped.postal_code,
      shiftedOrderFallback && shiftedOrderFallback.postal_code,
      b.postcode,
      b.postal_code,
      b.zip,
      b.zipCode,
      s.postcode,
      s.postal_code,
      s.zip,
      s.zipCode,
      this.getRawValue(raw, 'Postcode', 'Postal Code', 'Post Code', 'Zip', 'Zip Code', 'Billing Postcode', 'Shipping Postcode', 'Billing Zip', 'Shipping Zip'),
      raw.postcode,
      raw.postal_code,
      raw.zip,
      raw.zipCode,
      raw['Postcode'],
      raw['Postal Code'],
      spreadsheetFallback.postal_code
    );

    const clientId = this.buildClientId(
      raw,
      (shiftedOrderFallback && shiftedOrderFallback.clientIdEmailSeed) || email,
      phone,
      name,
      fieldMappings
    );

    const displayName = this.buildFallbackDisplayName({
      name,
      spreadsheetName: spreadsheetFallback.name,
      company,
      address,
      city,
      state,
      email,
      phone
    });

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
    if (this.hasMeaningfulValue((shiftedOrderFallback && shiftedOrderFallback.orderId) || raw['Order ID'])) {
      meta.orderId = (shiftedOrderFallback && shiftedOrderFallback.orderId) || raw['Order ID'];
    }
    if (this.hasMeaningfulValue((shiftedOrderFallback && shiftedOrderFallback.order) || raw['Order'])) {
      meta.order = (shiftedOrderFallback && shiftedOrderFallback.order) || raw['Order'];
    }
    if (this.hasMeaningfulValue(raw['Date']) || this.hasMeaningfulValue(raw['Date & Time'])) {
      meta.orderDate = this.pickFirstNonEmpty(raw['Date'], raw['Date & Time']);
    }
    if (raw['Total'] != null) meta.total          = raw['Total'];
    if (raw['Shipping'] != null) meta.shipping    = raw['Shipping'];
    if (this.hasMeaningfulValue(raw['Shipping Method'])) meta.shippingMethod = raw['Shipping Method'];
    if (this.hasMeaningfulValue(raw['Gateway'])) meta.gateway = raw['Gateway'];
    if (this.hasMeaningfulValue(raw['Tracking'])) meta.tracking = raw['Tracking'];
    if (this.hasMeaningfulValue(raw['Weight'])) meta.weight = raw['Weight'];
    if (this.hasMeaningfulValue(raw['Barcode'])) meta.barcode = raw['Barcode'];
    if (this.hasMeaningfulValue(raw['Print'])) meta.print = raw['Print'];
    const customerNote = shiftedOrderFallback ? shiftedOrderFallback.customerNote : raw['Customer Note'];
    if (this.hasMeaningfulValue(customerNote)) {
      meta.customerNote = customerNote;
    }
    if (this.hasMeaningfulValue(raw['Document Merge Status - Print Order'])) meta.documentMergeStatus = raw['Document Merge Status - Print Order'];
    if (this.hasMeaningfulValue(raw['Merged Doc URL - Print Order'])) meta.mergedDocUrl = raw['Merged Doc URL - Print Order'];

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
      name:        String(displayName).substring(0, 255),
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
        { address:   { contains: query } },
        { email:     { contains: query } },
        { company:   { contains: query } },
        { phone:     { contains: query } },
        { city:      { contains: query } },
        { state:     { contains: query } },
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
      const normalizedClient = this.looksLikeLegacyShiftedClient(c, metadata)
        ? { ...c, ...this.normalizeLegacyShiftedClient(c, metadata) }
        : c;
      const qualityScore = this.normalizeQualityScore(
        normalizedClient.quality_score ?? metadata?.qualityScore ?? metadata?.quality_score
      );

      return {
        ...normalizedClient,
        id: normalizedClient.id.toString(),
        qualityScore,
        qualityBand: normalizedClient.quality_band || metadata?.qualityBand || metadata?.quality_band || (qualityScore !== null ? this.getQualityBand(qualityScore) : null)
      };
    });
  }
}

module.exports = new ClientService();
