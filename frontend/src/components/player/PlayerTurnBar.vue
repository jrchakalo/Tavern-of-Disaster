<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    remainingMeters: number;
    remainingSquares: number;
    moveMode?: boolean;
    canMove?: boolean;
    canEndTurn?: boolean;
    offline?: boolean;
    hasScene?: boolean;
    endingTurn?: boolean;
  }>(),
  {
    moveMode: false,
    canMove: true,
    canEndTurn: true,
    offline: false,
    hasScene: true,
    endingTurn: false,
  },
);

const emit = defineEmits<{
  (e: 'toggle-move'): void;
  (e: 'end-turn'): void;
}>();

const movementLabel = computed(
  () => `${props.remainingMeters.toFixed(1).replace('.', ',')} m · ${props.remainingSquares} quad`,
);

const blockedReason = computed(() => {
  if (props.offline) return 'Sem conexão — movimento indisponível.';
  if (!props.hasScene) return 'Sem cena ativa — movimento indisponível.';
  if (!props.canMove) return 'Aguardando o servidor liberar o movimento.';
  return '';
});

const instruction = computed(() =>
  props.moveMode ? 'Toque num quadrado destacado para escolher o destino.' : movementLabel.value,
);
</script>

<template>
  <div class="turn-bar" role="region" aria-label="Seu turno">
    <div class="turn-bar__status">
      <span class="turn-bar__eyebrow">Seu turno</span>
      <span class="turn-bar__movement">{{ instruction }}</span>
      <span v-if="blockedReason" class="turn-bar__reason">{{ blockedReason }}</span>
    </div>
    <div class="turn-bar__actions">
      <button
        type="button"
        class="turn-bar__btn turn-bar__btn--primary"
        :class="{ 'is-active': moveMode }"
        :aria-pressed="moveMode"
        :disabled="!canMove && !moveMode"
        :aria-describedby="blockedReason ? 'turn-bar-reason' : undefined"
        @click="emit('toggle-move')"
      >
        {{ moveMode ? 'Cancelar' : 'Mover' }}
      </button>
      <button
        type="button"
        class="turn-bar__btn turn-bar__btn--secondary"
        :disabled="!canEndTurn || endingTurn"
        :aria-describedby="blockedReason ? 'turn-bar-reason' : undefined"
        @click="emit('end-turn')"
      >
        {{ endingTurn ? 'Encerrando…' : 'Encerrar turno' }}
      </button>
    </div>
    <span v-if="blockedReason" id="turn-bar-reason" class="sr-only">{{ blockedReason }}</span>
  </div>
</template>

<style scoped>
.turn-bar {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-height: 56px;
  padding: var(--s-1) var(--s-4);
  border-top: 2px solid var(--manila);
  background: var(--raised);
}

.turn-bar__status {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.turn-bar__eyebrow {
  color: var(--manila);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  font-weight: 500;
  line-height: 1.2;
}

.turn-bar__movement {
  overflow: hidden;
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.turn-bar__reason {
  overflow: hidden;
  color: var(--danger-ink);
  font-size: var(--text-2xs);
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.turn-bar__actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--s-2);
}

.turn-bar__btn {
  min-height: 44px;
  padding: 0 var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  white-space: nowrap;
}

.turn-bar__btn:hover:not(:disabled) {
  border-color: var(--accent-ink);
}

.turn-bar__btn--primary {
  min-width: 88px;
  border-color: transparent;
  background: var(--accent);
  color: var(--on-accent);
}

.turn-bar__btn--primary.is-active {
  background: var(--manila);
  color: var(--on-manila);
}

.turn-bar__btn:disabled {
  border-color: var(--line);
  background: var(--panel);
  color: var(--text-muted);
  opacity: 0.7;
}

@media (max-width: 360px) {
  .turn-bar {
    gap: var(--s-2);
    padding-inline: var(--s-3);
  }

  .turn-bar__btn {
    padding-inline: var(--s-2);
    font-size: var(--text-xs);
  }

  .turn-bar__btn--primary {
    min-width: 72px;
  }
}
</style>
