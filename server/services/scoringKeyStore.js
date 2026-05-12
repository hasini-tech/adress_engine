const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'scoring-api-keys.json');

class ScoringKeyStore {
  ensureStore() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(STORE_PATH, JSON.stringify({ keys: [] }, null, 2));
    }
  }

  readStore() {
    this.ensureStore();

    try {
      const content = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed?.keys) ? parsed : { keys: [] };
    } catch (error) {
      return { keys: [] };
    }
  }

  writeStore(store) {
    this.ensureStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  }

  maskKey(value) {
    if (!value) return '';

    const text = String(value).trim();
    if (text.length <= 8) return text;

    return `${text.slice(0, 6)}...${text.slice(-4)}`;
  }

  sanitize(record) {
    return {
      id: record.id,
      label: record.label,
      platform: record.platform,
      apiKeyPreview: record.apiKeyPreview,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastScoredAt: record.lastScoredAt || null,
      totalScore: record.totalScore ?? null,
      scoreBand: record.scoreBand ?? null,
      totalRecords: record.totalRecords ?? null
    };
  }

  listKeys() {
    const store = this.readStore();

    return store.keys
      .slice()
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .map((record) => this.sanitize(record));
  }

  createKey({ apiKey, label, platform }) {
    const normalizedKey = String(apiKey || '').trim();

    if (!normalizedKey) {
      throw new Error('API key is required.');
    }

    const store = this.readStore();
    const now = new Date().toISOString();

    const existingIndex = store.keys.findIndex((record) => record.apiKey === normalizedKey);

    if (existingIndex !== -1) {
      const existing = store.keys[existingIndex];
      const updated = {
        ...existing,
        label: String(label || existing.label || 'External Platform Key').trim(),
        platform: String(platform || existing.platform || 'Another Platform').trim(),
        apiKeyPreview: this.maskKey(normalizedKey),
        updatedAt: now
      };

      store.keys[existingIndex] = updated;
      this.writeStore(store);
      return this.sanitize(updated);
    }

    const record = {
      id: crypto.randomUUID(),
      label: String(label || 'External Platform Key').trim(),
      platform: String(platform || 'Another Platform').trim(),
      apiKey: normalizedKey,
      apiKeyPreview: this.maskKey(normalizedKey),
      status: 'saved',
      createdAt: now,
      updatedAt: now,
      lastScoredAt: null,
      totalScore: null,
      scoreBand: null,
      totalRecords: null
    };

    store.keys.unshift(record);
    this.writeStore(store);
    return this.sanitize(record);
  }

  deleteKey(id) {
    const store = this.readStore();
    const filtered = store.keys.filter((record) => record.id !== id);

    if (filtered.length === store.keys.length) {
      return false;
    }

    this.writeStore({ keys: filtered });
    return true;
  }
}

module.exports = new ScoringKeyStore();
