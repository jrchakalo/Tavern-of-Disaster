<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    unread?: number;
    open?: boolean;
    /** Texto visível; o rótulo acessível inclui a contagem. */
    label?: string;
  }>(),
  { unread: 0, open: false, label: 'Chat' },
);

const emit = defineEmits<{ (e: 'toggle'): void }>();

const badge = computed(() => (props.unread > 99 ? '99+' : String(props.unread)));
const ariaLabel = computed(() => {
  const base = props.open ? 'Fechar chat' : 'Abrir chat';
  return props.unread > 0
    ? `${base}, ${props.unread} ${props.unread === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`
    : base;
});
</script>

<template>
  <button
    type="button"
    class="chat-toggle"
    :class="{ 'is-open': open, 'has-unread': unread > 0 }"
    :aria-label="ariaLabel"
    :aria-expanded="open"
    data-testid="chat-toggle"
    @click="emit('toggle')"
  >
    <span class="chat-toggle__label">{{ label }}</span>
    <span v-if="unread > 0" class="chat-toggle__badge" aria-hidden="true">{{ badge }}</span>
  </button>
</template>

<style scoped>
.chat-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 44px;
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid var(--color-border, #4b3a44);
  border-radius: 999px;
  background: linear-gradient(180deg, var(--color-surface, #463641), var(--color-surface-alt, #3a2c34));
  color: var(--color-text, #f3e9ef);
  font: inherit;
  font-weight: 600;
  font-size: 0.92rem;
  cursor: pointer;
  box-shadow: var(--elev-2, 0 10px 24px rgba(0, 0, 0, 0.35));
}

.chat-toggle:hover {
  background: var(--color-surface-alt, #3a2c34);
}

.chat-toggle.is-open {
  background: var(--color-accent, #c8a2c8);
  border-color: var(--color-accent, #c8a2c8);
  color: #0f0f15;
}

.chat-toggle:focus-visible {
  outline: 2px solid var(--color-warning, #f5a524);
  outline-offset: 2px;
}

.chat-toggle__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-danger, #e53935);
  color: #fff;
  font-size: 0.72rem;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.chat-toggle.has-unread {
  border-color: rgba(229, 57, 53, 0.65);
}

@media (prefers-reduced-motion: reduce) {
  .chat-toggle {
    transition: none;
  }
}
</style>
