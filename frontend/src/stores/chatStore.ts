import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { currentUser } from '../services/authService';
import { socketService } from '../services/socketService';
import {
  CHAT_HISTORY_LIMIT,
  CHAT_TEXT_MAX,
  fetchChatHistory,
  parseMentions,
} from '../services/chatService';
import type { ChatMessage, PresenceEntry, RollLogEntryDTO } from '../types';

/**
 * Estado do chat da mesa (docs/PHASE5_ONLINE_CALL.md §3/§4.1).
 *
 * - Mensagens ficam em ordem ascendente (mais antiga primeiro), com teto de
 *   200; as de sistema são locais e têm teto próprio de 50.
 * - O histórico REST (mais recente primeiro) é normalizado/invertido pelo
 *   `chatService` antes de entrar aqui.
 * - Chat não usa `revision`: o estado canônico é o broadcast `chatMessage`.
 */

const MAX_MESSAGES = 200;
const MAX_SYSTEM_MESSAGES = 50;
const MAX_KNOWN_ROLLS = 200;
const SYSTEM_DEDUPE_WINDOW_MS = 10_000;

interface PresenceLike {
  userId: string;
  username: string;
  role?: string;
  socketCount?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function timeOf(message: ChatMessage): number {
  const value = new Date(message.createdAt).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function rollKey(entry: RollLogEntryDTO): string {
  return `${entry.createdAt}|${entry.userId}|${entry.expression}|${entry.total}`;
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([]);
  const activeTableId = ref<string | null>(null);
  const historyLoaded = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const panelOpen = ref(false);
  const unread = ref(0);
  const sending = ref(false);
  const lastReadId = ref<string | null>(null);

  /** Controle local para não repetir "entrou/saiu" em reconexões. */
  let presenceKnown = new Map<string, string>();
  let presenceInitialized = false;
  let rollTrackerInitialized = false;
  let knownRolls = new Set<string>();
  let systemCounter = 0;
  let historyLoadToken = 0;

  const hasMessages = computed(() => messages.value.length > 0);
  const unreadLabel = computed(() => (unread.value > 99 ? '99+' : String(unread.value)));
  const currentUserId = computed(() => currentUser.value?.id ?? null);

  function compareMessages(a: ChatMessage, b: ChatMessage): number {
    const diff = timeOf(a) - timeOf(b);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  }

  function boundMessages(next: ChatMessage[]): ChatMessage[] {
    let bounded = [...next].sort(compareMessages);
    if (bounded.length > MAX_MESSAGES) {
      bounded = bounded.slice(bounded.length - MAX_MESSAGES);
    }
    const systemMessages = bounded.filter((message) => message.kind === 'system');
    if (systemMessages.length > MAX_SYSTEM_MESSAGES) {
      const overflow = new Set(
        systemMessages
          .slice(0, systemMessages.length - MAX_SYSTEM_MESSAGES)
          .map((message) => message.id),
      );
      bounded = bounded.filter((message) => !overflow.has(message.id));
    }
    return bounded;
  }

  /** Troca de mesa limpa o estado anterior; primeira mesa apenas registra. */
  function ensureTable(tableId: string): void {
    if (activeTableId.value && activeTableId.value !== tableId) {
      reset();
    }
    if (tableId) activeTableId.value = tableId;
  }

  function countsAsUnread(message: ChatMessage): boolean {
    if (panelOpen.value) return false;
    if (message.kind === 'system') return false;
    // Mensagens do próprio usuário não geram badge.
    const me = currentUserId.value;
    return !me || message.userId !== me;
  }

  /**
   * Insere uma mensagem (ao vivo ou histórica) deduplicando por id, mantendo a
   * ordem ascendente e atualizando não lidas/lastReadId quando aplicável.
   */
  function receive(message: ChatMessage): boolean {
    if (!message || !message.id) return false;
    if (message.tableId && activeTableId.value && message.tableId !== activeTableId.value) {
      return false;
    }
    if (!activeTableId.value && message.tableId) activeTableId.value = message.tableId;
    if (messages.value.some((entry) => entry.id === message.id)) return false;

    messages.value = boundMessages([...messages.value, message]);
    if (panelOpen.value) {
      lastReadId.value = message.id;
    } else if (countsAsUnread(message)) {
      unread.value += 1;
    }
    return true;
  }

  async function loadHistory(tableId: string): Promise<void> {
    if (!tableId || loading.value) return;
    ensureTable(tableId);
    const token = ++historyLoadToken;
    loading.value = true;
    error.value = null;
    try {
      const history = await fetchChatHistory(tableId, { limit: CHAT_HISTORY_LIMIT });
      // Reset/troca de mesa durante o fetch: descarta a resposta antiga.
      if (token !== historyLoadToken || activeTableId.value !== tableId) return;
      const existing = new Set(messages.value.map((message) => message.id));
      const merged = [
        ...messages.value,
        ...history.filter((message) => !existing.has(message.id)),
      ];
      messages.value = boundMessages(merged);
      historyLoaded.value = true;
      if (panelOpen.value) markRead();
    } catch (err) {
      if (token !== historyLoadToken) return;
      error.value = err instanceof Error
        ? err.message
        : 'Não foi possível carregar o histórico do chat.';
    } finally {
      if (token === historyLoadToken) loading.value = false;
    }
  }

  async function send(tableId: string, text: string): Promise<boolean> {
    const trimmed = text.trim();
    if (!tableId || !trimmed || sending.value) return false;
    if (trimmed.length > CHAT_TEXT_MAX) {
      error.value = `Mensagem muito longa (máximo ${CHAT_TEXT_MAX} caracteres).`;
      return false;
    }
    ensureTable(tableId);
    sending.value = true;
    error.value = null;
    try {
      const mentions = parseMentions(trimmed);
      const ack = await socketService.sendChatMessage({ tableId, text: trimmed, mentions });
      if (ack?.ok === true) return true;
      error.value = ack?.ok === false
        ? ack.error.message
        : 'Não foi possível enviar a mensagem.';
      return false;
    } catch (err) {
      error.value = err instanceof Error
        ? err.message
        : 'Não foi possível enviar a mensagem. Verifique sua conexão.';
      return false;
    } finally {
      sending.value = false;
    }
  }

  function addSystemMessage(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const createdAt = nowIso();
    const last = messages.value[messages.value.length - 1];
    // Evita repetir a mesma linha em reconexões/observações quase simultâneas.
    if (
      last
      && last.kind === 'system'
      && last.text === trimmed
      && Date.now() - timeOf(last) < SYSTEM_DEDUPE_WINDOW_MS
    ) {
      return false;
    }
    systemCounter += 1;
    const message: ChatMessage = {
      id: `system-${Date.now()}-${String(systemCounter).padStart(6, '0')}`,
      tableId: activeTableId.value ?? '',
      userId: '',
      username: 'Sistema',
      text: trimmed,
      mentions: [],
      kind: 'system',
      createdAt,
    };
    messages.value = boundMessages([...messages.value, message]);
    if (panelOpen.value) lastReadId.value = message.id;
    return true;
  }

  /**
   * Compara a presença da mesa e cria mensagens locais de entrada/saída.
   * A primeira lista não vazia é apenas a linha de base (evita "todos
   * entraram" ao abrir a mesa). A TV (DISPLAY) e o próprio usuário são
   * ignorados; uma lista vazia transitória não gera "saiu" em massa.
   */
  function trackPresence(entries: PresenceEntry[] | PresenceLike[], meId?: string | null): void {
    const next = new Map<string, string>();
    for (const entry of entries ?? []) {
      if (!entry?.userId || entry.role === 'DISPLAY') continue;
      next.set(entry.userId, entry.username || 'Alguém');
    }

    if (!presenceInitialized) {
      if (next.size === 0) return;
      presenceKnown = next;
      presenceInitialized = true;
      return;
    }

    // Queda de conexão costuma zerar a presença; não anuncie saída em massa.
    if (next.size === 0 && presenceKnown.size > 0) return;

    for (const [userId, username] of next) {
      if (!presenceKnown.has(userId) && userId !== meId) {
        addSystemMessage(`${username} entrou na mesa.`);
      }
    }
    for (const [userId, username] of presenceKnown) {
      if (!next.has(userId) && userId !== meId) {
        addSystemMessage(`${username} saiu da mesa.`);
      }
    }
    presenceKnown = next;
  }

  /**
   * Mensagens locais de rolagem a partir do log canônico (`recentRolls`,
   * mais recente primeiro). A primeira leitura só cria a linha de base;
   * entradas já conhecidas nunca são repetidas após reconexão.
   */
  function trackRolls(entries: RollLogEntryDTO[] | undefined | null): void {
    const list = Array.isArray(entries) ? entries : [];
    const currentKeys = new Set(list.slice(0, MAX_KNOWN_ROLLS).map(rollKey));

    if (!rollTrackerInitialized) {
      knownRolls = currentKeys;
      rollTrackerInitialized = true;
      return;
    }

    const fresh: RollLogEntryDTO[] = [];
    for (const entry of list) {
      const key = rollKey(entry);
      if (knownRolls.has(key)) break;
      fresh.push(entry);
    }
    // `recentRolls` é mais recente primeiro; anuncie do mais antigo ao mais novo.
    for (const entry of fresh.reverse()) {
      const name = entry.username || 'Alguém';
      addSystemMessage(`${name} rolou ${entry.expression} (${entry.total}).`);
    }
    knownRolls = new Set([...knownRolls, ...currentKeys]);
    if (knownRolls.size > MAX_KNOWN_ROLLS) {
      knownRolls = new Set(Array.from(knownRolls).slice(-MAX_KNOWN_ROLLS));
    }
  }

  function openPanel(): void {
    panelOpen.value = true;
    markRead();
  }

  function closePanel(): void {
    panelOpen.value = false;
  }

  function markRead(): void {
    unread.value = 0;
    const last = messages.value[messages.value.length - 1];
    if (last) lastReadId.value = last.id;
  }

  function reset(): void {
    messages.value = [];
    activeTableId.value = null;
    historyLoaded.value = false;
    loading.value = false;
    error.value = null;
    panelOpen.value = false;
    unread.value = 0;
    sending.value = false;
    lastReadId.value = null;
    presenceKnown = new Map();
    presenceInitialized = false;
    rollTrackerInitialized = false;
    knownRolls = new Set();
    systemCounter = 0;
    historyLoadToken += 1;
  }

  // Troca de usuário nunca reaproveita mensagens/não lidas da sessão anterior.
  watch(
    () => currentUser.value?.id ?? null,
    (id, previous) => {
      if (previous && previous !== id) reset();
    },
  );

  return {
    // estado
    messages,
    activeTableId,
    historyLoaded,
    loading,
    error,
    panelOpen,
    unread,
    sending,
    lastReadId,
    // getters
    hasMessages,
    unreadLabel,
    // lifecycle
    loadHistory,
    reset,
    // ações
    send,
    receive,
    addSystemMessage,
    trackPresence,
    trackRolls,
    openPanel,
    closePanel,
    markRead,
  };
});
