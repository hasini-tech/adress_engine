import { API_BASE_URL } from '../config/apiBase';

const BASE = `${API_BASE_URL}/api-keys`;

function getErrorMessage(data, fallback) {
  return data?.error || data?.message || fallback;
}

export async function saveApiKey(payload) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(getErrorMessage(data, 'Failed to save API key'));
  }

  return data;
}

export function scoreApiKeyStream(payload, onMessage, onClose) {
  const ctrl = new AbortController();

  fetch(`${BASE}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: ctrl.signal,
  })
    .then(async (res) => {
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
        if (done) {
          onClose?.();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
          const text = line.replace(/^data:\s*/m, '').trim();
          if (!text) continue;

          try {
            const event = JSON.parse(text);
            onMessage(event);

            if (event.type === 'complete' || event.type === 'error') {
              onClose?.();
            }
          } catch {
            // Ignore malformed chunks from the event stream.
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onMessage({ type: 'error', message: err.message });
        onClose?.();
      }
    });

  return ctrl;
}

export async function fetchApiKeys({ page = 1, limit = 20, band, status } = {}) {
  const params = new URLSearchParams({ page, limit });

  if (band) params.set('band', band);
  if (status) params.set('status', status);

  const res = await fetch(`${BASE}?${params}`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(getErrorMessage(data, 'Failed to fetch API keys'));
  }

  return data;
}

export async function fetchApiKeyDetail(id) {
  const res = await fetch(`${BASE}/${id}`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(getErrorMessage(data, 'API key not found'));
  }

  return data;
}

export async function fetchScoreDistribution() {
  const res = await fetch(`${BASE}/distribution`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(getErrorMessage(data, 'Failed to fetch distribution'));
  }

  return data;
}

export async function deleteApiKey(id) {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(getErrorMessage(data, 'Failed to delete API key'));
  }

  return data;
}

export async function fetchAndScoreApiKey(id, payload = {}) {
  const res = await fetch(`${BASE}/${id}/fetch-score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(getErrorMessage(data, 'Failed to fetch and score customer data'));
  }

  return data;
}

export async function fetchCustomersForApiKey(id) {
  const res = await fetch(`${BASE}/${id}/customers`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(getErrorMessage(data, 'Failed to fetch saved customers'));
  }

  return data;
}
