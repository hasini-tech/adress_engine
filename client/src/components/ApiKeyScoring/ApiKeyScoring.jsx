import { useCallback, useEffect, useState } from 'react';
import {
  deleteApiKey,
  fetchApiKeys,
  saveApiKey,
} from '../../services/apiKeyScoring.api';

function formatDate(value) {
  if (!value) return 'Never';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';

  return date.toLocaleString();
}

export default function ApiKeyScoring() {
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadKeys = useCallback(async () => {
    setListLoading(true);

    try {
      const response = await fetchApiKeys({ limit: 100 });
      setKeys(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(err.message || 'Failed to load saved API keys.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleSave = async () => {
    if (!apiKey.trim() || loading) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await saveApiKey({
        api_key: apiKey.trim(),
        label: label.trim() || undefined,
        platform: 'Another Platform',
      });

      setApiKey('');
      setLabel('');
      setSuccess(response.message || 'API key saved.');
      await loadKeys();
    } catch (err) {
      setError(err.message || 'Failed to save API key.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this saved API key?')) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      await deleteApiKey(id);
      setSuccess('API key deleted.');
      await loadKeys();
    } catch (err) {
      setError(err.message || 'Failed to delete API key.');
    }
  };

  return (
    <div className="keys-container">
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: 0 }}>
            Another Platform API Key
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 6 }}>
            Add the external platform API key here. It will be saved in the server store now, and this same section can be connected to full scoring after the fetch integration is added.
          </p>
        </div>

        <div
          style={{
            marginBottom: 20,
            padding: '14px 18px',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 10,
            color: '#1d4ed8',
            fontSize: 14,
          }}
        >
          <strong>Ready now:</strong> you can save external platform API keys from this screen. Scoring the external platform data is still a separate backend step.
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 14,
            padding: '20px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Platform API Key *
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Enter external platform API key..."
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: 14,
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  outline: 'none',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                  background: loading ? '#f9fafb' : '#fff',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Label (optional)
              </label>
              <input
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Marketplace / Store"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: 14,
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: loading ? '#f9fafb' : '#fff',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleSave}
              disabled={!apiKey.trim() || loading}
              style={{
                padding: '10px 22px',
                fontSize: 14,
                fontWeight: 700,
                background: !apiKey.trim() || loading ? '#d1d5db' : '#111827',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: !apiKey.trim() || loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {loading ? 'Saving...' : 'Save API Key'}
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 20,
              padding: '14px 18px',
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: 10,
              color: '#dc2626',
              fontSize: 14,
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        {success && (
          <div
            style={{
              marginTop: 20,
              padding: '14px 18px',
              background: '#dcfce7',
              border: '1px solid #86efac',
              borderRadius: 10,
              color: '#166534',
              fontSize: 14,
            }}
          >
            <strong>Saved:</strong> {success}
          </div>
        )}

        <div className="keys-panel" style={{ marginTop: 24 }}>
          <div className="keys-list-header">
            <h3 className="keys-section-title">Saved External Platform Keys</h3>
            <span className="file-size">{keys.length} keys</span>
          </div>

          {listLoading ? (
            <div className="keys-empty">Loading saved API keys...</div>
          ) : keys.length === 0 ? (
            <div className="keys-empty">No external platform API keys saved yet.</div>
          ) : (
            <div className="keys-list">
              {keys.map((key) => (
                <div className="keys-row" key={key.id}>
                  <div className="keys-row-main">
                    <div className="keys-row-top">
                      <strong>{key.label || 'External Platform Key'}</strong>
                      <span className="keys-status active">
                        {key.status || 'saved'}
                      </span>
                    </div>
                    <div className="keys-meta">{key.platform || 'Another Platform'}</div>
                    <div className="keys-preview">{key.apiKeyPreview}</div>
                    <div className="keys-meta">
                      Created: {formatDate(key.createdAt)} | Updated: {formatDate(key.updatedAt)}
                    </div>
                  </div>

                  <div className="keys-actions">
                    <button className="btn-outline" onClick={() => handleDelete(key.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
