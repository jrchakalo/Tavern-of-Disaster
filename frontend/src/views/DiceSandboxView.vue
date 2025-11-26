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
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px 80px;
  color: var(--color-text, #f5f2ff);
}
.hero {
  text-align: center;
  margin-bottom: 32px;
}
.hero__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.75rem;
  margin: 0;
  color: var(--color-text-muted, #c3bdd8);
}
.hero h1 {
  margin: 6px 0 12px;
  font-size: clamp(2rem, 4vw, 3rem);
}
.hero__lead {
  margin: 0 auto;
  max-width: 640px;
  color: var(--color-text-muted, #cfc7e2);
}
.sandbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
  align-items: flex-start;
}
.surface {
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.15));
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(19, 14, 25, 0.95), rgba(7, 5, 10, 0.96));
  box-shadow: var(--elev-2, 0 10px 30px rgba(0, 0, 0, 0.35));
}
.roller-card {
  padding: 24px;
}
.helper-text {
  margin-top: 16px;
  font-size: 0.9rem;
  color: var(--color-text-muted, #cbc3da);
}
.helper-text code {
  background: rgba(255, 255, 255, 0.07);
  padding: 2px 6px;
  border-radius: 6px;
}
.log-card {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.log-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.eyebrow {
  margin: 0;
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  color: var(--color-text-muted, #c3bdd8);
}
.log-card h2 {
  margin: 4px 0 0;
  font-size: 1.2rem;
}
.clear-btn {
  border-radius: 999px;
  padding: 8px 16px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.15));
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.log-empty {
  text-align: center;
  color: var(--color-text-muted, #c3bdd8);
  margin: 40px 0;
}
@media (max-width: 640px) {
  .roller-card,
  .log-card {
    padding: 20px;
  }
}
</style>
