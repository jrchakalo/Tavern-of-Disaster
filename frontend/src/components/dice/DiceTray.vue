<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CharacterDTO, DiceRolledPayload, RollDiceParams, RollLogEntryDTO } from '../../types';
import { socketService } from '../../services/socketService';
import { currentUser } from '../../services/authService';
import { rollLocalDice } from '../../services/localDiceEngine';
import { useTableStore } from '../../stores/tableStore';
import { useSystemStore } from '../../stores/systemStore';

type CharacterPreset = { key: string; label: string; expression: string };
type SystemPreset = { key: string; label: string; expression: string };

const props = withDefaults(
  defineProps<{
    tableId: string;
    currentTokenId?: string | null;
    /** Fichas do jogador; a ativa (ou a primeira) fornece presets de ataque. */
    characters?: CharacterDTO[];
    activeCharacterId?: string | null;
    recentRolls?: RollLogEntryDTO[];
    connectionStatus?: string;
  }>(),
  {
    currentTokenId: null,
    characters: () => [],
    activeCharacterId: null,
    recentRolls: () => [],
    connectionStatus: 'connected',
  },
);

const emit = defineEmits<{
  (e: 'roll-result', payload: DiceRolledPayload): void;
}>();

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100] as const;
const MAX_MODIFIER = 1000;
const ACK_TIMEOUT_MS = 5000;

const expression = ref('1d20');
const rollError = ref('');
const pending = ref(false);
const ownResult = ref<DiceRolledPayload | null>(null);
const resultRef = ref<HTMLElement | null>(null);

let pendingExpression: string | null = null;
let pendingAt = 0;
let ackTimer: ReturnType<typeof setTimeout> | null = null;
/** Restauração vinda do log não deve rolar o painel até o resultado. */
let skipNextResultScroll = false;

const isOffline = computed(() => props.connectionStatus !== 'connected');

const normalizedExpression = computed(() =>
  expression.value.trim().toLowerCase().replace(/\s+/g, ''),
);

function stripModifier(value: string): string {
  return value.replace(/[+-]\d+$/, '');
}

const modifier = computed(() => {
  const match = normalizedExpression.value.match(/([+-]\d+)$/);
  return match ? Number(match[1]) : 0;
});

const currentAdvantage = computed<'adv' | 'dis' | null>(() => {
  const core = stripModifier(normalizedExpression.value);
  if (core.endsWith('adv')) return 'adv';
  if (core.endsWith('dis')) return 'dis';
  return null;
});

const isExplosive = computed(() => normalizedExpression.value.includes('!'));

const expressionHint = computed(() => {
  if (isOffline.value) return 'Sem conexão — a rolagem fica indisponível.';
  if (modifier.value > 0) return `Expressão com +${modifier.value} de modificador.`;
  if (modifier.value < 0) return `Expressão com ${modifier.value} de modificador.`;
  return 'Aceita notação como 2d6+3, 1d20adv+5 ou 1d10!.';
});

function applyModifier(value: number) {
  const bounded = Math.max(-MAX_MODIFIER, Math.min(MAX_MODIFIER, Math.trunc(value)));
  const core = stripModifier(normalizedExpression.value);
  expression.value = bounded === 0 ? core : `${core}${bounded > 0 ? '+' : ''}${bounded}`;
  rollError.value = '';
}

function updateModifierFromInput(event: Event) {
  const target = event.target as HTMLInputElement | null;
  const parsed = Number(target?.value ?? 0);
  applyModifier(Number.isFinite(parsed) ? parsed : 0);
}

function adjustModifier(delta: number) {
  applyModifier(modifier.value + delta);
}

function toggleAdvantage(kind: 'adv' | 'dis') {
  const mod = normalizedExpression.value.match(/[+-]\d+$/)?.[0] ?? '';
  let core = stripModifier(normalizedExpression.value).replace(/(adv|dis)$/, '');
  if (!/^\d*d\d+/.test(core)) core = '1d20';
  if (currentAdvantage.value !== kind) core += kind;
  expression.value = `${core}${mod}`;
  rollError.value = '';
}

function applyDie(sides: number) {
  const mod = normalizedExpression.value.match(/[+-]\d+$/)?.[0] ?? '';
  const advantage = currentAdvantage.value;
  expression.value = `1d${sides}${advantage ?? ''}${mod}`;
  rollError.value = '';
}

function applyPreset(value: string) {
  expression.value = value;
  rollError.value = '';
}

function attackExpression(attack: { bonus?: string; damage?: string }): string {
  const damage = (attack.damage ?? '').match(/\d*d\d+(?:[+-]\d+)?/i)?.[0];
  if (damage) return damage.toLowerCase();
  const bonus = (attack.bonus ?? '').trim().replace(/\s+/g, '');
  if (/^[+-]\d+$/.test(bonus)) return `1d20${bonus}`;
  return '';
}

const activeCharacter = computed<CharacterDTO | null>(() => {
  const byId = props.characters.find((character) => character._id === props.activeCharacterId);
  return byId ?? props.characters[0] ?? null;
});

const characterPresets = computed<CharacterPreset[]>(() => {
  const character = activeCharacter.value;
  if (!character?.attacks?.length) return [];
  const seen = new Set<string>();
  const presets: CharacterPreset[] = [];
  for (const attack of character.attacks) {
    const value = attackExpression(attack);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    presets.push({
      key: `${attack.name}-${value}`,
      label: attack.name || 'Ataque',
      expression: value,
    });
    if (presets.length >= 6) break;
  }
  return presets;
});

function tableSnapshot() {
  try {
    const table = useTableStore().currentTable;
    if (!table || table._id !== props.tableId) return null;
    return table;
  } catch {
    return null;
  }
}

const resolvedSystem = computed(() => {
  try {
    const table = tableSnapshot();
    if (!table) return null;
    return useSystemStore().currentSystemForTable(table);
  } catch {
    return null;
  }
});

const systemPresets = computed<SystemPreset[]>(() =>
  (resolvedSystem.value?.dicePresets ?? []).map((preset) => ({
    key: preset.key,
    label: preset.label,
    expression: preset.expression,
  })),
);

watch(
  () => {
    const table = tableSnapshot();
    return table ? `${table.systemId ?? ''}|${table.systemKey ?? ''}` : '';
  },
  (key) => {
    if (!key) return;
    try {
      void useSystemStore().fetchAll().catch(() => undefined);
    } catch {
      // Sem Pinia (teste isolado): presets do sistema ficam para a próxima carga.
    }
  },
  { immediate: true },
);

const lastRolls = computed(() =>
  [...(props.recentRolls ?? [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3),
);

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function clearAckTimer() {
  if (ackTimer) {
    clearTimeout(ackTimer);
    ackTimer = null;
  }
}

function finishPending() {
  pending.value = false;
  pendingExpression = null;
  clearAckTimer();
}

function acceptOwnRoll(payload: DiceRolledPayload) {
  if (payload.tableId && payload.tableId !== props.tableId) return;
  if (payload.userId !== currentUser.value?.id) return;
  ownResult.value = payload;
  emit('roll-result', payload);
  finishPending();
}

watch(ownResult, async (value) => {
  if (!value) return;
  if (skipNextResultScroll) {
    skipNextResultScroll = false;
    return;
  }
  await nextTick();
  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  resultRef.value?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
});

function isOwnPendingRoll(payload: DiceRolledPayload): boolean {
  if (!pendingExpression) return false;
  if (payload.tableId && payload.tableId !== props.tableId) return false;
  if (payload.userId !== currentUser.value?.id) return false;
  if (payload.expression.toLowerCase() !== pendingExpression.toLowerCase()) return false;
  const createdAt = new Date(payload.createdAt).getTime();
  return Number.isNaN(createdAt) || createdAt >= pendingAt - 2000;
}

type SocketLike = {
  on: (event: string, listener: (payload: unknown) => void) => unknown;
  off: (event: string, listener: (payload: unknown) => void) => unknown;
};

function readSocket(): SocketLike | null {
  const candidate = (socketService as unknown as { socket?: unknown }).socket;
  if (!candidate || typeof candidate !== 'object') return null;
  const socket = candidate as { on?: unknown; off?: unknown };
  return typeof socket.on === 'function' && typeof socket.off === 'function'
    ? (candidate as SocketLike)
    : null;
}

function handleDiceRolled(payload: unknown) {
  if (!payload || typeof payload !== 'object') return;
  const roll = payload as DiceRolledPayload;
  if (isOwnPendingRoll(roll)) acceptOwnRoll(roll);
}

onMounted(() => {
  readSocket()?.on('diceRolled', handleDiceRolled);
});

onBeforeUnmount(() => {
  finishPending();
  readSocket()?.off('diceRolled', handleDiceRolled);
});

// Fallback canônico: o log de rolagens da mesa já é alimentado pelo store.
watch(
  () => props.recentRolls,
  (rolls) => {
    if (!pendingExpression) return;
    const match = rolls.find((roll) => isOwnPendingRoll(roll));
    if (match) acceptOwnRoll(match);
  },
);

/**
 * O resultado próprio continua na aba Dados quando o jogador volta para ela
 * (troca de aba desmonta o tray). A fonte é o log canônico da mesa e o
 * `roll-result` não é reemitido — o momento assinatura não reaparece sozinho.
 */
watch(
  () => props.recentRolls,
  (rolls) => {
    if (ownResult.value) return;
    const userId = currentUser.value?.id;
    if (!userId) return;
    const mine = [...rolls]
      .filter(
        (roll) => roll.userId === userId && (!roll.tableId || roll.tableId === props.tableId),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (!mine) return;
    skipNextResultScroll = true;
    ownResult.value = mine;
  },
  { immediate: true },
);

async function roll() {
  if (pending.value) return;
  if (isOffline.value) {
    rollError.value = 'Sem conexão — a rolagem não pode ser enviada agora.';
    return;
  }
  const expr = normalizedExpression.value;
  if (!expr) {
    rollError.value = 'Informe uma expressão de dado.';
    return;
  }
  try {
    // Mesmo motor/limites do servidor: valida a notação antes de emitir.
    rollLocalDice(expr);
  } catch (error) {
    rollError.value = error instanceof Error ? error.message : 'Expressão de dados inválida.';
    return;
  }

  rollError.value = '';
  ownResult.value = null;
  pending.value = true;
  pendingExpression = expr;
  pendingAt = Date.now();
  clearAckTimer();
  ackTimer = setTimeout(() => {
    if (!pendingExpression) return;
    rollError.value = 'O servidor não confirmou a rolagem. Tente novamente.';
    finishPending();
  }, ACK_TIMEOUT_MS);

  const params = {
    tableId: props.tableId,
    expression: expr,
    ...(props.currentTokenId ? { tokenId: props.currentTokenId } : {}),
    ...(activeCharacter.value ? { characterId: activeCharacter.value._id } : {}),
  } as RollDiceParams;

  try {
    const connected =
      typeof socketService.isConnected === 'function' ? socketService.isConnected() : true;
    if (!connected) {
      rollError.value = 'Sem conexão com o servidor.';
      finishPending();
      return;
    }
    const ack = await socketService.rollDice(params, undefined, { silent: true });
    if (ack && ack.ok === false) {
      rollError.value = ack.error?.message || 'A rolagem foi recusada pelo servidor.';
      finishPending();
    }
  } catch (error) {
    rollError.value =
      error instanceof Error ? error.message : 'Não foi possível enviar a rolagem.';
    finishPending();
  }
}

function formatRollDice(payload: DiceRolledPayload): string {
  const kept = payload.rolls.filter((roll) => roll.kept === 'kept');
  const dropped = payload.rolls.filter((roll) => roll.kept !== 'kept');
  const keptValues = kept.slice(0, 12).map((roll) => `${roll.value}`);
  const keptText = keptValues.join(' · ') + (kept.length > 12 ? ' …' : '');
  const droppedText = dropped.length
    ? ` (${dropped.slice(0, 6).map((roll) => roll.value).join(' · ')}${dropped.length > 6 ? ' …' : ''} descartado${dropped.length > 1 ? 's' : ''})`
    : '';
  return keptText ? `${keptText}${droppedText}` : '—';
}
</script>

<template>
  <section class="dice-roller dice-tray" aria-label="Dados da mesa">
    <div class="dice-tray__expression">
      <label class="dice-tray__label" for="dice-expression">Expressão</label>
      <input
        id="dice-expression"
        v-model="expression"
        type="text"
        inputmode="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="Ex.: 2d6+3"
        :aria-describedby="'dice-expression-hint'"
        @input="rollError = ''"
        @keydown.enter.prevent="roll"
      />
      <p id="dice-expression-hint" class="dice-tray__hint">{{ expressionHint }}</p>
    </div>

    <div class="dice-tray__modifier">
      <span class="dice-tray__label">Modificador</span>
      <div class="dice-tray__modifier-control">
        <button
          type="button"
          class="dice-tray__stepper"
          aria-label="Diminuir modificador em 1"
          @click="adjustModifier(-1)"
        >
          −
        </button>
        <input
          class="dice-tray__modifier-input"
          type="number"
          inputmode="numeric"
          :value="modifier"
          aria-label="Modificador da rolagem"
          @input="updateModifierFromInput"
        />
        <button
          type="button"
          class="dice-tray__stepper"
          aria-label="Aumentar modificador em 1"
          @click="adjustModifier(1)"
        >
          +
        </button>
      </div>
    </div>

    <div class="dice-tray__group" role="group" aria-label="Dados rápidos">
      <button
        v-for="sides in QUICK_DICE"
        :key="sides"
        type="button"
        class="dice-tray__die shortcut-btn"
        :aria-label="`Usar um d${sides}`"
        @click="applyDie(sides)"
      >
        d{{ sides }}
      </button>
    </div>

    <div class="dice-tray__group dice-tray__group--options" role="group" aria-label="Vantagem">
      <button
        type="button"
        class="dice-tray__option"
        :class="{ 'is-active': currentAdvantage === 'adv' }"
        :aria-pressed="currentAdvantage === 'adv'"
        @click="toggleAdvantage('adv')"
      >
        Vantagem
      </button>
      <button
        type="button"
        class="dice-tray__option"
        :class="{ 'is-active': currentAdvantage === 'dis' }"
        :aria-pressed="currentAdvantage === 'dis'"
        @click="toggleAdvantage('dis')"
      >
        Desvantagem
      </button>
    </div>

    <p v-if="isExplosive" class="dice-tray__notice" role="status">
      Dados explosivos (<code>!</code>): cada dado no máximo rola de novo e soma.
    </p>

    <div v-if="characterPresets.length" class="dice-tray__presets">
      <p class="dice-tray__label">Presets de {{ activeCharacter?.name }}</p>
      <div class="dice-tray__preset-grid">
        <button
          v-for="preset in characterPresets"
          :key="preset.key"
          type="button"
          class="dice-tray__preset"
          :aria-label="`${preset.label}: ${preset.expression}`"
          @click="applyPreset(preset.expression)"
        >
          <span>{{ preset.label }}</span>
          <small>{{ preset.expression }}</small>
        </button>
      </div>
    </div>

    <div v-if="systemPresets.length" class="dice-tray__presets system-presets">
      <p class="dice-tray__label">Presets do sistema</p>
      <div class="dice-tray__preset-grid">
        <button
          v-for="preset in systemPresets"
          :key="preset.key"
          type="button"
          class="dice-tray__preset system-preset-btn"
          :aria-label="`${preset.label}: ${preset.expression}`"
          @click="applyPreset(preset.expression)"
        >
          <span>{{ preset.label }}</span>
          <small>{{ preset.expression }}</small>
        </button>
      </div>
    </div>

    <button type="button" class="primary dice-tray__roll" :disabled="pending || isOffline" @click="roll">
      {{ pending ? 'Rolando…' : 'Rolar' }}
    </button>

    <p v-if="rollError" class="dice-tray__error" role="alert" aria-live="assertive">
      {{ rollError }}
    </p>
    <p v-else-if="isOffline" class="dice-tray__error" role="status">
      Sem conexão — a rolagem fica indisponível até reconectar.
    </p>
    <p v-else-if="pending" class="dice-tray__pending" role="status" aria-live="polite">
      Rolando {{ normalizedExpression }}…
    </p>

    <section
      v-if="ownResult"
      ref="resultRef"
      class="dice-tray__result"
      role="status"
      aria-live="polite"
      data-testid="dice-result"
    >
      <div class="dice-tray__result-head">
        <span class="dice-tray__label">Sua rolagem</span>
        <time class="dice-tray__time" :datetime="ownResult.createdAt">
          {{ formatTime(ownResult.createdAt) }}
        </time>
      </div>
      <p class="dice-tray__total">{{ ownResult.total }}</p>
      <p class="dice-tray__formula">
        {{ ownResult.expression }}
        <span v-if="ownResult.modifier">({{ ownResult.modifier > 0 ? '+' : '' }}{{ ownResult.modifier }})</span>
      </p>
      <p class="dice-tray__dice">{{ formatRollDice(ownResult) }}</p>
    </section>

    <section v-if="lastRolls.length" class="dice-tray__recent" aria-labelledby="dice-recent-title">
      <h3 id="dice-recent-title" class="dice-tray__recent-title">Últimas rolagens</h3>
      <ol class="dice-tray__recent-list">
        <li v-for="roll in lastRolls" :key="`${roll.createdAt}-${roll.userId}-${roll.expression}-${roll.total}`">
          <span class="dice-tray__actor">{{ roll.username || 'Alguém' }}</span>
          <span class="dice-tray__recent-expression">{{ roll.expression }}</span>
          <strong class="dice-tray__recent-total">{{ roll.total }}</strong>
          <time class="dice-tray__time" :datetime="roll.createdAt">{{ formatTime(roll.createdAt) }}</time>
        </li>
      </ol>
    </section>
  </section>
</template>

<style scoped>
.dice-roller.dice-tray {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  min-width: 0;
  max-width: 100%;
  color: var(--text);
}

.dice-tray__expression {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
}

.dice-tray__label {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.dice-tray__expression input,
.dice-tray__modifier-input {
  width: 100%;
  min-height: 48px;
  font-family: var(--font-data);
  font-size: var(--text-base);
}

.dice-tray__hint,
.dice-tray__notice {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-2xs);
}

.dice-tray__notice {
  padding: var(--s-2) var(--s-3);
  border-left: 2px solid var(--manila);
  color: var(--text-muted);
}

.dice-tray__notice code {
  color: var(--manila);
}

.dice-tray__modifier {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.dice-tray__modifier-control {
  display: flex;
  align-items: stretch;
  gap: var(--s-2);
}

.dice-tray__modifier-input {
  flex: 1;
  min-width: 0;
  text-align: center;
}

.dice-tray__stepper {
  flex: 0 0 auto;
  width: 44px;
  min-height: 48px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  font-family: var(--font-data);
  font-size: var(--text-lg);
  line-height: 1;
}

.dice-tray__stepper:hover {
  border-color: var(--accent-ink);
  color: var(--accent-ink);
}

.dice-tray__group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
  gap: var(--s-2);
}

.dice-tray__group--options {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.dice-tray__die,
.dice-tray__option {
  min-height: 44px;
  padding: 0 var(--s-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  font-family: var(--font-data);
  font-size: var(--text-sm);
  font-weight: 500;
}

.dice-tray__die:hover,
.dice-tray__option:hover {
  border-color: var(--accent-ink);
  color: var(--accent-ink);
}

.dice-tray__option.is-active {
  border-color: var(--accent-ink);
  background: var(--raised-2);
  color: var(--accent-ink);
  box-shadow: inset 0 -2px 0 var(--accent-ink);
}

.dice-tray__presets {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
}

.dice-tray__preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--s-2);
}

.dice-tray__preset {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 44px;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  font-size: var(--text-xs);
  text-align: left;
}

.dice-tray__preset small {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.dice-tray__preset:hover {
  border-color: var(--accent-ink);
}

.dice-tray__roll {
  min-height: 52px;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--on-accent);
  font-size: var(--text-base);
  font-weight: 600;
}

.dice-tray__roll:hover {
  background: var(--accent-hover);
}

.dice-tray__roll:disabled {
  background: var(--raised);
  color: var(--text-muted);
}

.dice-tray__error,
.dice-tray__pending {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border-left: 2px solid var(--danger);
  background: rgb(178 58 50 / 0.12);
  color: var(--danger-ink);
  font-size: var(--text-sm);
}

.dice-tray__pending {
  border-left-color: var(--accent-ink);
  background: var(--raised);
  color: var(--text-muted);
}

.dice-tray__result {
  padding: var(--s-4);
  border: 1px solid var(--accent-ink);
  border-radius: var(--radius-sm);
  background: var(--raised);
}

.dice-tray__result-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
}

.dice-tray__total {
  margin: var(--s-1) 0 0;
  color: var(--text);
  font-family: var(--font-data);
  font-size: var(--text-2xl);
  font-weight: 500;
  line-height: 1.1;
}

.dice-tray__formula,
.dice-tray__dice {
  margin: var(--s-1) 0 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}

.dice-tray__recent {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
}

.dice-tray__recent-title {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 500;
}

.dice-tray__recent-list {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.dice-tray__recent-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--s-2);
  min-height: 28px;
  padding: 2px 0;
  border-bottom: 1px solid var(--line);
}

.dice-tray__recent-list li:last-child {
  border-bottom: 0;
}

.dice-tray__actor {
  flex: 1 1 90px;
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dice-tray__recent-expression {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.dice-tray__recent-total {
  color: var(--manila);
  font-family: var(--font-data);
  font-size: var(--text-sm);
  font-weight: 500;
}

.dice-tray__time {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.dice-tray__die:focus-visible,
.dice-tray__option:focus-visible,
.dice-tray__stepper:focus-visible,
.dice-tray__preset:focus-visible,
.dice-tray__roll:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

@media (max-width: 360px) {
  .dice-tray__preset-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
