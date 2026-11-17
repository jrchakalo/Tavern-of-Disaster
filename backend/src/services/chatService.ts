import type { FilterQuery } from 'mongoose';
import ChatMessage, { ChatMessageKind, IChatMessage } from '../models/ChatMessage.model';

/** Texto por mensagem, quantidade de menções e retenção do chat. */
export const CHAT_TEXT_MAX = 1000;
export const CHAT_MENTIONS_MAX = 10;
export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_HISTORY_MAX = 100;
export const CHAT_RETENTION_DAYS = 7;

export type ChatMessageDTO = {
  id: string;
  tableId: string;
  userId: string;
  username: string;
  text: string;
  mentions: string[];
  kind: ChatMessageKind;
  createdAt: string;
};

type ChatMessageLike = {
  _id?: unknown;
  tableId: unknown;
  userId: unknown;
  username: string;
  text: string;
  mentions?: string[];
  kind?: ChatMessageKind;
  createdAt: Date | string;
};

type CreateChatMessageInput = {
  tableId: string;
  userId: string;
  username: string;
  text: string;
  mentions?: string[];
  kind?: ChatMessageKind;
};

type ListChatOptions = {
  limit?: number;
  before?: string;
};

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return CHAT_HISTORY_LIMIT;
  return Math.min(Math.max(Math.trunc(limit as number), 1), CHAT_HISTORY_MAX);
}

export function mapChatMessageToDTO(message: ChatMessageLike): ChatMessageDTO {
  return {
    id: String(message._id ?? ''),
    tableId: String(message.tableId),
    userId: String(message.userId),
    username: message.username ?? '',
    text: message.text,
    mentions: message.mentions ?? [],
    kind: message.kind ?? 'user',
    createdAt: new Date(message.createdAt).toISOString(),
  };
}

export async function createChatMessage(input: CreateChatMessageInput): Promise<ChatMessageDTO> {
  const created = await ChatMessage.create({
    tableId: input.tableId,
    userId: input.userId,
    username: input.username,
    text: input.text,
    mentions: input.mentions ?? [],
    kind: input.kind ?? 'user',
  });
  return mapChatMessageToDTO(created as unknown as IChatMessage);
}

/** Histórico da mesa: mais recente primeiro, com paginação por cursor (`before`). */
export async function listTableChat(
  tableId: string,
  options: ListChatOptions = {}
): Promise<ChatMessageDTO[]> {
  const filter: FilterQuery<IChatMessage> = { tableId };
  if (options.before) {
    const beforeDate = new Date(options.before);
    if (!Number.isNaN(beforeDate.getTime())) {
      filter.createdAt = { $lt: beforeDate };
    }
  }
  const messages = await ChatMessage.find(filter)
    .sort({ createdAt: -1 })
    .limit(normalizeLimit(options.limit))
    .lean();
  return messages.map((message) => mapChatMessageToDTO(message as unknown as ChatMessageLike));
}
