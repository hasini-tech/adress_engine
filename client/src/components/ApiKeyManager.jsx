import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../api';
import { API_BASE_URL } from '../config/apiBase';

const initialForm = {
  name: '',
  platform: 'GoWhats / WooCommerce',
  website: '',
  notes: '',
  expiration: '1 year',
  rateLimit: 60,
  permissions: {
    read: true,
    write: false,
    update: false,
    delete: false,
  },
};

const EXPIRATION_OPTIONS = [
  '30 days',
  '90 days',
  '6 months',
  '1 year',
  '2 years',
  'Never',
];

const TABS = [
  { id: 'keys',     label: 'Active Keys' },
  { id: 'generate', label: 'Generate Key' },
  { id: 'docs',     label: 'Documentation' },
];

const BADGE_COLORS = {
  read:   { background: '#E6F1FB', color: '#185FA5' },
  write:  { background: '#E1F5EE', color: '#0F6E56' },
  send:   { background: '#FAEEDA', color: '#854F0B' },
  update: { background: '#FAEEDA', color: '#854F0B' },
  delete: { background: '#FCEBEB', color: '#A32D2D' },
};

const getBadge = (perm) => BADGE_COLORS[perm] || { background: '#F1EFE8', color: '#5F5E5A' };

/* ─── tiny reusable pieces ──────────────────────────────────── */
const TD = ({ children, style = {} }) => (
  <td style={{ padding: '13px 12px', verticalAlign: 'middle', borderTop: '1px solid #f3f4f6', ...style }}>
    {children}
  </td>
);

const CodeBlock = ({ title, children }) => (
  <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
    {title && (
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', marginBottom: 8 }}>
        {title}
      </div>
    )}
    <code style={{ fontFamily: 'Menlo, Monaco, "Courier New", monospace', fontSize: 12, color: '#374151', whiteSpace: 'pre', display: 'block', lineHeight: 1.7 }}>
      {children}
    </code>
  </div>
);

/* ─── main component ─────────────────────────────────────────── */
const ApiKeyManager = () => {
  const [keys, setKeys]               = useState([]);
  const [creating, setCreating]       = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');
  const [form, setForm]               = useState(initialForm);
  const [activeTab, setActiveTab]     = useState('keys');

  const checkoutUrl = useMemo(() => `${API_BASE_URL}/checkout/lookup`, []);

  const loadKeys = async () => {
    try {
      const res = await api.get('/integrations/api-keys');
      setKeys(res.data?.keys || []);
    } catch {
      toast.error('Could not load API keys');
    }
  };

  useEffect(() => { loadKeys(); }, []);

  /* derived stats */
  const totalCalls  = keys.reduce((sum, k) => sum + (k.usage || 0), 0);
  const activeCount = keys.filter((k) => k.active && k.lastUsed && k.lastUsed !== 'Never').length;
  const lastActive  = [...keys]
    .filter((k) => k.lastUsed && k.lastUsed !== 'Never')
    .sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed))[0];
  const maxUsage    = Math.max(...keys.map((k) => k.usage || 0), 1);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Please enter a key name'); return; }
    setCreating(true);
    try {
      const res = await api.post('/integrations/api-keys', form);
      setGeneratedKey(res.data?.apiKey || '');
      setForm(initialForm);
      toast.success('API key created');
      await loadKeys();
      setActiveTab('keys');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (val) => {
    try   { await navigator.clipboard.writeText(val); toast.success('Copied'); }
    catch { toast.error('Copy failed'); }
  };

  const handleToggle = async (key) => {
    try {
      await api.patch(`/integrations/api-keys/${key.id}`, { active: !key.active });
      setKeys((cur) => cur.map((i) => i.id === key.id ? { ...i, active: !i.active } : i));
      toast.success(key.active ? 'API key disabled' : 'API key enabled');
    } catch { toast.error('Could not update API key'); }
  };

  const handleDelete = async (key) => {
    try {
      await api.delete(`/integrations/api-keys/${key.id}`);
      setKeys((cur) => cur.filter((i) => i.id !== key.id));
      toast.success('API key deleted');
    } catch { toast.error('Could not delete API key'); }
  };

  const activePerms = (perms) =>
    perms ? Object.keys(perms).filter((p) => perms[p]) : [];

  /* ── shared micro-styles ── */
  const inlineCode = {
    fontFamily: 'Menlo, Monaco, monospace',
    fontSize: 11,
    background: '#f3f4f6',
    padding: '1px 5px',
    borderRadius: 4,
    color: '#374151',
  };

  const inputStyle = {
    width: '100%',
    padding: '9px 12px',
    fontSize: 13,
    border: '1px solid #d1d5db',
    borderRadius: 7,
    background: '#fff',
    color: '#111827',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 5,
  };

  const btnPrimary = {
    width: '100%',
    padding: '10px 16px',
    background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.01em',
  };

  const btnGhost = {
    fontSize: 12,
    padding: '5px 12px',
    background: 'transparent',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    cursor: 'pointer',
    color: '#374151',
  };

  const btnDanger = {
    ...btnGhost,
    border: '1px solid #fca5a5',
    color: '#dc2626',
  };

  return (
    /* page wrapper — matches the grey page bg seen in image 1 */
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", color: '#111827', padding: '0' }}>

      {/* ── Header title + subtitle (above the card) ── */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>
          Address Engine API Keys
        </h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
          Generate a key, define its scope, and monitor usage.
        </p>
      </div>

      {/* ── WHITE CARD  (image-2 style: gradient top border) ── */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        overflow: 'hidden',          /* clips the top gradient bar */
      }}>
        {/* gradient bar — same purple-to-blue as image 2 */}
        <div style={{ height: 5, background: 'linear-gradient(90deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%)' }} />

        <div style={{ padding: '1.5rem 1.75rem' }}>

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
            {TABS.map((tab) => {
              const on = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '9px 20px',
                    fontSize: 14,
                    fontWeight: on ? 600 : 400,
                    color: on ? '#3b82f6' : '#6b7280',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: on ? '2px solid #3b82f6' : '2px solid transparent',
                    cursor: 'pointer',
                    marginBottom: -1,
                    transition: 'color 0.15s',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ════════════════════════════════════════════
              TAB: Active Keys
          ════════════════════════════════════════════ */}
          {activeTab === 'keys' && (
            <>
              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: '1.5rem' }}>
                {[
                  { label: 'TOTAL API KEYS',    value: keys.length,                   sub: 'across all integrations' },
                  { label: 'TOTAL API CALLS',   value: totalCalls.toLocaleString(),    sub: 'lifetime usage' },
                  { label: 'ACTIVE THIS MONTH', value: activeCount,                   sub: 'keys used recently' },
                  {
                    label: 'LAST ACTIVITY',
                    value: lastActive ? new Date(lastActive.lastUsed).toLocaleDateString() : '—',
                    sub: lastActive?.name || 'No activity yet',
                    small: true,
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    style={{ background: '#f9fafb', borderRadius: 10, padding: '1rem 1.25rem', border: '1px solid #f0f0f0' }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 8 }}>
                      {c.label}
                    </div>
                    <div style={{ fontSize: c.small ? 16 : 26, fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>
                      {c.value}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 5 }}>{c.sub}</div>
                  </div>
                ))}
              </div>

              {/* Info banner (mirrors image-2 blue banner) */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', marginBottom: '1.5rem', fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
                <strong>Backend flow ready:</strong>{' '}each key runs its own server-side lookup pipeline using the URL and permissions saved for that key.
              </div>

              {/* Table */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Saved API Keys</span>
                  <button
                    style={{ ...btnGhost, fontSize: 13, padding: '6px 14px', borderColor: '#3b82f6', color: '#3b82f6', fontWeight: 500 }}
                    onClick={() => setActiveTab('generate')}
                  >
                    + New Key
                  </button>
                </div>

                {keys.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem', fontSize: 14, color: '#9ca3af' }}>
                    No API keys yet.{' '}
                    <span
                      style={{ color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => setActiveTab('generate')}
                    >
                      Generate one
                    </span>{' '}to get started.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead style={{ background: '#f9fafb' }}>
                        <tr>
                          {['Name', 'Key', 'Permissions', 'Usage', 'Last Used', 'Actions'].map((h) => (
                            <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', padding: '10px 12px' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {keys.map((key) => {
                          const perms   = activePerms(key.permissions);
                          const visible = perms.slice(0, 2);
                          const extra   = perms.length - visible.length;
                          const pct     = Math.round(((key.usage || 0) / maxUsage) * 100);

                          return (
                            <tr key={key.id} style={{ opacity: key.active ? 1 : 0.45, transition: 'background 0.1s' }}>
                              <TD><span style={{ fontWeight: 600 }}>{key.name}</span></TD>
                              <TD>
                                <code style={{ fontFamily: 'Menlo, Monaco, monospace', fontSize: 12, background: '#f3f4f6', padding: '3px 8px', borderRadius: 5, color: '#374151' }}>
                                  {(key.prefix || 'gw_') + '••••••••'}
                                </code>
                              </TD>
                              <TD>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {visible.map((p) => (
                                    <span key={p} style={{ ...getBadge(p), display: 'inline-block', fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4 }}>{p}</span>
                                  ))}
                                  {extra > 0 && (
                                    <span style={{ display: 'inline-block', fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f3f4f6', color: '#6b7280' }}>+{extra}</span>
                                  )}
                                </div>
                              </TD>
                              <TD>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
                                  <span style={{ fontSize: 12, color: '#374151', minWidth: 68, whiteSpace: 'nowrap' }}>
                                    {(key.usage || 0).toLocaleString()} calls
                                  </span>
                                  <div style={{ flex: 1, height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#3b82f6,#6366f1)', borderRadius: 3 }} />
                                  </div>
                                </div>
                              </TD>
                              <TD style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                                {!key.lastUsed || key.lastUsed === 'Never'
                                  ? 'Never'
                                  : new Date(key.lastUsed).toLocaleDateString()}
                              </TD>
                              <TD>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button style={btnGhost} onClick={() => handleToggle(key)}>
                                    {key.active ? 'Disable' : 'Enable'}
                                  </button>
                                  <button style={btnDanger} onClick={() => handleDelete(key)}>
                                    Delete
                                  </button>
                                </div>
                              </TD>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════
              TAB: Generate Key
          ════════════════════════════════════════════ */}
          {activeTab === 'generate' && (
            <>
              {/* Info banner */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', marginBottom: '1.5rem', fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
                <strong>Scoped keys:</strong>{' '}each key is limited to the permissions you select — read, write, update, or delete.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                {/* Left: form */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '1.25rem' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: '1.1rem' }}>New API Key</div>

                  {/* Key Name */}
                  <label style={labelStyle}>Key Name *</label>
                  <input
                    style={inputStyle}
                    placeholder="e.g. My Integration"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />

                  {/* Permissions */}
                  <label style={{ ...labelStyle, marginTop: 16 }}>Permissions</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 }}>
                    {Object.keys(form.permissions).map((perm) => (
                      <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={form.permissions[perm]}
                          onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, [perm]: e.target.checked } })}
                        />
                        {perm.charAt(0).toUpperCase() + perm.slice(1)}
                      </label>
                    ))}
                  </div>

                  {/* Divider */}
                  <div style={{ borderTop: '1px solid #f3f4f6', margin: '18px 0' }} />

                  {/* Expiration */}
                  <label style={labelStyle}>Expiration</label>
                  <select
                    style={{ ...inputStyle, appearance: 'auto', cursor: 'pointer', background: '#fff' }}
                    value={form.expiration}
                    onChange={(e) => setForm({ ...form, expiration: e.target.value })}
                  >
                    {EXPIRATION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>

                  {/* Rate Limit */}
                  <label style={{ ...labelStyle, marginTop: 16 }}>Rate Limit (per minute)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    max={10000}
                    placeholder="60"
                    value={form.rateLimit}
                    onChange={(e) => setForm({ ...form, rateLimit: Number(e.target.value) })}
                  />
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '5px 0 0' }}>
                    Max requests this key can make per minute.
                  </p>

                  {/* Divider */}
                  <div style={{ borderTop: '1px solid #f3f4f6', margin: '20px 0 16px' }} />

                  {/* Action buttons — Cancel + Create Key */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button
                      style={{ ...btnGhost, padding: '9px 22px', fontSize: 13, borderRadius: 8 }}
                      onClick={() => { setForm(initialForm); setGeneratedKey(''); setActiveTab('keys'); }}
                    >
                      Cancel
                    </button>
                    <button
                      style={{
                        padding: '9px 24px',
                        background: creating ? '#86efac' : '#4ade80',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: creating ? 'not-allowed' : 'pointer',
                        opacity: creating ? 0.8 : 1,
                        letterSpacing: '0.01em',
                        transition: 'background 0.15s',
                      }}
                      onClick={handleCreate}
                      disabled={creating}
                    >
                      {creating ? 'Creating…' : 'Create Key'}
                    </button>
                  </div>

                  {/* Generated key reveal */}
                  {generatedKey && (
                    <div style={{ marginTop: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '1rem' }}>
                      <p style={{ fontSize: 12, color: '#065f46', fontWeight: 600, marginBottom: 8 }}>
                        ⚠ Copy this key now — it won't be shown again.
                      </p>
                      <code style={{ display: 'block', fontFamily: 'Menlo, Monaco, monospace', fontSize: 12, wordBreak: 'break-all', background: '#fff', border: '1px solid #d1fae5', borderRadius: 6, padding: '8px 10px', marginBottom: 10, color: '#065f46' }}>
                        {generatedKey}
                      </code>
                      <button style={btnGhost} onClick={() => handleCopy(generatedKey)}>Copy Key</button>
                    </div>
                  )}
                </div>

                {/* Right: endpoint info */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '1.25rem' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: '1.1rem' }}>Integration Details</div>

                  <CodeBlock title="Lookup Endpoint">{checkoutUrl}</CodeBlock>

                  <CodeBlock title="Request Header">{`x-api-key: gw_your_key_here`}</CodeBlock>

                  <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, marginTop: 8 }}>
                    Pass your key as <code style={inlineCode}>x-api-key</code> in every request header.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════
              TAB: Documentation
          ════════════════════════════════════════════ */}
          {activeTab === 'docs' && (
            <>
              <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, marginBottom: '1.25rem' }}>
                Use the Address Engine API to look up and validate addresses at checkout.
                Authenticate every request with your API key via the <code style={inlineCode}>x-api-key</code> header.
              </p>

              <CodeBlock title="GET request">{`GET ${checkoutUrl}\nx-api-key: gw_your_key_here\n?address=123+Main+St&zip=10001`}</CodeBlock>

              <CodeBlock title="Response">{`{\n  "valid": true,\n  "address": "123 Main St",\n  "city": "New York",\n  "zip": "10001",\n  "country": "US"\n}`}</CodeBlock>

              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
                <strong>Rate limits:</strong>{' '}each key is rate-limited per your plan. Responses include <code style={{ ...inlineCode, background: '#dbeafe', color: '#1e40af' }}>X-RateLimit-Remaining</code> headers.
              </div>
            </>
          )}

        </div>{/* /card body */}
      </div>{/* /white card */}
    </div>
  );
};

export default ApiKeyManager;