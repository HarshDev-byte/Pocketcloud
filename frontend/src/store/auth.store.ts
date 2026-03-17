import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

interface AuthStore {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User) => void;
  clearUser: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isLoading: true,

      setUser: (user) => set({ user, isLoading: false }),

      clearUser: () => set({ user: null, isLoading: false }),

      checkAuth: async () => {
        try {
          set({ isLoading: true });
          const { data } = await api.get('/api/auth/me');
          set({ user: data.user, isLoading: false });
        } catch {
          set({ user: null, isLoading: false });
        }
      },
    }),
    {
      name: 'pocketcloud-auth',
      partialize: (s) => ({ user: s.user }),
    }
  )
);
