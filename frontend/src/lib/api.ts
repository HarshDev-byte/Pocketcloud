import axios from 'axios';

export const api = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_URL ?? 'http://192.168.4.1:3000',
  withCredentials: true, // send cookies
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

// Response interceptor — handle auth errors globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Clear auth state and redirect to login
      const { useAuthStore } = await import('@/store/auth.store');
      useAuthStore.getState().clearUser();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Typed API response helpers
export async function apiGet<T>(url: string, params?: object): Promise<T> {
  const { data } = await api.get<T>(url, { params });
  return data;
}

export async function apiPost<T>(url: string, body?: object): Promise<T> {
  const { data } = await api.post<T>(url, body);
  return data;
}

export async function apiPatch<T>(url: string, body?: object): Promise<T> {
  const { data } = await api.patch<T>(url, body);
  return data;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const { data } = await api.delete<T>(url);
  return data;
}
