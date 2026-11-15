import type { RollLogEntryDTO } from '../types';
import { authToken } from './authService';
import { API_BASE_URL } from './apiBase';

/**
 * Histórico persistido de rolagens (docs/SHEETS_DICE.md §6.3).
 *
 * `GET /api/tables/:tableId/rolls?limit=50&before=<ISO>` — membro da mesa,
 * mais recente primeiro. O backend pode ignorar `before` enquanto a
 * paginação por cursor não estiver implementada; aqui o parâmetro já é
 * enviado conforme o contrato.
 */

export interface FetchRollLogOptions {
  limit?: number;
  /** ISO date: retorna rolagens anteriores a esse instante (paginação). */
  before?: string;
}

/**
 * Forma crua do backend: sem `username`, com `id` do documento e campos
 * nulos. Normalizamos para o `RollLogEntryDTO` do contrato realtime.
 */
interface RawRollLogEntry {
  id?: string;
  tableId: string;
  userId: string;
  username?: string;
  expression: string;
  total: number;
  modifier: number;
  rolls?: RollLogEntryDTO['rolls'];
  metadata?: string | null;
  tags?: string[];
  characterId?: string | null;
  tokenId?: string | null;
  createdAt: string;
}

function normalizeRoll(raw: RawRollLogEntry): RollLogEntryDTO {
  return {
    tableId: raw.tableId,
    userId: raw.userId,
    username: raw.username ?? '',
    expression: raw.expression,
    rolls: raw.rolls ?? [],
    modifier: raw.modifier ?? 0,
    total: raw.total ?? 0,
    metadata: raw.metadata ?? undefined,
    tags: raw.tags,
    characterId: raw.characterId ?? undefined,
    tokenId: raw.tokenId ?? undefined,
    createdAt: raw.createdAt,
  };
}

export async function fetchRollLog(
  tableId: string,
  options: FetchRollLogOptions = {},
): Promise<RollLogEntryDTO[]> {
  if (!tableId) throw new Error('Mesa inválida.');
  const params = new URLSearchParams();
  params.set('limit', String(options.limit ?? 50));
  if (options.before) params.set('before', options.before);

  const headers: Record<string, string> = {};
  if (authToken.value) headers.Authorization = `Bearer ${authToken.value}`;

  const response = await fetch(
    `${API_BASE_URL}/api/tables/${encodeURIComponent(tableId)}/rolls?${params.toString()}`,
    { headers },
  );
  if (!response.ok) {
    let message = 'Erro ao carregar o log de rolagens.';
    try {
      const data = await response.json();
      if (data?.message) message = data.message;
    } catch {
      // Corpo de erro sem JSON: mantém a mensagem padrão.
    }
    throw new Error(message);
  }
  const data = (await response.json()) as RawRollLogEntry[];
  return (Array.isArray(data) ? data : []).map(normalizeRoll);
}
