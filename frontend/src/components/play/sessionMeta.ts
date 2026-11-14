import { isRef } from 'vue';

export type SessionRole = 'DM' | 'PLAYER' | 'DISPLAY' | 'SPECTATOR';

export interface SessionYou {
  userId: string;
  username: string;
  role: SessionRole;
  permissions?: string[];
}

export interface PresenceEntry {
  userId: string;
  username: string;
  role: SessionRole;
  socketCount: number;
}

export interface SessionExtras {
  revision?: number;
  you?: SessionYou | null;
  presence?: PresenceEntry[];
}

function unwrap<T>(value: unknown): T | undefined {
  if (isRef(value)) {
    const inner = (value as { value: T }).value;
    return inner === null || inner === undefined ? undefined : inner;
  }
  return value === null || value === undefined ? undefined : (value as T);
}

/**
 * Lê os campos do protocolo da Fase 1 (`revision`, `you`, `presence`) sem
 * assumir que eles já existem na store atual. A store real expõe valores
 * desembrulhados; mocks de teste costumam expor refs. Os dois formatos são
 * aceitos e a leitura continua reativa dentro de um `computed`.
 */
export function readSessionExtras(store: unknown): SessionExtras {
  if (!store || typeof store !== 'object') return {};
  const source = store as Record<string, unknown>;
  const revision = unwrap<number>(source.revision);
  const you = unwrap<SessionYou>(source.you);
  const presence = unwrap<PresenceEntry[]>(source.presence);
  return {
    revision: typeof revision === 'number' ? revision : undefined,
    you: you ?? null,
    presence: Array.isArray(presence) ? presence : undefined,
  };
}

export function roleLabel(role?: string | null): string {
  switch (role) {
    case 'DM':
      return 'Mestre';
    case 'PLAYER':
      return 'Jogador';
    case 'DISPLAY':
      return 'TV';
    case 'SPECTATOR':
      return 'Espectador';
    default:
      return 'Jogador';
  }
}
