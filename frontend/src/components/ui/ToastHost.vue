<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import Icon from '../Icon.vue';

export interface Toast {
  id: number;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number; // ms
}

withDefaults(
  defineProps<{ position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' }>(),
  {
    position: 'bottom-left',
  },
);

const toasts = ref<Toast[]>([]);
let idCounter = 1;

const timers = new Map<number, ReturnType<typeof setTimeout>>();
const remaining = new Map<number, number>();
const startedAt = new Map<number, number>();

const icons = {
  success: 'check',
  error: 'alert',
  warning: 'alert',
  info: 'info',
} as const;

function startTimer(toast: Toast) {
  const duration = toast.duration ?? 3500;
  if (duration <= 0) return;
  remaining.set(toast.id, duration);
  startedAt.set(toast.id, Date.now());
  timers.set(
    toast.id,
    setTimeout(() => removeToast(toast.id), duration),
  );
}

function clearTimer(id: number, keepRemaining: boolean) {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
  if (keepRemaining) {
    const left = (remaining.get(id) ?? 0) - (Date.now() - (startedAt.get(id) ?? Date.now()));
    remaining.set(id, Math.max(0, left));
  }
}

function pauseToast(id: number) {
  clearTimer(id, true);
}

function resumeToast(id: number) {
  if (timers.has(id)) return;
  const toast = toasts.value.find((t) => t.id === id);
  if (!toast) return;
  const left = remaining.get(id) ?? 0;
  if (left <= 0) {
    removeToast(id);
    return;
  }
  startedAt.set(id, Date.now());
  timers.set(
    id,
    setTimeout(() => removeToast(id), left),
  );
}

function addToast(t: Omit<Toast, 'id'>) {
  const toast: Toast = { id: idCounter++, duration: 3500, type: 'info', ...t };
  toasts.value.push(toast);
  // No máximo 3 avisos na tela; o mais antigo sai.
  while (toasts.value.length > 3) {
    const oldest = toasts.value[0];
    if (!oldest) break;
    removeToast(oldest.id);
  }
  startTimer(toast);
}

function removeToast(id: number) {
  clearTimer(id, false);
  remaining.delete(id);
  startedAt.delete(id);
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

function onToast(e: Event) {
  const detail = (e as CustomEvent).detail as Omit<Toast, 'id'> | undefined;
  if (!detail) return;
  addToast(detail);
}

onMounted(() => {
  window.addEventListener('tod:toast', onToast as EventListener);
});

onBeforeUnmount(() => {
  window.removeEventListener('tod:toast', onToast as EventListener);
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
});
</script>

<template>
  <div
    class="toast-host"
    :class="position"
    role="status"
    aria-live="polite"
    aria-atomic="false"
    aria-relevant="additions text"
  >
    <TransitionGroup name="toast" tag="div" class="toast-stack">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="`toast--${t.type}`"
        :role="t.type === 'error' ? 'alert' : 'status'"
        :aria-live="t.type === 'error' ? 'assertive' : 'polite'"
        aria-atomic="true"
        @mouseenter="pauseToast(t.id)"
        @mouseleave="resumeToast(t.id)"
        @focusin="pauseToast(t.id)"
        @focusout="resumeToast(t.id)"
      >
        <Icon class="toast__icon" :name="icons[t.type ?? 'info']" :size="18" />
        <span class="toast__message">{{ t.message }}</span>
        <button
          type="button"
          class="toast__close"
          aria-label="Fechar aviso"
          @click="removeToast(t.id)"
        >
          <Icon name="close" :size="16" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  z-index: 2000;
  pointer-events: none;
}

.toast-host.top-right {
  top: var(--s-5);
  right: var(--s-5);
}

.toast-host.top-left {
  top: var(--s-5);
  left: var(--s-5);
}

.toast-host.bottom-right {
  right: var(--s-5);
  bottom: var(--s-5);
}

.toast-host.bottom-left {
  bottom: var(--s-5);
  left: var(--s-5);
}

.toast-stack {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  max-width: min(400px, calc(100vw - 24px));
  padding: var(--s-3) var(--s-3) var(--s-3) var(--s-4);
  border: 1px solid var(--line-strong);
  border-left-width: 3px;
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  font-size: var(--text-md);
  line-height: 1.45;
  box-shadow: 0 8px 24px -12px rgb(0 0 0 / 0.8);
  pointer-events: auto;
}

.toast--success {
  border-left-color: var(--success-ink);
}

.toast--error {
  border-left-color: var(--danger-ink);
}

.toast--warning {
  border-left-color: var(--manila);
}

.toast--info {
  border-left-color: var(--accent-ink);
}

.toast__icon {
  flex: none;
  margin-top: 1px;
}

.toast--success .toast__icon {
  color: var(--success-ink);
}

.toast--error .toast__icon {
  color: var(--danger-ink);
}

.toast--warning .toast__icon {
  color: var(--manila);
}

.toast--info .toast__icon {
  color: var(--accent-ink);
}

.toast__message {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}

.toast__close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  inline-size: 32px;
  block-size: 32px;
  margin: -6px -6px -6px 0;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
}

.toast__close:hover {
  background: var(--panel);
  color: var(--text);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.toast-enter-active {
  transition: opacity var(--dur-pop) var(--ease-out),
    transform var(--dur-pop) var(--ease-out);
}

.toast-leave-active {
  transition: opacity var(--dur-hover) var(--ease-in),
    transform var(--dur-hover) var(--ease-in);
}

@media (max-width: 900px) {
  .toast-host.top-right,
  .toast-host.bottom-right {
    right: var(--s-3);
  }

  .toast-host.top-left,
  .toast-host.bottom-left {
    left: var(--s-3);
  }

  .toast-host.top-right,
  .toast-host.top-left {
    top: var(--s-3);
  }

  .toast-host.bottom-right,
  .toast-host.bottom-left {
    bottom: calc(88px + env(safe-area-inset-bottom, 0px));
  }

  .toast__close {
    inline-size: 44px;
    block-size: 44px;
    margin: -10px -8px -10px 0;
  }
}
</style>
