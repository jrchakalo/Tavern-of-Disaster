<script setup lang="ts">
import { computed } from 'vue';
import type { ConnectionStatus } from '../../stores/tableStore';

const props = defineProps<{ status: ConnectionStatus }>();

const label = computed(() => {
  switch (props.status) {
    case 'connecting':
      return 'Conectando…';
    case 'reconnecting':
      return 'Reconectando…';
    case 'disconnected':
      return 'Desconectado';
    case 'error':
      return 'Erro de conexão';
    default:
      return 'Conectado';
  }
});

const tone = computed(() => `tone-${props.status}`);
</script>

<template>
  <span class="connection-pill" :class="tone" role="status" :aria-label="`Conexão: ${label}`">
    <span class="connection-pill__dot" aria-hidden="true"></span>
    {{ label }}
  </span>
</template>

<style scoped>
.connection-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border);
  background: var(--color-surface-alt);
  color: var(--color-text);
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.connection-pill__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted);
  flex: 0 0 auto;
}

.connection-pill.tone-connected .connection-pill__dot {
  background: var(--color-success);
  box-shadow: 0 0 6px var(--color-success);
}

.connection-pill.tone-connecting .connection-pill__dot,
.connection-pill.tone-reconnecting .connection-pill__dot {
  background: var(--color-warning);
}

.connection-pill.tone-disconnected .connection-pill__dot,
.connection-pill.tone-error .connection-pill__dot {
  background: var(--color-danger);
}
</style>
