import type { ITable, PlayerInfo } from '../types';

/**
 * Resolve a rota de entrada de uma mesa **por papel**, sem confiar em query
 * string do cliente. A mesma mesa tem três produtos (AGENTS.md invariante 6):
 * `/table/:id` (Mestre), `/play/:id` (Jogador) e `/display/:id` (TV).
 *
 * Regras:
 * - O Mestre sempre entra em `/table/:id`.
 * - Qualquer outro membro entra em `/play/:id`.
 * - Mesa ausente/carregada sem dados cai em `/play/:id` (pior caso: o jogador
 *   ainda tem tabuleiro, ficha e dados; o oposto seria entregar ferramentas de
 *   Mestre a quem não é Mestre).
 */
export function resolveTableEntry(table: Pick<ITable, 'dm' | 'players'> | null | undefined, userId: string | null | undefined): string | null {
  const tableId = (table as { _id?: string } | null | undefined)?._id;
  if (!tableId) return null;
  return isTableDm(table, userId) ? `/table/${tableId}` : `/play/${tableId}`;
}

export function isTableDm(table: Pick<ITable, 'dm'> | null | undefined, userId: string | null | undefined): boolean {
  const dmId = idOf(table?.dm);
  return Boolean(dmId && userId && dmId === userId);
}

/**
 * Resolve a rota depois de um convite (`POST /tables/join`) usando a lista de
 * mesas do usuário para descobrir o papel. Se a lista ainda não contém a mesa
 * (corrida entre join e refresh), cai em `/play/:id`: o pior caso é o jogador
 * entrar no produto de jogador, nunca o contrário.
 */
export function resolveJoinedTableEntry(
  tableId: string | null | undefined,
  tables: Array<Pick<ITable, '_id' | 'dm' | 'players'>> | null | undefined,
  userId: string | null | undefined,
): string | null {
  if (!tableId) return null;
  const table = (tables ?? []).find((entry) => entry._id === tableId);
  return table ? resolveTableEntry(table, userId) : `/play/${tableId}`;
}

function idOf(person: PlayerInfo | string | null | undefined): string | null {
  if (!person) return null;
  return typeof person === 'string' ? person : person._id || null;
}

/**
 * Extrai o código de convite de um texto colado pelo usuário.
 *
 * Aceita o código puro, a URL completa (`https://…/play/:id?invite=CODE`),
 * a URL do Mestre e apenas a query (`?invite=CODE`). Espaços e barras extras
 * são tolerados; QR codes às vezes trazem o texto com quebra de linha.
 * Retorna `''` quando não há código reconhecível.
 */
export function extractInviteCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value) return '';
  if (!/[/?=#&\s]/.test(value)) return value; // código puro
  try {
    const url = new URL(value, 'https://tavern.local');
    const invite = url.searchParams.get('invite') || url.searchParams.get('code') || url.searchParams.get('convite');
    if (invite) return invite.trim();
  } catch {
    // segue para o fallback por regex
  }
  const match = value.match(/[?&](?:invite|code|convite)=([^&#\s]+)/i);
  return match ? decodeURIComponent(match[1]).trim() : '';
}
