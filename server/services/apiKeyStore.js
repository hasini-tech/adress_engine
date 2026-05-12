const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'api-keys.json');

class ApiKeyStore {
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

  hashKey(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
  }

  maskKey(value) {
    if (!value) return '';
    const text = String(value);
    if (text.length <= 8) return text;
    return `${text.slice(0, 6)}...${text.slice(-4)}`;
  }

  sanitize(record) {
    return {
      id: record.id,
      name: record.name,
      platform: record.platform,
      website: record.website,
      notes: record.notes,
      active: record.active,
      keyPreview: record.keyPreview,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt || null,
      permissions: Array.isArray(record.permissions) ? record.permissions : ['checkout.lookup']
    };
  }

  listKeys() {
    const store = this.readStore();
    return store.keys
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((record) => this.sanitize(record));
  }

  createKey({ name, platform, website, notes }) {
    const store = this.readStore();
    const rawKey = `ae_live_${crypto.randomBytes(24).toString('hex')}`;
    const record = {
      id: crypto.randomUUID(),
      name: String(name || 'Integration Key').trim(),
      platform: String(platform || 'Custom Checkout').trim(),
      website: String(website || '').trim(),
      notes: String(notes || '').trim(),
      keyHash: this.hashKey(rawKey),
      keyPreview: this.maskKey(rawKey),
      active: true,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      permissions: ['checkout.lookup']
    };

    store.keys.unshift(record);
    this.writeStore(store);

    return {
      apiKey: rawKey,
      record: this.sanitize(record)
    };
  }

  updateKey(id, updates = {}) {
    const store = this.readStore();
    const index = store.keys.findIndex((record) => record.id === id);
    if (index === -1) return null;

    const current = store.keys[index];
    const next = {
      ...current,
      active: typeof updates.active === 'boolean' ? updates.active : current.active,
      name: updates.name != null ? String(updates.name).trim() : current.name,
      platform: updates.platform != null ? String(updates.platform).trim() : current.platform,
      website: updates.website != null ? String(updates.website).trim() : current.website,
      notes: updates.notes != null ? String(updates.notes).trim() : current.notes
    };

    store.keys[index] = next;
    this.writeStore(store);
    return this.sanitize(next);
  }

  deleteKey(id) {
    const store = this.readStore();
    const filtered = store.keys.filter((record) => record.id !== id);
    if (filtered.length === store.keys.length) return false;
    this.writeStore({ keys: filtered });
    return true;
  }

  validateKey(rawKey) {
    if (!rawKey) return null;

    const store = this.readStore();
    const keyHash = this.hashKey(rawKey);
    const record = store.keys.find((entry) => entry.keyHash === keyHash && entry.active);

    if (!record) return null;

    record.lastUsedAt = new Date().toISOString();
    this.writeStore(store);

    return this.sanitize(record);
  }
}

module.exports = new ApiKeyStore();
