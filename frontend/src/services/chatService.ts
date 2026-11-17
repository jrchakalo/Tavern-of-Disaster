import { authToken } from './authService';
import { API_BASE_URL } from './apiBase';
import type { ChatMessage } from '../types';

/**
 * Chat da mesa (docs/PHASE5_ONLINE_CALL.md §3).
 *
 * - Histórico: `GET /api/tables/:tableId/chat?limit=50&before=<ISO>`.
 *   O servidor devolve mais recente primeiro; a UI consome em ordem
 *   ascendente, então normalizamos e invertemos aqui.
 * - Envio ao vivo: `socketService.sendChatMessage` (evento `requestSendChatMessage`).
 * - Menções: `@nome` / `@todos`, no máximo 10, sem duplicatas.
 */

export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_MENTIONS_MAX = 10;
export const CHAT_TEXT_MAX = 1000;

export interface FetchChatHistoryOptions {
  limit?: number;
  /** Cursor ISO: retorna mensagens anteriores a esse instante. */
  before?: string;
}

/** Forma crua aceita do backend (id ou _id, campos opcionais). */
interface RawChatMessage {
  id?: unknown;
  _id?: unknown;
  tableId?: unknown;
  userId?: unknown;
  username?: unknown;
  text?: unknown;
  mentions?: unknown;
  kind?: unknown;
  createdAt?: unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

/**
 * Normaliza uma mensagem crua. Retorna `null` quando não há identidade
 * suficiente para exibir/deduplicar.
 */
export function normalizeChatMessage(raw: RawChatMessage): ChatMessage | null {
  const id = asString(raw.id ?? raw._id).trim();
  if (!id) return null;
  const text = asString(raw.text);
  const createdAtRaw = asString(raw.createdAt);
  const parsed = new Date(createdAtRaw);
  const createdAt = Number.isNaN(parsed.getTime()) ? createdAtRaw : parsed.toISOString();
  const mentions = Array.isArray(raw.mentions)
    ? raw.mentions.filter((mention): mention is string => typeof mention === 'string')
    : [];
  return {
    id,
    tableId: asString(raw.tableId),
    userId: asString(raw.userId),
    username: asString(raw.username),
    text,
    mentions,
    kind: raw.kind === 'system' ? 'system' : 'user',
    createdAt,
  };
}

function messageTime(message: ChatMessage): number {
  const time = new Date(message.createdAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Normaliza e ordena uma lista do servidor (mais recente primeiro) para a
 * ordem de exibição (mais antiga primeiro), removendo ids repetidos.
 */
export function normalizeChatHistory(rawMessages: unknown[]): ChatMessage[] {
  const seen = new Set<string>();
  const normalized: ChatMessage[] = [];
  for (const raw of rawMessages) {
    if (!raw || typeof raw !== 'object') continue;
    const message = normalizeChatMessage(raw as RawChatMessage);
    if (!message || seen.has(message.id)) continue;
    seen.add(message.id);
    normalized.push(message);
  }
  return normalized.sort((a, b) => {
    const diff = messageTime(a) - messageTime(b);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

export async function fetchChatHistory(
  tableId: string,
  options: FetchChatHistoryOptions = {},
): Promise<ChatMessage[]> {
  const token = authToken.value;
  if (!token) {
    throw new Error('Sessão expirada. Entre novamente para ver o chat.');
  }
  const params = new URLSearchParams();
  params.set('limit', String(options.limit ?? CHAT_HISTORY_LIMIT));
  if (options.before) params.set('before', options.before);
  const response = await fetch(
    `${API_BASE_URL}/api/tables/${encodeURIComponent(tableId)}/chat?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await response.json().catch(() => null) as
    | RawChatMessage[]
    | { messages?: RawChatMessage[]; message?: string }
    | null;

  if (!response.ok) {
    const message = data && !Array.isArray(data) && typeof data.message === 'string'
      ? data.message
      : 'Não foi possível carregar o histórico do chat.';
    throw new Error(message);
  }

  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.messages)
      ? data.messages
      : [];
  return normalizeChatHistory(list);
}

// ---------------------------------------------------------------------------
// Menções
// ---------------------------------------------------------------------------

/**
 * `@nome` no início ou precedido de pontuação/espaço. Nomes aceitam letras
 * Unicode, números, `_`, `.` e `-`. Um e-mail (`a@b`) não vira menção.
 */
const MENTION_PATTERN = /(^|[^\p{L}\p{N}_.-])@([\p{L}\p{N}_.-]+)/gu;

function cleanMentionToken(token: string): string {
  return token.replace(/[._-]+$/u, '');
}

/**
 * Extrai menções únicas de um texto. `@todos` é preservado como menção
 * especial. Mantém a grafia original do primeiro uso, deduplica sem caixa e
 * limita a 10 entradas (mesmo limite do backend).
 */
export function parseMentions(text: string): string[] {
  if (!text) return [];
  const mentions: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const token = cleanMentionToken(match[2] ?? '');
    if (!token) continue;
    const key = token.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    mentions.push(token);
    if (mentions.length >= CHAT_MENTIONS_MAX) break;
  }
  return mentions;
}

export function isAllMention(token: string): boolean {
  return token.toLocaleLowerCase() === 'todos';
}

export type ChatTextSegmentType = 'text' | 'mention' | 'all';

export interface ChatTextSegment {
  text: string;
  type: ChatTextSegmentType;
}

/**
 * Divide o texto em segmentos para renderização com interpolação (`{{ }}`),
 * nunca com `v-html`. Não altera o texto: o escape fica a cargo do template.
 */
export function formatChatText(text: string): ChatTextSegment[] {
  if (!text) return [];
  const segments: ChatTextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const token = cleanMentionToken(match[2] ?? '');
    const mentionStart = (match.index ?? 0) + (match[1]?.length ?? 0);
    if (!token) continue;
    const mentionEnd = mentionStart + 1 + token.length;
    const before = text.slice(cursor, mentionStart);
    if (before) segments.push({ text: before, type: 'text' });
    segments.push({
      text: `@${token}`,
      type: isAllMention(token) ? 'all' : 'mention',
    });
    cursor = mentionEnd;
  }
  const tail = text.slice(cursor);
  if (tail) segments.push({ text: tail, type: 'text' });
  return segments;
}

/**
 * Escape para contextos que não são interpolação Vue (ex.: título/aria).
 * A renderização das mensagens usa `{{ }}` e `formatChatText`, nunca HTML cru.
 */
export function escapeChatText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
