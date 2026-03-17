import { apiGet, apiPost } from '../lib/api';

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

export interface LoginResponse {
  user: User;
}

export interface TotpRequiredResponse {
  requiresTotp: true;
  pendingUserId: string;
}

export const authApi = {
  login: (username: string, password: string) =>
    apiPost<LoginResponse | TotpRequiredResponse>('/api/auth/login', {
      username,
      password,
    }),

  verifyTotp: (pendingUserId: string, totpToken: string) =>
    apiPost<LoginResponse>('/api/auth/2fa/verify', { pendingUserId, totpToken }),

  logout: () => apiPost('/api/auth/logout'),

  me: () => apiGet<LoginResponse>('/api/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiPost('/api/auth/change-password', { currentPassword, newPassword }),
};
