import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  durationMs: number;
}

interface ToastState {
  toast: Toast | null;
  show: (toast: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => void;
  hide: (id?: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toast: null,
  show: (toast) =>
    set({ toast: { durationMs: toast.actionLabel ? 5000 : 2500, ...toast, id: nextId++ } }),
  hide: (id) => {
    if (id === undefined || get().toast?.id === id) set({ toast: null });
  },
}));

export const showToast = (toast: Parameters<ToastState['show']>[0]) =>
  useToastStore.getState().show(toast);
