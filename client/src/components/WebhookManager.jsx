import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../api';

// ── STRICT WHITE & BLUE THEME CSS (Scoped to Webhooks) ────────────────────────
const SCOPED_CSS = `
  @keyframes wm-spin { to { transform:rotate(360deg); } }

  /* Force light mode and prevent global dark themes from bleeding in */
  .wm-root { color-scheme: light !important; text-align: left; }
  .wm-root, .wm-root * { box-sizing: border-box !important; }

  .wm-wrap {
    background-color: #f4f7fb !important; /* Soft light blue/grey background */
    color: #0f172a !important; /* Dark text */
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    padding: 24px;
    border-radius: 16px;
    min-height: 200px;
  }

  /* ── buttons ── */
  .wm-root button {
    display: inline-flex !important; align-items: center !important; gap: 6px !important;
    border-radius: 6px !important; font-weight: 600 !important; cursor: pointer !important;
    transition: all .15s !important; border: none !important; outline: none !important;
    font-family: inherit !important; padding: 8px 14px !important; font-size: 12px !important;
  }
  .wm-root button:disabled { opacity: .6 !important; cursor: not-allowed !important; }

  .wm-btn-primary { background-color: #2563eb !important; color: #ffffff !important; }
  .wm-btn-primary:hover { background-color: #1d4ed8 !important; }

  .wm-btn-ghost {
    background-color: #ffffff !important; color: #475569 !important;
    border: 1px solid #cbd5e1 !important;
  }
  .wm-btn-ghost:hover { border-color: #2563eb !important; color: #2563eb !important; background-color: #eff6ff !important; }
  
  .wm-btn-danger { background-color: #fef2f2 !important; color: #dc2626 !important; border: 1px solid #fecaca !important; }
  .wm-btn-danger:hover { background-color: #fee2e2 !important; }
  
  .wm-btn-warn { background-color: #ffffff !important; color: #0284c7 !important; border: 1px solid #bae6fd !important; }
  .wm-btn-warn:hover { background-color: #f0f9ff !important; }

  /* ── badges ── */
  .wm-badge {
    display: inline-flex !important; align-items: center !important; gap: 4px !important;
    padding: 3px 8px !important; border-radius: 4px !important;
    font-size: .82rem !important; font-weight: 600 !important; font-family: monospace !important;
  }
  .wm-badge-blue  { background-color:#eff6ff !important; color:#1d4ed8 !important; border:1px solid #bfdbfe !important; }
  .wm-badge-green { background-color:#f0fdf4 !important; color:#15803d !important; border:1px solid #bbf7d0 !important; }
  .wm-badge-warn  { background-color:#fffbeb !important; color:#b45309 !important; border:1px solid #fde68a !important; }

  /* ── toggle ── */
  .wm-toggle {
    width: 36px !important; height: 20px !important; border-radius: 10px !important;
    flex-shrink: 0 !important; position: relative !important; cursor: pointer !important;
    transition: background .2s !important;
  }
  .wm-toggle.on  { background-color: #2563eb !important; }
  .wm-toggle.off { background-color: #cbd5e1 !important; }
  .wm-toggle-dot {
    position: absolute !important; top: 3px !important;
    width: 14px !important; height: 14px !important; border-radius: 50% !important;
    background-color: #ffffff !important; transition: left .2s !important;
    box-shadow: 0 1px 3px rgba(0,0,0,.2) !important;
  }

  /* ── form elements ── */
  .wm-form-panel {
    background-color: #ffffff !important; border: 1px solid #e2e8f0 !important;
    border-radius: 8px !important; padding: 20px !important; margin-bottom: 20px !important;
    box-shadow: 0 4px 15px -3px rgba(37, 99, 235, 0.05) !important;
  }
  .wm-label { display: block !important; font-size: 12px !important; font-weight: 700 !important; color: #475569 !important; margin-bottom: 6px !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; }
  .wm-input {
    width: 100% !important; padding: 10px 12px !important; border: 1px solid #cbd5e1 !important;
    border-radius: 6px !important; font-size: 13px !important; color: #0f172a !important;
    outline: none !important; transition: border-color .2s !important; font-family: inherit !important;
  }
  .wm-input:focus { border-color: #2563eb !important; box-shadow: 0 0 0 3px #eff6ff !important; }

  .wm-checkbox-label { display: flex !important; align-items: center !important; gap: 8px !important; font-size: 13px !important; color: #0f172a !important; cursor: pointer !important; }
  .wm-checkbox-label input { cursor: pointer !important; width: 16px !important; height: 16px !important; accent-color: #2563eb !important; }

  /* ── webhook row ── */
  .wm-row {
    background-color: #ffffff !important; border: 1px solid #e2e8f0 !important;
    border-radius: 8px !important; overflow: hidden !important; margin-bottom: 12px !important;
    box-shadow: 0 4px 15px -3px rgba(37, 99, 235, 0.03) !important;
  }
  .wm-row:hover { border-color: #cbd5e1 !important; }
  .wm-row-top {
    display: flex !important; align-items: center !important; gap: 12px !important;
    padding: 14px 18px !important; background-color: #ffffff !important;
  }
  .wm-row-bottom {
    border-top: 1px solid #e2e8f0 !important; padding: 14px 18px !important;
    background-color: #f8fafc !important;
  }

  /* ── empty state ── */
  .wm-empty {
    background-color: #ffffff !important; border: 1px dashed #cbd5e1 !important;
    border-radius: 12px !important; padding: 40px 24px !important;
    text-align: center !important; color: #64748b !important; font-size: 13px !important;
  }

  .wm-spin { animation: wm-spin .8s linear infinite; }
`;

// ── icons ─────────────────────────────────────────────────────────────────────
const Ic = {
  Trash:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  Send:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Globe:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  Key:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/></svg>,
  Loader: () => <svg className="wm-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>,
  Plus:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Close:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// ── primitives ────────────────────────────────────────────────────────────────
function Btn({ children, onClick, variant = 'primary', disabled, loading }) {
  return (
    <button className={`wm-btn-${variant}`} onClick={onClick} disabled={disabled || loading}>
      {loading ? <Ic.Loader /> : children}
    </button>
  );
}

function Badge({ children, color = 'green' }) {
  return <span className={`wm-badge wm-badge-${color}`}>{children}</span>;
}

// ── Webhook Row ───────────────────────────────────────────────────────────────
function WebhookRow({ wh, onDelete, onTest, onToggle }) {
  const [testing, setTesting]   = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleTest = async () => { setTesting(true); await onTest(wh.id); setTesting(false); };
  const short = wh.url.replace(/^https?:\/\//, '').substring(0, 48) + (wh.url.length > 56 ? '…' : '');

  return (
    <div className="wm-row">
      <div className="wm-row-top">
        <div className={`wm-toggle ${wh.active ? 'on' : 'off'}`} onClick={() => onToggle(wh.id)}>
          <div className="wm-toggle-dot" style={{ left: wh.active ? 19 : 3 }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#0f172a', fontWeight: 600 }}>
            <span style={{ color: '#94a3b8', display: 'flex' }}><Ic.Globe /></span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{short}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <Badge color="blue">{wh.platform}</Badge>
            {wh.events.slice(0, 3).map(e => <Badge key={e} color="green">{e.split('.')[0]}</Badge>)}
            {wh.events.length > 3 && <Badge color="warn">+{wh.events.length - 3}</Badge>}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 16 }}>
          <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{wh.deliveries || 0} deliveries</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{wh.lastSent || 'never sent'}</div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={() => setExpanded(e => !e)}>{expanded ? 'hide' : 'details'}</Btn>
          <Btn variant="warn"  onClick={handleTest} loading={testing}><Ic.Send /> test</Btn>
          <Btn variant="danger" onClick={() => onDelete(wh.id)}><Ic.Trash /></Btn>
        </div>
      </div>

      {expanded && (
        <div className="wm-row-bottom">
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Subscribed events
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {wh.events.map(e => <Badge key={e} color="green">{e}</Badge>)}
          </div>
          {wh.secret && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#94a3b8', display: 'flex' }}><Ic.Key /></span>
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>Signing secret configured</span>
              <Badge color="blue">HMAC-SHA256</Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Webhook Manager ───────────────────────────────────────────────────────────
function WebhookManager() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading]   = useState(true);

  // Form State for Adding Webhook
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    url: '',
    platform: 'Custom App',
    secret: '',
    events: ['import.completed']
  });

  const AVAILABLE_EVENTS = ['import.started', 'import.completed', 'search.completed', 'error.alert'];

  useEffect(() => {
    // Fetch only the webhooks list
    api.get('/webhooks')
       .then(res => { setWebhooks(res.data); setLoading(false); })
       .catch(() => { setWebhooks([]); setLoading(false); });
  }, []);

  const handleDelete = async id => {
    try { await api.delete(`/webhooks/${id}`); } catch {}
    setWebhooks(p => p.filter(w => w.id !== id)); 
    toast.info('Webhook removed');
  };

  const handleToggle = async id => {
    const wh = webhooks.find(w => w.id === id);
    try { await api.patch(`/webhooks/${id}`, { active: !wh.active }); } catch {}
    setWebhooks(p => p.map(w => w.id === id ? { ...w, active: !w.active } : w));
  };

  const handleTest = async id => {
    const wh = webhooks.find(w => w.id === id);
    try {
      const res = await api.post(`/webhooks/${id}/test`);
      const isSuccess = res.data && res.data.ok;
      if (isSuccess) {
        toast.success(`Test delivered to ${wh.url.split('/')[2]}`);
      } else {
        toast.error('Test delivery failed');
      }
    } catch { 
      toast.error('Test delivery failed — check your endpoint'); 
    }
  };

  // Handle Form Submission
  const handleCreateWebhook = async () => {
    if (!formData.url) return toast.error('Webhook URL is required');
    if (!formData.url.startsWith('http')) return toast.error('URL must start with http:// or https://');
    if (formData.events.length === 0) return toast.error('Select at least one event');

    setIsSubmitting(true);
    try {
      const payload = { ...formData, active: true };
      const res = await api.post('/webhooks', payload);
      
      // Attempt to use returned data, otherwise mock it so UI updates immediately
      const newWh = res.data?.id ? res.data : {
        id: Date.now().toString(),
        ...payload,
        deliveries: 0,
        lastSent: null
      };

      setWebhooks([newWh, ...webhooks]);
      toast.success('Webhook created successfully');
      
      // Reset and close form
      setFormData({ url: '', platform: 'Custom App', secret: '', events: ['import.completed'] });
      setShowAddForm(false);
    } catch (err) {
      toast.error('Failed to create webhook. Check console.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Checkbox Toggles
  const toggleEvent = (eName) => {
    setFormData(prev => {
      const exists = prev.events.includes(eName);
      if (exists) return { ...prev, events: prev.events.filter(e => e !== eName) };
      return { ...prev, events: [...prev.events, eName] };
    });
  };

  return (
    <div className="wm-root">
      <style>{SCOPED_CSS}</style>

      <div className="wm-wrap">
        {/* Header Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Registered Webhooks ({webhooks.length})
          </div>
          
          <Btn 
            variant={showAddForm ? 'ghost' : 'primary'} 
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? <><Ic.Close /> Cancel</> : <><Ic.Plus /> Add Webhook</>}
          </Btn>
        </div>

        {/* Add Webhook Form Panel */}
        {showAddForm && (
          <div className="wm-form-panel">
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 2 }}>
                <label className="wm-label">Endpoint URL *</label>
                <input 
                  type="text" 
                  className="wm-input" 
                  placeholder="https://your-domain.com/api/webhook" 
                  value={formData.url}
                  onChange={e => setFormData({...formData, url: e.target.value})}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="wm-label">Platform / Name</label>
                <input 
                  type="text" 
                  className="wm-input" 
                  placeholder="e.g. Zapier, Shopify..." 
                  value={formData.platform}
                  onChange={e => setFormData({...formData, platform: e.target.value})}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="wm-label">Subscribe to Events *</label>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
                {AVAILABLE_EVENTS.map(evt => (
                  <label key={evt} className="wm-checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={formData.events.includes(evt)} 
                      onChange={() => toggleEvent(evt)} 
                    />
                    {evt}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="wm-label">Signing Secret (Optional)</label>
              <input 
                type="text" 
                className="wm-input" 
                placeholder="Leave blank to generate automatically" 
                value={formData.secret}
                onChange={e => setFormData({...formData, secret: e.target.value})}
              />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                Used to create HMAC-SHA256 signatures so you can verify payloads are from us.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <Btn variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={handleCreateWebhook} loading={isSubmitting}>
                Save Webhook
              </Btn>
            </div>
          </div>
        )}

        {/* Webhooks List */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 10, color: '#64748b' }}>
            <Ic.Loader /> Loading webhooks…
          </div>
        ) : webhooks.length === 0 ? (
          <div className="wm-empty">No webhooks registered yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {webhooks.map(wh => (
              <WebhookRow 
                key={wh.id} 
                wh={wh}
                onDelete={handleDelete} 
                onTest={handleTest} 
                onToggle={handleToggle} 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default WebhookManager;