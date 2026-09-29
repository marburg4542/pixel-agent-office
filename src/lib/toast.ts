import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error' | 'warn';

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
  action?: { label: string; run: () => void };
  ms: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'ms'> & { ms?: number }) => number;
  dismiss: (id: number) => void;
}

let seq = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = seq++;
    const toast: Toast = { ms: t.action ? 6000 : 3500, ...t, id };
    set({ toasts: [...get().toasts.slice(-4), toast] });
    setTimeout(() => get().dismiss(id), toast.ms);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

export const toast = {
  info: (text: string) => useToasts.getState().push({ text, tone: 'info' }),
  success: (text: string) => useToasts.getState().push({ text, tone: 'success' }),
  error: (text: string) => useToasts.getState().push({ text, tone: 'error', ms: 5000 }),
  warn: (text: string, ms = 6000) => useToasts.getState().push({ text, tone: 'warn', ms }),
  withAction: (text: string, label: string, run: () => void) => useToasts.getState().push({ text, tone: 'info', action: { label, run } }),
};
