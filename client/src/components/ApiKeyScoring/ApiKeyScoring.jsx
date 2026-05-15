import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteApiKey,
  fetchAndScoreApiKey,
  fetchApiKeys,
  fetchCustomersForApiKey,
  saveApiKey,
} from '../../services/apiKeyScoring.api';

const DEFAULT_PLATFORM_CONFIG = {
  platform: 'Custom Platform',
  platformKey: 'custom',
  authMode: 'auto',
};

function buildInitialForm() {
  return {
    apiKey: '',
    label: '',
    baseUrl: '',
    exportPath: '',
  };
}

function formatDate(value) {
  if (!value) return 'Never';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';

  return date.toLocaleString();
}

function buildAddressLine(customer) {
  return [
    customer?.address,
    customer?.city,
    customer?.state,
    customer?.country,
    customer?.postal_code,
  ]
    .filter(Boolean)
    .join(', ');
}

function normalizePreviewCustomer(customer, index = 0) {
  const details = customer?.details || customer || {};

  return {
    id: customer?.id || details.externalId || `row-${index}`,
    externalId: customer?.externalId || details.externalId || null,
    name: details.name || 'Unnamed customer',
    email: details.email || '-',
    phone: details.phone || '-',
    address: buildAddressLine(details) || '-',
    purchaseProduct: details.purchaseProduct || details.purchase_product || '-',
    purchaseAmount: details.purchaseAmount || details.purchase_amount || '-',
  };
}

function formatFetchErrorMessage(message) {
  if (/invalid api key/i.test(message || '')) {
    return (
      'The external platform rejected the saved API key. The endpoint is correct, but this key is invalid or does not have order export access. ' +
      'Create/copy a valid external export API key, delete this saved store key, then save it again.'
    );
  }

  return message || 'Failed to fetch and score customer data.';
}

function ScoreStat({ label, value }) {
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '14px 16px',
        background: '#f8fafc',
      }}
    >
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{value}</div>
    </div>
  );
}

function buildFetchScoreResult(key, response) {
  return {
    mode: 'fetch-score',
    keyId: key.id,
    keyLabel: key.label || 'External Platform Key',
    requestUrl: response.requestUrl || '',
    total: response.total || 0,
    savedCount: response.savedCount || 0,
    score: response.score || null,
    customers: Array.isArray(response.customers)
      ? response.customers.slice(0, 8).map((customer, index) => normalizePreviewCustomer(customer, index))
      : [],
  };
}

export default function ApiKeyScoring() {
  const [form, setForm] = useState(() => buildInitialForm());
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({ id: null, type: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [result, setResult] = useState(null);

  const canSave = useMemo(() => {
    return (
      Boolean(form.apiKey.trim()) &&
      Boolean(form.label.trim()) &&
      Boolean(form.baseUrl.trim()) &&
      Boolean(form.exportPath.trim()) &&
      !loading
    );
  }, [form.apiKey, form.baseUrl, form.exportPath, form.label, loading]);

  const updateForm = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
  };

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
    if (!canSave) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setResult(null);

    try {
      const saveResponse = await saveApiKey({
        api_key: form.apiKey.trim(),
        label: form.label.trim(),
        baseUrl: form.baseUrl.trim(),
        exportPath: form.exportPath.trim(),
        ...DEFAULT_PLATFORM_CONFIG,
      });
      const savedKey = saveResponse.data;

      if (!savedKey?.id) {
        throw new Error('Store API key was saved, but the saved key id was not returned.');
      }

      setSuccess('Store API key saved. Fetching and scoring live customer data...');

      const scoreResponse = await fetchAndScoreApiKey(savedKey.id);

      setForm(buildInitialForm());
      setResult(buildFetchScoreResult(savedKey, scoreResponse));
      setSuccess(`Fetched and scored ${scoreResponse.total || 0} customers for ${savedKey.label || 'this store'}.`);
      await loadKeys();
    } catch (err) {
      setError(formatFetchErrorMessage(err.message || 'Failed to save and score API key.'));
      await loadKeys();
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
      setResult((current) => (current?.keyId === id ? null : current));
      await loadKeys();
    } catch (err) {
      setError(err.message || 'Failed to delete API key.');
    }
  };

  const handleFetchAndScore = async (key) => {
    setActionLoading({ id: key.id, type: 'fetch-score' });
    setError('');
    setSuccess('');

    try {
      const response = await fetchAndScoreApiKey(key.id);

      setResult(buildFetchScoreResult(key, response));
      setSuccess(`Fetched and scored ${response.total || 0} customers for ${key.label || 'this store'}.`);

      await loadKeys();
    } catch (err) {
      setError(formatFetchErrorMessage(err.message));
    } finally {
      setActionLoading({ id: null, type: '' });
    }
  };

  const handleViewCustomers = async (key) => {
    setActionLoading({ id: key.id, type: 'view-customers' });
    setError('');
    setSuccess('');

    try {
      const response = await fetchCustomersForApiKey(key.id);

      setResult({
        mode: 'customers',
        keyId: key.id,
        keyLabel: key.label || 'External Platform Key',
        total: response.total || 0,
        customers: Array.isArray(response.data)
          ? response.data.slice(0, 8).map((customer, index) => normalizePreviewCustomer(customer, index))
          : [],
      });
      setSuccess(`Loaded ${response.total || 0} saved customers for ${key.label || 'this store'}.`);
    } catch (err) {
      setError(err.message || 'Failed to load saved customers.');
    } finally {
      setActionLoading({ id: null, type: '' });
    }
  };

  return (
    <div className="keys-container">
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: 0 }}>
            Another Platform API Key
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 6 }}>
            Save a store API key and score its live customer data immediately.
          </p>
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 14,
            padding: '20px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 180px', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Platform API Key *
              </label>
              <input
                type="text"
                value={form.apiKey}
                onChange={(event) => updateForm({ apiKey: event.target.value })}
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
                Store Name *
              </label>
              <input
                type="text"
                value={form.label}
                onChange={(event) => updateForm({ label: event.target.value })}
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

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Platform Base URL *
              </label>
              <input
                type="url"
                value={form.baseUrl}
                onChange={(event) => updateForm({ baseUrl: event.target.value })}
                placeholder="https://api.example.com"
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

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                API Endpoints *
              </label>
              <input
                type="text"
                value={form.exportPath}
                onChange={(event) => updateForm({ exportPath: event.target.value })}
                placeholder="/api/external/orders"
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
              disabled={!canSave}
              style={{
                padding: '10px 22px',
                fontSize: 14,
                fontWeight: 700,
                background: !canSave ? '#d1d5db' : '#111827',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: !canSave ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {loading ? 'Saving & Scoring...' : 'Save, Fetch & Score'}
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
            <strong>Success:</strong> {success}
          </div>
        )}

        {result && (
          <div
            style={{
              marginTop: 24,
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111827' }}>
                  {result.mode === 'fetch-score' ? 'Latest Fetch & Score Result' : 'Saved Customer Preview'}
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: 14, color: '#6b7280' }}>
                  {result.keyLabel}
                </p>
                {result.requestUrl && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                    Request URL: {result.requestUrl}
                  </p>
                )}
              </div>

              <button
                type="button"
                className="btn-outline"
                onClick={() => setResult(null)}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
              <ScoreStat label="Customers" value={result.total || 0} />
              {result.mode === 'fetch-score' && <ScoreStat label="Saved Rows" value={result.savedCount || 0} />}
              {result.score && <ScoreStat label="Composite Score" value={result.score.composite_score ?? 0} />}
              {result.score && <ScoreStat label="Band" value={result.score.score_band || '-'} />}
              {result.score && <ScoreStat label="Valid Records" value={result.score.valid_records ?? 0} />}
              {result.score && <ScoreStat label="Duplicates" value={result.score.duplicate_records ?? 0} />}
            </div>

            {result.score && (
              <div
                style={{
                  marginBottom: 18,
                  padding: '14px 16px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  background: '#f8fafc',
                }}
              >
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Score Breakdown</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, fontSize: 13, color: '#334155' }}>
                  <div>Completeness: {result.score.completeness_score ?? 0}</div>
                  <div>Validity: {result.score.validity_score ?? 0}</div>
                  <div>Uniqueness: {result.score.uniqueness_score ?? 0}</div>
                  <div>Coverage: {result.score.coverage_score ?? 0}</div>
                  <div>Freshness: {result.score.freshness_score ?? 0}</div>
                  <div>Missing Fields: {result.score.missing_fields_pct ?? 0}%</div>
                </div>
              </div>
            )}

            <div>
              <div style={{ fontWeight: 700, color: '#111827', marginBottom: 10 }}>Customer Details Preview</div>
              {result.customers?.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {result.customers.map((customer) => (
                    <div
                      key={`${customer.id}-${customer.externalId || customer.email}`}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 12,
                        padding: '12px 14px',
                        background: '#fff',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                        <strong style={{ color: '#111827' }}>{customer.name}</strong>
                        <span style={{ color: '#64748b', fontSize: 12 }}>
                          {customer.externalId ? `ID: ${customer.externalId}` : 'No external ID'}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#475569' }}>Email: {customer.email}</div>
                      <div style={{ fontSize: 13, color: '#475569' }}>Phone: {customer.phone}</div>
                      <div style={{ fontSize: 13, color: '#475569' }}>Address: {customer.address}</div>
                      <div style={{ fontSize: 13, color: '#475569' }}>Product: {customer.purchaseProduct}</div>
                      <div style={{ fontSize: 13, color: '#475569' }}>Amount: {customer.purchaseAmount}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="keys-empty">No customer rows are saved for this key yet.</div>
              )}
            </div>
          </div>
        )}

        <div className="keys-panel" style={{ marginTop: 24 }}>
          <div className="keys-list-header">
            <h3 className="keys-section-title">Saved Store API Keys</h3>
            <span className="file-size">{keys.length} keys</span>
          </div>

          {listLoading ? (
            <div className="keys-empty">Loading saved API keys...</div>
          ) : keys.length === 0 ? (
            <div className="keys-empty">No store API keys saved yet.</div>
          ) : (
            <div className="keys-list">
              {keys.map((key) => {
                const isBusy = actionLoading.id === key.id;
                const customerCount = key.customerCount ?? key._count?.customers ?? 0;

                return (
                  <div className="keys-row" key={key.id}>
                    <div className="keys-row-main">
                      <div className="keys-row-top">
                        <strong>{key.label || 'Unnamed Store'}</strong>
                        <span className={`keys-status ${key.status === 'failed' ? 'inactive' : 'active'}`}>
                          {key.status || 'saved'}
                        </span>
                      </div>
                      <div className="keys-meta">
                        Store ID: {key.id} | {key.platform || 'Custom Platform'}
                      </div>
                      <div className="keys-meta">
                        URL: {key.baseUrl || '-'} | Endpoints: {key.exportPath || '-'}
                      </div>
                      <div className="keys-preview">{key.apiKeyPreview}</div>
                      <div className="keys-meta">
                        Created: {formatDate(key.createdAt)} | Updated: {formatDate(key.updatedAt)}
                      </div>
                      <div className="keys-meta">
                        Customers: {customerCount} | Score Band: {key.band || 'Not scored yet'}
                      </div>
                    </div>

                    <div className="keys-actions">
                      <button
                        className="btn-outline"
                        onClick={() => handleFetchAndScore(key)}
                        disabled={isBusy}
                      >
                        {isBusy && actionLoading.type === 'fetch-score' ? 'Running...' : 'Fetch & Score'}
                      </button>
                      <button
                        className="btn-outline"
                        onClick={() => handleViewCustomers(key)}
                        disabled={isBusy}
                      >
                        {isBusy && actionLoading.type === 'view-customers' ? 'Loading...' : 'View Customers'}
                      </button>
                      <button className="btn-outline" onClick={() => handleDelete(key.id)} disabled={isBusy}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
