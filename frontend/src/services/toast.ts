export type ToastType = 'success' | 'error' | 'info' | 'warning';

export function showToast(message: string, type: ToastType = 'info', duration = 3500) {
  const ev = new CustomEvent('tod:toast', { detail: { message, type, duration } });
  window.dispatchEvent(ev);
}

export const toast = {
  success: (msg: string, duration?: number) => showToast(msg, 'success', duration),
  error: (msg: string, duration?: number) => showToast(msg, 'error', duration),
  info: (msg: string, duration?: number) => showToast(msg, 'info', duration),
  warning: (msg: string, duration?: number) => showToast(msg, 'warning', duration),
};
