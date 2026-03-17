import { create } from 'zustand';
import { Toast, ToastData } from './Toast';

interface ToasterStore {
  toasts: ToastData[];
  addToast: (toast: Omit<ToastData, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToaster = create<ToasterStore>((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: Math.random().toString(36).slice(2) }],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

// Helper functions
export const toast = {
  success: (title: string, description?: string) =>
    useToaster.getState().addToast({ type: 'success', title, description }),
  error: (title: string, description?: string) =>
    useToaster.getState().addToast({ type: 'error', title, description }),
  info: (title: string, description?: string) =>
    useToaster.getState().addToast({ type: 'info', title, description }),
  warning: (title: string, description?: string) =>
    useToaster.getState().addToast({ type: 'warning', title, description }),
};

export function Toaster() {
  const { toasts, removeToast } = useToaster();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast {...toast} onClose={removeToast} />
        </div>
      ))}
    </div>
  );
}
