import { create } from 'zustand';
import { apiClient } from '../api/client';
import { User } from '../types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  setUser: (user: User | null) => void;
  clearUser: () => void;
  checkAuth: () => Promise<void>;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  
  setUser: (user: User | null) => {
    set({ user, isInitialized: true });
  },
  
  clearUser: () => {
    set({ user: null, isInitialized: true });
  },
  
  checkAuth: async () => {
    if (get().isInitialized) return;
    
    set({ isLoading: true });
    
    try {
      const response = await apiClient.get('/auth/me');
      set({ user: response.data.user, isLoading: false, isInitialized: true });
    } catch (error) {
      set({ user: null, isLoading: false, isInitialized: true });
    }
  },
  
  login: async (username: string, password: string) => {
    set({ isLoading: true });
    
    try {
      const response = await apiClient.post('/auth/login', {
        username,
        password,
      });
      
      if (response.data.success) {
        set({ user: response.data.user, isLoading: false });
        return { success: true };
      } else {
        set({ isLoading: false });
        return { success: false, error: response.data.error || 'Login failed' };
      }
    } catch (error: any) {
      set({ isLoading: false });
      const errorMessage = error.response?.data?.error || 'Login failed';
      return { success: false, error: errorMessage };
    }
  },
  
  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      set({ user: null });
    }
  },
}));