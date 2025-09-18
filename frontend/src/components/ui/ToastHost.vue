<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number; // ms
}

const props = withDefaults(defineProps<{ position?: 'top-right'|'top-left'|'bottom-right'|'bottom-left' }>(), {
  position: 'top-right'
});

const toasts = ref<Toast[]>([]);
let idCounter = 1;

function addToast(t: Omit<Toast, 'id'>) {
  const toast: Toast = { id: idCounter++, duration: 3500, type: 'info', ...t };
  toasts.value.push(toast);
  const dur = toast.duration ?? 3500;
  if (dur > 0) setTimeout(() => removeToast(toast.id), dur);
}
function removeToast(id: number) {
  toasts.value = toasts.value.filter(t => t.id !== id);
}

function onToast(e: Event) {
  const detail = (e as CustomEvent).detail as Omit<Toast, 'id'> | undefined;
  if (!detail) return;
  addToast(detail);
}

onMounted(() => {
  window.addEventListener('tod:toast', onToast as any);
});

onBeforeUnmount(() => {
  window.removeEventListener('tod:toast', onToast as any);
});
</script>

<template>
  <div class="toast-host" :class="position">
    <TransitionGroup name="toast" tag="div">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type" @click="removeToast(t.id)">
        <span class="message">{{ t.message }}</span>
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
.toast-host.top-right { top: 18px; right: 18px; }
.toast-host.top-left { top: 18px; left: 18px; }
.toast-host.bottom-right { bottom: 18px; right: 18px; }
.toast-host.bottom-left { bottom: 18px; left: 18px; }
.toast {
  pointer-events: auto;
  margin-top: 10px;
  min-width: 220px;
  max-width: 380px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  box-shadow: var(--elev-2);
  background: linear-gradient(180deg, var(--color-surface), var(--color-surface-alt));
  color: var(--color-text);
  font-weight: 600;
}
.toast.success { border-color: var(--color-success, #43a047); box-shadow: 0 0 0 1px rgba(67,160,71,0.35) inset; }
.toast.error { border-color: var(--color-danger, #e53935); box-shadow: 0 0 0 1px rgba(229,57,53,0.35) inset; }
.toast.info { border-color: var(--color-accent, #3c096c); box-shadow: 0 0 0 1px rgba(60,9,108,0.35) inset; }
.toast.warning { border-color: var(--color-warning, #f6ad55); box-shadow: 0 0 0 1px rgba(246,173,85,0.35) inset; }
.message { display:inline-block; }

.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-6px); }
.toast-enter-active, .toast-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
</style>
