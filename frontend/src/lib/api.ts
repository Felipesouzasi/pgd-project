import axios from 'axios';
import { useAuthStore } from '../stores/auth.store';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      // Força redirect para login evitando loading infinito
      if (!window.location.pathname.includes('/login')) {
        window.location.replace('/login');
      }
    }
    if (err.response?.data?.message) {
      err.message = Array.isArray(err.response.data.message)
        ? err.response.data.message[0]
        : err.response.data.message;
    }
    return Promise.reject(err);
  },
);

export default api;
