import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../api';
import { API_BASE_URL } from '../config/apiBase';

const initialForm = {
  name: '',
  platform: 'GoWhats / WooCommerce',
  website: '',
  notes: ''
};

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
}

const ApiKeyManager = () => {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');
  const [form, setForm] = useState(initialForm);

  const checkoutUrl = useMemo(() => `${API_BASE_URL}/checkout/lookup`, []);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const response = await api.get('/integrations/api-keys');
      setKeys(response.data?.keys || []);
    } catch (error) {
      toast.error('Could not load API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('Please enter a key name');
      return;
    }

    setCreating(true);
    try {
      const response = await api.post('/integrations/api-keys', form);
      setGeneratedKey(response.data?.apiKey || '');
      setForm(initialForm);
      toast.success('API key created');
      await loadKeys();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied');
    } catch (error) {
      toast.error('Copy failed');
    }
  };

  const handleToggle = async (key) => {
    try {
      await api.patch(`/integrations/api-keys/${key.id}`, { active: !key.active });
      setKeys((current) => current.map((item) => (
        item.id === key.id ? { ...item, active: !item.active } : item
      )));
      toast.success(key.active ? 'API key disabled' : 'API key enabled');
    } catch (error) {
      toast.error('Could not update API key');
    }
  };

  const handleDelete = async (key) => {
    try {
      await api.delete(`/integrations/api-keys/${key.id}`);
      setKeys((current) => current.filter((item) => item.id !== key.id));
      toast.success('API key deleted');
    } catch (error) {
      toast.error('Could not delete API key');
    }
  };

  return (
    <div className="keys-container">
      <div className="keys-hero">
        <div>
          <h2 className="import-title">Address Engine API Keys</h2>
          <p className="import-description">
            Generate a key here, connect it in GoWhats or your WooCommerce checkout plugin, and use the saved customer address data for autofill.
          </p>
        </div>
        <div className="keys-pill">Checkout Lookup Ready</div>
      </div>

      <div className="keys-grid">
        <section className="keys-panel">
          <h3 className="keys-section-title">Generate New Key</h3>

          <label className="keys-label">Key Name</label>
          <input
            className="keys-input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="GoWhats main checkout"
          />

          <label className="keys-label">Platform</label>
          <input
            className="keys-input"
            value={form.platform}
            onChange={(event) => setForm({ ...form, platform: event.target.value })}
            placeholder="GoWhats / WooCommerce"
          />

          <label className="keys-label">Website</label>
          <input
            className="keys-input"
            value={form.website}
            onChange={(event) => setForm({ ...form, website: event.target.value })}
            placeholder="https://yourstore.com"
          />

          <label className="keys-label">Notes</label>
          <textarea
            className="keys-textarea"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Optional integration notes"
          />

          <button className="import-button" onClick={handleCreate} disabled={creating}>
            {creating ? 'Generating...' : 'Generate API Key'}
          </button>

          {generatedKey && (
            <div className="keys-secret-box">
              <div className="keys-secret-header">
                <strong>New API Key</strong>
                <button className="btn-outline" onClick={() => handleCopy(generatedKey)}>Copy</button>
              </div>
              <code className="keys-secret-value">{generatedKey}</code>
              <p className="keys-help">
                Save this key in your GoWhats or WooCommerce checkout integration. For security, the full key is shown only when it is first created.
              </p>
            </div>
          )}
        </section>

        <section className="keys-panel">
          <h3 className="keys-section-title">Integration Details</h3>

          <div className="keys-code-block">
            <div className="keys-code-title">Lookup Endpoint</div>
            <code>{checkoutUrl}</code>
          </div>

          <div className="keys-code-block">
            <div className="keys-code-title">Header</div>
            <code>x-api-key: YOUR_API_KEY</code>
          </div>

          <div className="keys-code-block">
            <div className="keys-code-title">Example Query</div>
            <code>{`${checkoutUrl}?email=customer@example.com&phone=9876543210`}</code>
          </div>

          <div className="keys-help-list">
            <div>1. Generate the API key on this page.</div>
            <div>2. Add that key in your GoWhats or WooCommerce checkout plugin settings.</div>
            <div>3. Call the checkout lookup endpoint with customer email, phone, or search text.</div>
            <div>4. Use the `bestMatch` or `matches` response to autofill the checkout address form.</div>
          </div>
        </section>
      </div>

      <section className="keys-panel" style={{ marginTop: '1.5rem' }}>
        <div className="keys-list-header">
          <h3 className="keys-section-title">Saved API Keys</h3>
          <span className="file-size">{keys.length} keys</span>
        </div>

        {loading ? (
          <div className="keys-empty">Loading API keys...</div>
        ) : keys.length === 0 ? (
          <div className="keys-empty">No API keys created yet.</div>
        ) : (
          <div className="keys-list">
            {keys.map((key) => (
              <div className="keys-row" key={key.id}>
                <div className="keys-row-main">
                  <div className="keys-row-top">
                    <strong>{key.name}</strong>
                    <span className={`keys-status ${key.active ? 'active' : 'inactive'}`}>
                      {key.active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="keys-meta">{key.platform} {key.website ? `- ${key.website}` : ''}</div>
                  <div className="keys-preview">{key.keyPreview}</div>
                  <div className="keys-meta">
                    Created: {formatDate(key.createdAt)} | Last used: {formatDate(key.lastUsedAt)}
                  </div>
                </div>
                <div className="keys-actions">
                  <button className="btn-outline" onClick={() => handleToggle(key)}>
                    {key.active ? 'Disable' : 'Enable'}
                  </button>
                  <button className="btn-outline" onClick={() => handleDelete(key)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default ApiKeyManager;
