<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed, watch } from 'vue';
import type { Character, DiceRolledPayload, SystemDTO } from '../types';
import { socketService } from '../services/socketService';
import { toast } from '../services/toast';
import { currentUser } from '../services/authService';
import { rollLocalDice } from '../services/localDiceEngine';
import { useTableStore } from '../stores/tableStore';
import { useSystemStore } from '../stores/systemStore';

const props = withDefaults(defineProps<{
  tableId: string;
  availableCharacters?: Character[];
  currentTokenId?: string | null;
  defaultExpression?: string;
  mode?: 'embedded' | 'popup';
  activeCharacterId?: string | null;
  transport?: 'socket' | 'local';
  system?: SystemDTO | null;
}>(), {
  availableCharacters: () => [],
  currentTokenId: null,
  defaultExpression: '1d20',
  mode: 'embedded',
  activeCharacterId: null,
  transport: 'socket',
  system: null,
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved-profile', preset: DicePreset): void;
  (e: 'local-roll', payload: DiceRolledPayload): void;
}>();

type BindingState = { type: 'none' | 'token' | 'character'; id?: string };
type DicePreset = { id: string; name: string; expression: string; tags?: string[]; metadata?: string };
type DiceStatus = { kind: 'idle' | 'pending' | 'success' | 'error'; text: string };

const expression = ref(props.defaultExpression ?? '1d20');
const savedPresets = ref<DicePreset[]>([]);
const selectedPresetId = ref<string | null>(null);
const selectedBindingKey = ref('none');
const status = ref<DiceStatus>({ kind: 'idle', text: '' });

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];

// --- Sistema da mesa (presets) ---------------------------------------------
// Sem `system` explícito (ex.: /play), resolve pelo tableStore: o mesmo
// DiceRoller passa a servir /table, /play e o sandbox sem mudar de API.

function tableSnapshot() {
  try {
    const table = useTableStore().currentTable;
    if (!table || table._id !== props.tableId) return null;
    return table;
  } catch {
    // Pinia indisponível (sandbox/teste sem app): sem sistema resolvido.
    return null;
  }
}

const resolvedSystem = computed<SystemDTO | null>(() => {
  if (props.system) return props.system;
  try {
    const table = tableSnapshot();
    if (!table) return null;
    return useSystemStore().currentSystemForTable(table);
  } catch {
    return null;
  }
});

const systemDicePresets = computed(() => resolvedSystem.value?.dicePresets ?? []);

watch(
  () => {
    const table = tableSnapshot();
    return table ? `${table.systemId ?? ''}|${table.systemKey ?? ''}` : '';
  },
  (key) => {
    if (!key || props.system) return;
    try {
      void useSystemStore().fetchAll().catch(() => undefined);
    } catch {
      // Sem pinia: presets ficam para a próxima carga.
    }
  },
  { immediate: true },
);

/** Indicador de dados explosivos (`!`, Cyberpunk RED) — §6.2. */
const isExplosive = computed(() => expression.value.includes('!'));

watch(
  () => props.defaultExpression,
  (value) => {
    if (value && value !== expression.value) {
      expression.value = value;
    }
  }
);

const bindingOptions = computed(() => {
  const options: Array<{ key: string; label: string; binding: BindingState }> = [
    { key: 'none', label: 'Nenhum', binding: { type: 'none' } },
  ];

  if (props.currentTokenId) {
    options.push({
      key: `token:${props.currentTokenId}`,
      label: 'Token em turno',
      binding: { type: 'token', id: props.currentTokenId },
    });
  }

  const activeCharacter = props.activeCharacterId
    ? props.availableCharacters.find((char) => char._id === props.activeCharacterId)
    : null;
  if (activeCharacter) {
    options.push({
      key: 'character:active',
      label: `Meu personagem (${activeCharacter.name})`,
      binding: { type: 'character', id: activeCharacter._id },
    });
  }

  props.availableCharacters.forEach((char) => {
    options.push({
      key: `character:${char._id}`,
      label: `Ficha: ${char.name}`,
      binding: { type: 'character', id: char._id },
    });
  });

  return options;
});

const selectedBinding = computed<BindingState>(() => {
  const match = bindingOptions.value.find((option) => option.key === selectedBindingKey.value);
  return match?.binding ?? { type: 'none' };
});

watch(
  bindingOptions,
  (options) => {
    if (!options.some((option) => option.key === selectedBindingKey.value)) {
      selectedBindingKey.value = options[0]?.key ?? 'none';
    }
  },
  { immediate: true }
);

const storageKey = computed(() => {
  const userId = currentUser.value?.id || 'anon';
  return `tod:dicePresets:${userId}:${props.tableId}`;
});

function loadPresets() {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(storageKey.value);
    if (!raw) {
      savedPresets.value = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      savedPresets.value = parsed;
    }
  } catch (error) {
    console.warn('[dice] não foi possível carregar presets', error);
    savedPresets.value = [];
  }
}

function persistPresets() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey.value, JSON.stringify(savedPresets.value));
  } catch (error) {
    console.warn('[dice] não foi possível salvar presets', error);
  }
}

watch(storageKey, () => {
  loadPresets();
  selectedPresetId.value = null;
}, { immediate: true });

function applyShortcut(sides: number) {
  expression.value = `1d${sides}`;
  selectedPresetId.value = null;
}

function applyPreset(preset: DicePreset) {
  expression.value = preset.expression;
  selectedPresetId.value = preset.id;
}

function applySystemPreset(preset: { key: string; label: string; expression: string }) {
  expression.value = preset.expression;
  selectedPresetId.value = null;
}

function removePreset(id: string) {
  savedPresets.value = savedPresets.value.filter((preset) => preset.id !== id);
  if (selectedPresetId.value === id) {
    selectedPresetId.value = null;
  }
  persistPresets();
}

function savePreset() {
  const expr = expression.value.trim();
  if (!expr) {
    toast.error('Informe uma expressão para salvar.');
    return;
  }
  const name = window.prompt('Nome do preset:', 'Nova rolagem');
  if (!name) return;
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `preset-${Date.now()}`;
  const preset: DicePreset = { id, name: name.trim(), expression: expr };
  savedPresets.value = [...savedPresets.value, preset];
  selectedPresetId.value = id;
  persistPresets();
  emit('saved-profile', preset);
  toast.success('Preset salvo.');
}

function resolveBindingIds(binding: BindingState) {
  if (binding.type === 'token') {
    return { tokenId: binding.id };
  }
  if (binding.type === 'character') {
    return { characterId: binding.id };
  }
  return {};
}

// --- Confirmação/erro da rolagem (ack) --------------------------------------
// O socketService já faz toast de erro/timeout; aqui o estado fica visível
// inline no painel (§8.3 "ack/erro visível") sem duplicar os toasts.

const ACK_TIMEOUT_MS = 4000;
let pendingExpression: string | null = null;
let ackTimer: ReturnType<typeof setTimeout> | null = null;
let disposed = false;

type SocketLike = {
  on: (event: string, listener: (payload: unknown) => void) => unknown;
  off: (event: string, listener: (payload: unknown) => void) => unknown;
};

function isSocketLike(value: unknown): value is SocketLike {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { on?: unknown; off?: unknown };
  return typeof candidate.on === 'function' && typeof candidate.off === 'function';
}

function readSocket(): SocketLike | null {
  const candidate = (socketService as unknown as { socket?: unknown }).socket;
  return isSocketLike(candidate) ? candidate : null;
}

function clearAckTimeout() {
  if (ackTimer !== null) {
    clearTimeout(ackTimer);
    ackTimer = null;
  }
}

function handleDiceRolledEvent(payload: unknown) {
  if (!pendingExpression || disposed) return;
  const roll = payload as Partial<DiceRolledPayload> | null;
  if (!roll || roll.expression !== pendingExpression) return;
  if (roll.userId && currentUser.value?.id && roll.userId !== currentUser.value.id) return;
  clearAckTimeout();
  pendingExpression = null;
  status.value = { kind: 'success', text: `${roll.expression} → ${roll.total}` };
}

function handleDiceRollErrorEvent(payload: unknown) {
  if (!pendingExpression || disposed) return;
  const message =
    payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message?: unknown }).message ?? '')
      : '';
  clearAckTimeout();
  pendingExpression = null;
  status.value = { kind: 'error', text: message || 'Erro ao executar a rolagem.' };
}

onMounted(() => {
  const socket = readSocket();
  if (!socket) return;
  socket.on('diceRolled', handleDiceRolledEvent);
  socket.on('diceRollError', handleDiceRollErrorEvent);
});

onBeforeUnmount(() => {
  disposed = true;
  clearAckTimeout();
  const socket = readSocket();
  if (!socket) return;
  socket.off('diceRolled', handleDiceRolledEvent);
  socket.off('diceRollError', handleDiceRollErrorEvent);
});

function roll() {
  const expr = expression.value.trim();
  if (!expr) {
    toast.error('Digite uma expressão de dado.');
    return;
  }
  const binding = resolveBindingIds(selectedBinding.value);
  const preset = savedPresets.value.find((item) => item.id === selectedPresetId.value);
  const metadata = preset?.metadata || preset?.name;
  if (props.transport === 'local') {
    try {
      const result = rollLocalDice(expr, { metadata });
      const payload: DiceRolledPayload = {
        tableId: props.tableId,
        expression: result.expression,
        rolls: result.rolls,
        modifier: result.modifier,
        total: result.total,
        metadata: result.metadata,
        userId: currentUser.value?.id || 'guest',
        username: currentUser.value?.username || 'Visitante',
        tags: preset?.tags,
        createdAt: new Date().toISOString(),
        ...binding,
      };
      status.value = { kind: 'success', text: `${result.expression} → ${result.total}` };
      emit('local-roll', payload);
      toast.success('Rolagem concluída.');
    } catch (error) {
      console.error('[dice] erro ao rolar localmente', error);
      status.value = { kind: 'error', text: 'Falha ao executar a rolagem.' };
      toast.error(error instanceof Error ? error.message : 'Falha ao executar a rolagem.');
    }
    return;
  }
  try {
    clearAckTimeout();
    pendingExpression = expr;
    status.value = { kind: 'pending', text: 'Rolagem enviada — aguardando o servidor…' };
    socketService.rollDice({
      tableId: props.tableId,
      expression: expr,
      ...binding,
      metadata,
      tags: preset?.tags,
    });
    toast.success('Rolagem enviada.');
    ackTimer = setTimeout(() => {
      if (disposed || !pendingExpression) return;
      pendingExpression = null;
      status.value = {
        kind: 'error',
        text: 'O servidor não confirmou a rolagem. Tente novamente.',
      };
    }, ACK_TIMEOUT_MS);
  } catch (error) {
    console.error('[dice] erro ao rolar', error);
    pendingExpression = null;
    status.value = { kind: 'error', text: 'Não foi possível enviar a rolagem.' };
    toast.error('Não foi possível enviar a rolagem.');
  }
}

</script>

<template>
  <section class="dice-roller" :class="[`mode-${mode}`]">
    <header class="dice-header">
      <div>
        <p class="eyebrow">Rolagens</p>
        <h3>Ferramenta de dados</h3>
      </div>
      <button v-if="mode === 'popup'" class="close-btn" @click="$emit('close')">×</button>
    </header>

    <label class="field-label" for="dice-expression">Expressão</label>
    <div class="expression-row">
      <input
        id="dice-expression"
        v-model="expression"
        type="text"
        placeholder="Ex.: 2d6+3"
      />
      <select v-model="selectedBindingKey">
        <option v-for="option in bindingOptions" :key="option.key" :value="option.key">
          {{ option.label }}
        </option>
      </select>
    </div>

    <p v-if="isExplosive" class="explosive-hint" role="status">
      Dados explosivos (<code>!</code>): cada dado no máximo rola de novo e soma.
    </p>

    <div v-if="systemDicePresets.length" class="system-presets">
      <p class="field-label">Presets do sistema</p>
      <div class="system-presets__grid">
        <button
          v-for="preset in systemDicePresets"
          :key="preset.key"
          type="button"
          class="system-preset-btn"
          :aria-label="`Preset ${preset.label}: ${preset.expression}`"
          @click="applySystemPreset(preset)"
        >
          <span>{{ preset.label }}</span>
          <small>{{ preset.expression }}</small>
        </button>
      </div>
    </div>

    <div class="shortcut-row">
      <span>Atalhos:</span>
      <button
        v-for="sides in QUICK_DICE"
        :key="sides"
        type="button"
        class="shortcut-btn"
        @click="applyShortcut(sides)"
      >
        d{{ sides }}
      </button>
    </div>

    <div class="actions">
      <button type="button" class="primary" @click="roll">Rolar</button>
      <button type="button" class="ghost" @click="savePreset">+ Salvar</button>
    </div>

    <p
      v-if="status.text"
      class="dice-status"
      :class="`dice-status--${status.kind}`"
      role="status"
      aria-live="polite"
    >
      {{ status.text }}
    </p>

    <div v-if="savedPresets.length" class="presets">
      <p class="field-label">Presets salvos</p>
      <ul>
        <li
          v-for="preset in savedPresets"
          :key="preset.id"
          :class="{ active: preset.id === selectedPresetId }"
        >
          <button class="preset-btn" type="button" @click="applyPreset(preset)">
            {{ preset.name }}
          </button>
          <button class="remove-btn" type="button" @click="removePreset(preset.id)">×</button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.dice-roller {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(21, 18, 28, 0.95), rgba(12, 10, 18, 0.95));
  color: var(--color-text);
  min-width: 280px;
}
.dice-roller.mode-popup {
  width: min(420px, 95vw);
  box-shadow: var(--elev-3);
}
.dice-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.eyebrow {
  margin: 0;
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  color: var(--color-text-muted, #c9c5d4);
}
.dice-header h3 {
  margin: 4px 0 0;
}
.close-btn {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  width: 32px;
  height: 32px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.field-label {
  font-size: 0.82rem;
  color: var(--color-text-muted, #cfd2dd);
  margin: 0;
}
.expression-row {
  display: flex;
  gap: 10px;
}
.expression-row input,
.expression-row select {
  flex: 1;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: rgba(0, 0, 0, 0.2);
  color: var(--color-text);
  padding: 10px 12px;
}
.expression-row select {
  max-width: 180px;
}
.shortcut-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.explosive-hint {
  margin: 0;
  padding: 6px 10px;
  border: 1px solid rgba(210, 156, 68, 0.5);
  border-radius: 8px;
  background: rgba(210, 156, 68, 0.12);
  font-size: 0.78rem;
  color: var(--color-text);
}
.explosive-hint code {
  font-weight: 700;
  color: var(--color-warning);
}
.dice-status {
  margin: 0;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.dice-status--pending {
  border-color: rgba(59, 130, 246, 0.45);
}
.dice-status--success {
  border-color: rgba(34, 197, 94, 0.5);
  color: var(--color-text);
  font-weight: 600;
}
.dice-status--error {
  border-color: rgba(239, 68, 68, 0.55);
  color: var(--color-danger, #f87171);
}
.shortcut-btn {
  border-radius: 999px;
  border: 1px solid var(--color-border);
  padding: 4px 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.shortcut-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.actions {
  display: flex;
  gap: 12px;
}
.actions button {
  flex: 1;
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  cursor: pointer;
}
.actions .primary {
  background: var(--color-accent);
  color: #0f0f15;
  font-weight: 600;
}
.actions .ghost {
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
}
.system-presets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.system-presets__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}
.system-preset-btn {
  border-radius: 10px;
  border: 1px solid var(--color-border);
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.system-preset-btn small {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.presets ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.presets li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid transparent;
  border-radius: 10px;
}
.presets li.active {
  border-color: var(--color-accent);
}
.preset-btn {
  flex: 1;
  text-align: left;
  padding: 8px 10px;
  background: transparent;
  color: inherit;
  border: none;
  cursor: pointer;
}
.remove-btn {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0 8px;
}
</style>
