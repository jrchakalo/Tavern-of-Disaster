import { API_BASE_URL } from './apiBase';
import { authToken } from './authService';

export type DisplayTokenResponse = {
  token: string;
  displayUrl: string;
};

export type JoinTableResult = {
  tableId: string;
};

type JoinResponse = {
  message?: string;
  tableId?: string;
  table?: { _id?: string; id?: string };
  _id?: string;
  id?: string;
};

/**
 * Entra em uma mesa pelo código de convite (usado pelo QR do jogador,
 * fluxo docs/TABLE_MODE.md §4.1). O backend (`POST /api/tables/join`)
 * responde `{ message, table }` com documento Mongoose, mas o cliente aceita
 * também as formas `{ tableId }`, `{ _id }` e `{ id }` por robustez.
 */
export async function joinTableByInvite(inviteCode: string): Promise<JoinTableResult> {
  if (!inviteCode || !inviteCode.trim()) {
    throw new Error('Código de convite inválido.');
  }
  const token = authToken.value;
  if (!token) throw new Error('Não autenticado.');
  const response = await fetch(`${API_BASE_URL}/api/tables/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ inviteCode }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message || 'Não foi possível entrar na mesa.');
  }
  const data = (await response.json().catch(() => null)) as JoinResponse | null;
  const tableId = data?.tableId ?? data?.table?._id ?? data?.table?.id ?? data?._id ?? data?.id;
  if (!tableId) throw new Error('A mesa não retornou um identificador válido.');
  return { tableId };
}

/**
 * Gera/rotaciona o token da TV (`POST /api/tables/:id/display-token`).
 * Apenas o Mestre, via JWT. Responde `{ token, displayUrl }` onde `displayUrl`
 * é `${origin}/display/:tableId#token=<token>` (o fragmento nunca vai ao
 * servidor em requisições seguintes). Rotacionar invalida o token anterior.
 */
export async function createDisplayToken(tableId: string): Promise<DisplayTokenResponse> {
  const token = authToken.value;
  if (!token) throw new Error('Não autenticado.');
  const response = await fetch(`${API_BASE_URL}/api/tables/${encodeURIComponent(tableId)}/display-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || 'Não foi possível gerar o token da TV.');
  }
  return (await response.json()) as DisplayTokenResponse;
}

/**
 * Revoga o token da TV (`DELETE /api/tables/:id/display-token`). Apenas o
 * Mestre. A TV cai no próximo handshake (sockets já abertos podem continuar
 * até reconectar — aceitável nesta fase, docs/TABLE_MODE.md §3.4).
 */
export async function revokeDisplayToken(tableId: string): Promise<void> {
  const token = authToken.value;
  if (!token) throw new Error('Não autenticado.');
  const response = await fetch(`${API_BASE_URL}/api/tables/${encodeURIComponent(tableId)}/display-token`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || 'Não foi possível revogar o token da TV.');
  }
}
