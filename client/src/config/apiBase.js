const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'http://127.0.0.1:5000';
const API_BASE_URL = import.meta.env.VITE_API_URL || `${API_ORIGIN}/api`;
const API_HEALTH_URL = `${API_ORIGIN}/health`;
const API_IMPORT_FILE_URL = `${API_BASE_URL}/import/file`;

export {
  API_BASE_URL,
  API_HEALTH_URL,
  API_IMPORT_FILE_URL,
  API_ORIGIN
};
