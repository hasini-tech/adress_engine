// client/src/services/apiKeyScoring.api.js
// All API calls for the API Key Scoring feature
import { API_BASE_URL } from '../config/apiBase';

const BASE = `${API_BASE_URL}/api-keys`;

export async function saveApiKey(payload) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Failed to save API key');
  }

  return data;
}

// ─── Score an API key — returns an EventSource for SSE progress ───────────
// Usage:
//   const source = scoreApiKeyStream({ api_key: 'xxx', label: 'My Key' },
//     (event) => console.log(event),   // progress / complete / error
//     () => console.log('done'),
//   );
//   source.close(); // to cancel
export function scoreApiKeyStream(payload, onMessage, onClose) {
  // SSE requires GET, but we need to POST the key securely.
  // We POST first to create a short-lived token, then open SSE with that token.
  // If your server supports POST+SSE directly (via res.write), use fetch instead:

  const ctrl = new AbortController();

  fetch(`${BASE}/score`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal:  ctrl.signal,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      onMessage({ type: 'error', message: err.error || 'Unknown error' });
      onClose?.();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) { onClose?.(); break; }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // keep incomplete chunk

      for (const line of lines) {
        const text = line.replace(/^data:\s*/m, '').trim();
        if (!text) continue;
        try {
          const event = JSON.parse(text);
          onMessage(event);
          if (event.type === 'complete' || event.type === 'error') {
            onClose?.();
          }
        } catch {}
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onMessage({ type: 'error', message: err.message });
      onClose?.();
    }
  });

  return ctrl; // call ctrl.abort() to cancel
}

// ─── List all API keys ────────────────────────────────────────────────────
export async function fetchApiKeys({ page = 1, limit = 20, band, status } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (band)   params.set('band', band);
  if (status) params.set('status', status);

  const res = await fetch(`${BASE}?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to fetch API keys');
  return data;
}

// ─── Get single API key detail ────────────────────────────────────────────
export async function fetchApiKeyDetail(id) {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) throw new Error('API key not found');
  return res.json();
}

// ─── Score distribution ───────────────────────────────────────────────────
export async function fetchScoreDistribution() {
  const res = await fetch(`${BASE}/distribution`);
  if (!res.ok) throw new Error('Failed to fetch distribution');
  return res.json();
}

// ─── Delete API key ───────────────────────────────────────────────────────
export async function deleteApiKey(id) {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to delete API key');
  return data;
}
