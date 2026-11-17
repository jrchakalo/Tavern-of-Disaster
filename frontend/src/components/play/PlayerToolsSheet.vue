<script setup lang="ts">
import BaseSheet from '../ui/BaseSheet.vue';
import Icon from '../Icon.vue';
import type { PlayerTool } from './usePlayerTools';

withDefaults(
  defineProps<{
    open?: boolean;
    hasMeasurement?: boolean;
    activeTool?: PlayerTool;
    available?: boolean;
    note?: string;
  }>(),
  {
    open: false,
    hasMeasurement: false,
    activeTool: 'none',
    available: true,
    note: '',
  },
);

const emit = defineEmits<{
  close: [];
  measure: [];
  ping: [];
  clear: [];
}>();
</script>

<template>
  <BaseSheet :open="open" title="Mesa" @close="emit('close')">
    <div class="player-tools">
      <section class="player-tools__section" aria-labelledby="player-tools-title">
        <h2 id="player-tools-title" class="player-tools__title">Ferramentas</h2>
        <p class="player-tools__intro">
          Meça distâncias e aponte quadrados para a mesa. A régua aparece para todos no
          seu turno; o ping aparece na hora.
        </p>

        <div class="player-tools__actions">
          <button
            type="button"
            class="player-tools__action player-tools__measure"
            :class="{ 'is-active': activeTool === 'ruler' }"
            :disabled="!available"
            :aria-pressed="activeTool === 'ruler'"
            @click="emit('measure')"
          >
            <span class="player-tools__icon" aria-hidden="true"><Icon name="ruler" :size="20" /></span>
            <span class="player-tools__copy">
              <span class="player-tools__label">Medir</span>
              <span class="player-tools__hint">Toque em dois quadrados para traçar a régua.</span>
            </span>
          </button>

          <button
            type="button"
            class="player-tools__action player-tools__ping"
            :class="{ 'is-active': activeTool === 'ping' }"
            :disabled="!available"
            :aria-pressed="activeTool === 'ping'"
            @click="emit('ping')"
          >
            <span class="player-tools__icon" aria-hidden="true"><Icon name="pin" :size="20" /></span>
            <span class="player-tools__copy">
              <span class="player-tools__label">Ping</span>
              <span class="player-tools__hint">Marque um quadrado no tabuleiro de todos.</span>
            </span>
          </button>

          <button
            v-if="hasMeasurement"
            type="button"
            class="player-tools__action player-tools__clear"
            @click="emit('clear')"
          >
            <span class="player-tools__icon" aria-hidden="true"><Icon name="clear" :size="20" /></span>
            <span class="player-tools__copy">
              <span class="player-tools__label">Limpar</span>
              <span class="player-tools__hint">Remove a sua régua do tabuleiro.</span>
            </span>
          </button>
        </div>

        <p v-if="note" class="player-tools__note">{{ note }}</p>
        <p v-if="!available" class="player-tools__note" role="status">
          Ferramentas indisponíveis agora. Volte quando a sessão estiver ao vivo.
        </p>
      </section>
    </div>
  </BaseSheet>
</template>

<style scoped>
.player-tools {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
  padding-bottom: var(--s-4);
}

.player-tools__section {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.player-tools__title {
  margin: 0;
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.2;
}

.player-tools__intro {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-body);
}

.player-tools__actions {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin-top: var(--s-1);
}

.player-tools__action {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  width: 100%;
  min-height: 56px;
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  text-align: left;
}

.player-tools__action:hover:not(:disabled) {
  border-color: var(--accent-ink);
  background: var(--raised-2);
}

.player-tools__action.is-active {
  border-color: var(--accent-ink);
  box-shadow: inset 2px 0 0 var(--accent-ink);
}

.player-tools__action:disabled {
  opacity: 0.5;
  color: var(--text-muted);
}

.player-tools__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--ink-0);
  color: var(--accent-ink);
}

.player-tools__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.player-tools__label {
  font-family: var(--font-sans);
  font-size: var(--text-md);
  font-weight: 600;
  line-height: 1.2;
}

.player-tools__hint {
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.3;
}

.player-tools__clear .player-tools__icon {
  color: var(--manila);
}

.player-tools__note {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border-left: 2px solid var(--manila);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.4;
}
</style>
