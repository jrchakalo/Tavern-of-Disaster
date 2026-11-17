<script setup lang="ts">
import { ref } from 'vue';
import DiceRoller from '../components/DiceRoller.vue';
import ActionLog from '../components/ActionLog.vue';
import type { DiceRolledPayload, LogEntry } from '../types';

const localLogs = ref<LogEntry[]>([]);
const LOG_LIMIT = 50;

function createLogId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildRollLogEntry(payload: DiceRolledPayload): LogEntry {
  const label = payload.metadata || payload.tags?.[0] || 'Rolagem';
  const rollsDisplay = payload.rolls.length
    ? payload.rolls.map((roll) => (roll.kept === 'kept' ? `${roll.value}` : `(${roll.value})`)).join(', ')
    : '—';
  const modifierText = payload.modifier === 0
    ? ''
    : payload.modifier > 0
      ? ` + ${payload.modifier}`
      : ` - ${Math.abs(payload.modifier)}`;
  const detail = `${payload.expression} → [${rollsDisplay}]${modifierText} = ${payload.total}`;
  return {
    id: createLogId(),
    type: 'roll',
    authorId: payload.userId,
    authorName: payload.username,
    createdAt: payload.createdAt,
    content: `${label}: ${detail}`,
    raw: payload,
  };
}

function handleLocalRoll(payload: DiceRolledPayload) {
  localLogs.value = [...localLogs.value.slice(-(LOG_LIMIT - 1)), buildRollLogEntry(payload)];
}

function clearLogs() {
  localLogs.value = [];
}
</script>

<template>
  <div class="dice-sandbox-view">
    <header class="hero">
      <p class="hero__eyebrow">Ferramentas públicas</p>
      <h1>Sandbox de Dados</h1>
      <p class="hero__lead">
        Teste expressões, presets e rolagens antes de entrar em uma mesa. Tudo roda localmente — sem precisar estar logado.
      </p>
    </header>

    <section class="sandbox-grid">
      <div class="roller-card surface">
        <DiceRoller
          table-id="sandbox"
          mode="embedded"
          transport="local"
          @local-roll="handleLocalRoll"
        />
        <p class="helper-text">
          Exemplos: <code>2d6+3</code>, <code>4d8kh2+1</code>, <code>1d20adv+5</code>. Use presets para salvar combinações.
        </p>
      </div>

      <div class="log-card surface">
        <header class="log-card__header">
          <div>
            <p class="eyebrow">Histórico local</p>
            <h2>Suas últimas rolagens</h2>
          </div>
          <button
            class="clear-btn"
            type="button"
            :disabled="localLogs.length === 0"
            @click="clearLogs"
          >
            Limpar
          </button>
        </header>
        <ActionLog v-if="localLogs.length" :logs="localLogs" />
        <p v-else class="log-empty">Nenhuma rolagem ainda — experimente lançar alguns dados!</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dice-sandbox-view {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--s-7) var(--s-5) var(--s-9);
  color: var(--text);
}

.hero {
  margin-bottom: var(--s-7);
  text-align: center;
}

.hero__eyebrow {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.01em;
  text-transform: none;
}

.hero h1 {
  margin: var(--s-2) 0 var(--s-3);
  font-size: clamp(2rem, 4vw, 2.75rem);
}

.hero__lead {
  max-width: 60ch;
  margin: 0 auto;
  color: var(--text-muted);
  font-size: var(--text-lg);
  line-height: 1.55;
}

.sandbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--s-6);
  align-items: flex-start;
}

.surface {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--panel);
  box-shadow: none;
}

.roller-card {
  padding: var(--s-5);
}

.helper-text {
  margin-top: var(--s-4);
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-body);
}

.helper-text code {
  padding: 1px var(--s-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--raised);
  color: var(--text);
  font-family: var(--font-data);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.log-card {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  padding: var(--s-5);
}

.log-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-4);
}

.eyebrow {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

.log-card h2 {
  margin: var(--s-1) 0 0;
  font-size: var(--text-xl);
}

.clear-btn {
  flex: 0 0 auto;
  min-height: 40px;
  padding: 0 var(--s-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--dur-hover) var(--ease-out),
    border-color var(--dur-hover) var(--ease-out);
}

.clear-btn:hover:not(:disabled) {
  background: var(--raised-2);
}

.clear-btn:active:not(:disabled) {
  transform: translateY(1px);
  transition-duration: var(--dur-press);
}

.clear-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.clear-btn:disabled {
  border-color: var(--line);
  background: transparent;
  color: var(--text-muted);
  cursor: not-allowed;
}

.log-empty {
  margin: var(--s-8) 0;
  color: var(--text-muted);
  font-size: var(--text-md);
  line-height: var(--leading-body);
  text-align: center;
}

@media (max-width: 640px) {
  .roller-card,
  .log-card {
    padding: var(--s-4);
  }

  .clear-btn {
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .clear-btn {
    transition: none;
  }
}
</style>
