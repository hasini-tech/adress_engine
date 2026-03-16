import axios from 'axios';

// ─── Base instance ───────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 300000, // 5 min for normal requests
});

// ─── Request interceptor (optional auth token) ───────────────────────────────
api.interceptors.request.use(
  (config) => {
    // Uncomment if you add auth later:
    // const token = localStorage.getItem('token');
    // if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor (global error logging) ────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status  = error?.response?.status;
    const message = error?.response?.data?.message || error.message;
    console.error(`[API Error] ${status ?? 'Network'}: ${message}`);
    return Promise.reject(error);
  }
);

// ─── FILE UPLOAD  ─────────────────────────────────────────────────────────────
// KEY FIX: posts to /import/file (multipart) NOT /import (JSON body)
// - timeout: 0          → disabled so a 1.3 GB upload never times out
// - onUploadProgress    → tracks upload % for progress bar
// - NO Content-Type set → axios sets multipart/form-data + boundary automatically
//
// Usage in your component:
//   const formData = new FormData();
//   formData.append('file', file);            // raw File — never read it!
//   const res = await uploadFile(formData, setProgress);
// ─────────────────────────────────────────────────────────────────────────────
export const uploadFile = (formData, onProgress) => {
  return api.post('/import/file', formData, {
    timeout: 0,                               // ← no timeout for large files
    headers: {
      // Let axios set Content-Type automatically so the boundary is correct
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const pct = Math.round((progressEvent.loaded / progressEvent.total) * 100);
        onProgress(pct);
      }
    },
  });
};

// ─── Small JSON body import (< 10 MB only) ───────────────────────────────────
export const importJson = (clientsArray) =>
  api.post('/import', { clients: clientsArray });

// ─── Clients ─────────────────────────────────────────────────────────────────
export const getClients = (page = 1, limit = 50) =>
  api.get('/clients', { params: { page, limit } });

export const searchClients = (q, page = 1, limit = 50) =>
  api.get('/clients/search', { params: { q, page, limit } });

// ─── Import history & stats ──────────────────────────────────────────────────
export const getImportHistory = (page = 1, limit = 20) =>
  api.get('/imports', { params: { page, limit } });

export const getImportStatus = (importId) =>
  api.get(`/imports/${importId}`);

export const getStats = () =>
  api.get('/stats');

export default api;