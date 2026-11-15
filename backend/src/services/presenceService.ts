export type SessionRole = 'DM' | 'PLAYER' | 'DISPLAY' | 'SPECTATOR';

/**
 * Prefixo do id sintético da TV. Nunca corresponde a um ObjectId de usuário
 * real, então não pode ser confundido com DM/PLAYER.
 */
export const DISPLAY_USER_ID_PREFIX = 'display:';

export function displayUserId(tableId: string): string {
  return `${DISPLAY_USER_ID_PREFIX}${tableId}`;
}

export function isDisplayUserId(userId: string | null | undefined): boolean {
  return typeof userId === 'string' && userId.startsWith(DISPLAY_USER_ID_PREFIX);
}

export type PresenceEntry = {
  userId: string;
  username: string;
  role: SessionRole;
  socketCount: number;
};

type PresenceUser = {
  username: string;
  sockets: Set<string>;
};

/**
 * Presença em memória por mesa: tableId -> userId -> sockets.
 * É derivada dos sockets conectados; não persiste e é limpa ao desconectar.
 */
const presenceByTable = new Map<string, Map<string, PresenceUser>>();

function ensureTable(tableId: string): Map<string, PresenceUser> {
  let table = presenceByTable.get(tableId);
  if (!table) {
    table = new Map<string, PresenceUser>();
    presenceByTable.set(tableId, table);
  }
  return table;
}

/** Retorna true se este socket foi o primeiro do usuário na mesa. */
export function joinPresence(tableId: string, userId: string, username: string, socketId: string): boolean {
  const table = ensureTable(tableId);
  const existing = table.get(userId);
  if (existing) {
    const isFirst = existing.sockets.size === 0;
    if (username) existing.username = username;
    existing.sockets.add(socketId);
    return isFirst;
  }
  table.set(userId, { username, sockets: new Set([socketId]) });
  return true;
}

/** Retorna true se o usuário deixou completamente a mesa (removeu o último socket). */
export function leavePresence(tableId: string, userId: string, socketId: string): boolean {
  const table = presenceByTable.get(tableId);
  if (!table) return false;
  const entry = table.get(userId);
  if (!entry) return false;
  entry.sockets.delete(socketId);
  if (entry.sockets.size > 0) return false;
  table.delete(userId);
  if (table.size === 0) {
    presenceByTable.delete(tableId);
  }
  return true;
}

/** Remove todos os sockets de um usuário em uma mesa (ex.: desconexão total). */
export function clearUserPresence(tableId: string, userId: string): boolean {
  const table = presenceByTable.get(tableId);
  if (!table) return false;
  const removed = table.delete(userId);
  if (table.size === 0) {
    presenceByTable.delete(tableId);
  }
  return removed;
}

/**
 * Lista a presença combinando os sockets em memória com a mesa (para resolver o papel).
 * `resolveRole` recebe o userId e devolve o papel na mesa.
 */
export function listPresence(tableId: string, resolveRole?: (userId: string) => SessionRole): PresenceEntry[] {
  const table = presenceByTable.get(tableId);
  if (!table) return [];
  const entries: PresenceEntry[] = [];
  table.forEach((value, userId) => {
    if (value.sockets.size === 0) return;
    entries.push({
      userId,
      username: value.username,
      role: resolveRole ? resolveRole(userId) : 'PLAYER',
      socketCount: value.sockets.size,
    });
  });
  return entries.sort((a, b) => a.username.localeCompare(b.username));
}

export function getSocketCount(tableId: string, userId: string): number {
  return presenceByTable.get(tableId)?.get(userId)?.sockets.size ?? 0;
}

/** Apenas para testes: limpa todo o estado de presença. */
export function resetPresence(): void {
  presenceByTable.clear();
}
