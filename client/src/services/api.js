import axios from 'axios';
import { API_BASE_URL, API_HEALTH_URL } from '../config/apiBase';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 300000, // 5 minutes timeout for large imports
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error);
    
    // Handle different error scenarios
    if (error.response) {
      // Server responded with error status
      throw {
        message: error.response.data?.message || 'Server error',
        status: error.response.status,
        data: error.response.data
      };
    } else if (error.request) {
      // Request made but no response
      throw {
        message: 'Network error. Please check your connection.',
        status: 0
      };
    } else {
      // Something else happened
      throw {
        message: error.message || 'Unknown error occurred',
        status: -1
      };
    }
  }
);

// API Functions
export const importClients = async (clients) => {
  try {
    const response = await api.post('/data/import', { clients });
    return response;
  } catch (error) {
    console.error('Import error:', error);
    throw error;
  }
};

export const getImportStatus = async () => {
  try {
    const response = await api.get('/data/status');
    return response;
  } catch (error) {
    console.error('Status error:', error);
    throw error;
  }
};

// Health check - FIXED EXPORT
export const checkServerHealth = async () => {
  try {
    const response = await axios.get(API_HEALTH_URL, { timeout: 5000 });
    return response.data;
  } catch (error) {
    console.warn('Server health check failed:', error.message);
    return { status: 'disconnected', message: 'Server not available' };
  }
};

// Export default api instance
export default api;
