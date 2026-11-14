import { API_BASE_URL } from './apiBase';
import { authToken } from './authService';

export type DisplayTokenResponse = {
  token: string;
  displayUrl: string;
};

export type JoinTableResult = {
  tableId: string;
};

/**
 * Entra em uma mesa pelo código de convite (usado pelo QR do jogador).
 * Implementação real na branch `restore/phase-2-frontend`.
 */
export async function joinTableByInvite(inviteCode: string): Promise<JoinTableResult> {
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
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || 'Não foi possível entrar na mesa.');
  }
  const data = (await response.json()) as { tableId?: string; table?: { _id?: string } };
  const tableId = data.tableId ?? data.table?._id;
  if (!tableId) throw new Error('A mesa não retornou um identificador válido.');
  return { tableId };
}

/** Gera/rotaciona o token da TV. Apenas o Mestre. */
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

/** Revoga o token da TV. Apenas o Mestre. */
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
