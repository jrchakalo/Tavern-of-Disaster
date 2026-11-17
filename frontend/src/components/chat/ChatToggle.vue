<script setup lang="ts">
import { computed } from 'vue';

import Icon from '../Icon.vue';

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
    <Icon name="message" :size="18" class="chat-toggle__icon" aria-hidden="true" />
    <span class="chat-toggle__label">{{ label }}</span>
    <span v-if="unread > 0" class="chat-toggle__badge" aria-hidden="true">{{ badge }}</span>
  </button>
</template>

<style scoped>
.chat-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-3);
  min-width: 44px;
  min-height: 44px;
  padding: 0 var(--s-5);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  box-shadow: none;
  transition: background-color var(--dur-hover) var(--ease-out),
    border-color var(--dur-hover) var(--ease-out),
    color var(--dur-hover) var(--ease-out);
}

.chat-toggle:hover {
  background: var(--raised);
  border-color: var(--line-strong);
  color: var(--text);
}

.chat-toggle__icon {
  flex: none;
}

.chat-toggle:active {
  transform: translateY(1px);
  transition-duration: var(--dur-press);
}

.chat-toggle.is-open {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}

.chat-toggle.is-open:hover {
  border-color: var(--accent-hover);
  background: var(--accent-hover);
  color: var(--on-accent);
}

.chat-toggle:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.chat-toggle__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 var(--s-1);
  border-radius: var(--radius-xs);
  background: var(--danger);
  color: var(--on-danger);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.chat-toggle.has-unread {
  border-color: var(--danger);
}

.chat-toggle.is-open.has-unread {
  border-color: var(--accent);
}

@media (prefers-reduced-motion: reduce) {
  .chat-toggle {
    transition: none;
  }
}
</style>
