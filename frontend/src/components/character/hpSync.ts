/**
 * Caminho de escrita de PV (docs/SHEETS_DICE.md §3.2).
 *
 * Ordem:
 * 1. `characterStore.updateHp` (Fase 3): socket `requestUpdateCharacterHp`
 *    com ack. O `socketService` já mostra o toast de erro interno, por isso o
 *    resultado carrega `alreadyNotified` e o chamador não duplica o aviso.
 * 2. Sem store (branch sem Fase 3 / mock): emite o mesmo evento direto no
 *    socket com timeout próprio.
 * 3. Sem resposta do socket: fallback REST de personagens.
 *
 * Em qualquer caminho de sucesso o resumo local é atualizado para o estado
 * convergir na hora; o patch canônico do servidor reafirma depois.
 */
import { socketService } from '../../services/socketService';
import { updateCharacter as apiUpdateCharacter } from '../../services/characterService';
import { useCharacterStore } from '../../stores/characterStore';
import type { Ack, CharacterStats } from '../../types';

export const HP_ACK_TIMEOUT_MS = 2000;

export type HpSyncResult =
  | { ok: true; via: 'store' | 'socket' | 'rest'; currentHP: number }
  | { ok: false; via: 'store' | 'socket' | 'rest'; message: string; alreadyNotified: boolean };

/** Store da Fase 3 expõe o atalho de PV; branches antigas não têm. */
type CharacterStoreWithHp = {
  updateHp?: (tableId: string, characterId: string, currentHP: number) => Promise<void>;
};

type SocketLike = {
  connected?: boolean;
  emit: (event: string, payload: unknown, ack?: (result: unknown) => void) => unknown;
};

type SocketServiceLike = {
  isConnected?: () => boolean;
  socket?: unknown;
};

function readSocketService(): SocketServiceLike {
  return socketService as unknown as SocketServiceLike;
}

function readSocket(): SocketLike | null {
  const candidate = readSocketService().socket;
  if (!candidate || typeof candidate !== 'object') return null;
  const maybe = candidate as { emit?: unknown };
  if (typeof maybe.emit !== 'function') return null;
  return maybe as SocketLike;
}

/** true quando o `socketService` já cuida do toast (caminho socket da Fase 3). */
function socketServiceToastsForUs(): boolean {
  const isConnected = readSocketService().isConnected;
  if (typeof isConnected !== 'function') return false;
  try {
    return Boolean(isConnected.call(socketService));
  } catch {
    return false;
  }
}

/** Emite `requestUpdateCharacterHp` sem passar pelos toasts do serviço. */
function emitHpEvent(payload: Record<string, unknown>): Promise<Ack | null> {
  const socket = readSocket();
  if (!socket) return Promise.resolve(null);
  // Socket.io enfileira pacotes em desconexão; sem conexão nem tentamos.
  if (socket.connected === false) return Promise.resolve(null);
  return new Promise<Ack | null>((resolve) => {
    let settled = false;
    const finish = (value: Ack | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), HP_ACK_TIMEOUT_MS);
    try {
      socket.emit('requestUpdateCharacterHp', payload, (result) => {
        finish((result ?? null) as Ack | null);
      });
    } catch {
      finish(null);
    }
  });
}

function clampHP(currentHP: number, maxHP?: number): number {
  const safe = Number.isFinite(currentHP) ? Math.round(currentHP) : 0;
  const bounded = maxHP !== undefined && Number.isFinite(maxHP) ? Math.min(safe, maxHP) : safe;
  return Math.max(0, bounded);
}

/** Espelha o novo PV no characterStore para a UI local não ficar defasada. */
function syncLocalCharacter(tableId: string, characterId: string, currentHP: number): void {
  try {
    const store = useCharacterStore();
    const list = store.charactersForTable(tableId);
    if (!list.some((character) => character._id === characterId)) return;
    store.setCharacters(
      tableId,
      list.map((character) =>
        character._id === characterId
          ? { ...character, stats: { ...character.stats, currentHP } }
          : character,
      ),
    );
  } catch {
    // Pinia indisponível (fora do app): o próximo snapshot corrige o estado.
  }
}

async function restFallback(
  tableId: string,
  characterId: string,
  currentHP: number,
  statsFallback: CharacterStats | null | undefined,
): Promise<HpSyncResult> {
  if (!statsFallback) {
    return { ok: false, via: 'socket', message: 'Sem conexão para atualizar o PV.', alreadyNotified: false };
  }
  try {
    await apiUpdateCharacter(tableId, characterId, {
      stats: { ...statsFallback, currentHP },
    });
    syncLocalCharacter(tableId, characterId, currentHP);
    return { ok: true, via: 'rest', currentHP };
  } catch (error) {
    return {
      ok: false,
      via: 'rest',
      message: error instanceof Error ? error.message : 'Não foi possível atualizar o PV.',
      alreadyNotified: false,
    };
  }
}

export async function setCharacterHp(params: {
  tableId: string;
  characterId: string;
  currentHP: number;
  maxHP?: number;
  statsFallback?: CharacterStats | null;
}): Promise<HpSyncResult> {
  const { tableId, characterId, statsFallback } = params;
  const currentHP = clampHP(params.currentHP, params.maxHP ?? statsFallback?.maxHP);

  // 1) Atalho canônico da store (socket com ack).
  try {
    const store = useCharacterStore() as CharacterStoreWithHp;
    if (typeof store.updateHp === 'function' && socketServiceToastsForUs()) {
      try {
        await store.updateHp(tableId, characterId, currentHP);
        return { ok: true, via: 'store', currentHP };
      } catch (error) {
        // Recusa do servidor (VALIDATION etc.): o serviço já mostrou o toast.
        return {
          ok: false,
          via: 'store',
          message: error instanceof Error ? error.message : 'PV recusado pelo servidor.',
          alreadyNotified: true,
        };
      }
    }
  } catch {
    // Pinia indisponível: segue para o caminho direto.
  }

  // 2) Evento direto no socket (branch sem Fase 3 ou sem conexão da store).
  const ack = await emitHpEvent({ tableId, characterId, currentHP });
  if (ack && ack.ok) {
    syncLocalCharacter(tableId, characterId, currentHP);
    return { ok: true, via: 'socket', currentHP };
  }
  if (ack && ack.ok === false) {
    return {
      ok: false,
      via: 'socket',
      message: ack.error?.message || 'PV recusado pelo servidor.',
      alreadyNotified: false,
    };
  }

  // 3) Fallback REST.
  return restFallback(tableId, characterId, currentHP, statsFallback);
}
