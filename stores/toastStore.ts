/**
 * Global in-app toast / notification store
 */
import { create } from 'zustand';

export interface Toast {
  id:      string;
  message: string;
  type:    'success' | 'warning' | 'error' | 'info';
}

interface ToastState {
  toasts:     Toast[];
  showToast:  (message: string, type?: Toast['type']) => void;
  removeToast:(id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  showToast: (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    // Auto-dismiss after 4 s
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
