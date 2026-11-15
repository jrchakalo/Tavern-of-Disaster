import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Character, CharacterDTO } from '../types';
import type { Ack } from '../types';
import {
  getMyCharacters,
  getTableCharacters,
  createCharacter as apiCreateCharacter,
  updateCharacter as apiUpdateCharacter,
  deleteCharacter as apiDeleteCharacter,
} from '../services/characterService';
import {
  socketService,
  SocketAckError,
  registerCharacterSyncHandler,
} from '../services/socketService';
import type { CharacterSyncEvent } from '../services/socketService';

export type CharacterScope = 'dm' | 'player';

type CharacterMap = Record<string, Character[]>;

type LoadingMap = Record<string, boolean>;

type ErrorMap = Record<string, string | null>;

/** Ficha completa legada (tem ao menos uma seção de ficha além do resumo). */
function looksLikeFullCharacter(payload: object): boolean {
  return 'attributes' in payload || 'skills' in payload || 'stats' in payload;
}

function ackToError(ack: Ack): Error {
  if (ack.ok) return new Error('A ação foi recusada pelo servidor.');
  return new Error(ack.error?.message || 'A ação foi recusada pelo servidor.');
}

export const useCharacterStore = defineStore('character', () => {
  const charactersByTable = ref<CharacterMap>({});
  const selectedCharacterId = ref<string | null>(null);
  const loadingByTable = ref<LoadingMap>({});
  const errorByTable = ref<ErrorMap>({});
  // Escopo da última carga por mesa: usado no refetch pós-mutação via socket.
  const lastScopeByTable = ref<Record<string, CharacterScope>>({});

  function setCharacters(tableId: string, characters: Character[]) {
    charactersByTable.value = { ...charactersByTable.value, [tableId]: characters };
  }

  function charactersForTable(tableId: string): Character[] {
    return charactersByTable.value[tableId] ?? [];
  }

  function selectedCharacter(tableId: string): Character | null {
    if (!selectedCharacterId.value) return null;
    return charactersForTable(tableId).find((char) => char._id === selectedCharacterId.value) || null;
  }

  function setSelectedCharacter(id: string | null) {
    selectedCharacterId.value = id;
  }

  function setLoading(tableId: string, value: boolean) {
    loadingByTable.value = { ...loadingByTable.value, [tableId]: value };
  }

  function setError(tableId: string, message: string | null) {
    errorByTable.value = { ...errorByTable.value, [tableId]: message };
  }

  async function fetchForTable(tableId: string, options: { scope?: CharacterScope } = {}) {
    if (!tableId) return;
    const scope = options.scope ?? 'player';
    lastScopeByTable.value = { ...lastScopeByTable.value, [tableId]: scope };
    setLoading(tableId, true);
    setError(tableId, null);
    try {
      const characters = scope === 'dm'
        ? await getTableCharacters(tableId)
        : await getMyCharacters(tableId);
      setCharacters(tableId, characters);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar personagens.';
      setError(tableId, message);
      throw err;
    } finally {
      setLoading(tableId, false);
    }
  }

  function upsertLocalCharacter(tableId: string, character: Character) {
    const list = charactersForTable(tableId);
    const idx = list.findIndex((char) => char._id === character._id);
    const next = idx >= 0
      ? list.map((char) => (char._id === character._id ? { ...char, ...character } : char))
      : [...list, character];
    setCharacters(tableId, next);
  }

  function removeFromLocalLists(characterId: string) {
    const next: CharacterMap = {};
    Object.entries(charactersByTable.value).forEach(([tableId, list]) => {
      next[tableId] = list.filter((char) => char._id !== characterId);
    });
    charactersByTable.value = next;
    if (selectedCharacterId.value === characterId) {
      selectedCharacterId.value = null;
    }
  }

  /**
   * Refetch silencioso (best-effort) depois de mutação via socket que não
   * devolveu a ficha completa. Falha é ignorada: os resumos seguem canônicos
   * pelo `sessionPatch`.
   */
  async function refetchQuietly(tableId: string) {
    try {
      await fetchForTable(tableId, { scope: lastScopeByTable.value[tableId] ?? 'player' });
    } catch {
      // Silencioso por design.
    }
  }

  // ------------------------------------------------------------------
  // Sincronização por eventos legados (socketService → cache de fichas)
  // ------------------------------------------------------------------

  function handleCharacterSync(event: CharacterSyncEvent) {
    if (event.type === 'removed') {
      removeFromLocalLists(event.characterId);
      return;
    }
    const payload = event.character;
    if (!payload._id || !looksLikeFullCharacter(payload)) return;
    const fullCharacter = payload as unknown as Character;
    Object.entries(charactersByTable.value).forEach(([tableId, list]) => {
      if (list.some((char) => char._id === fullCharacter._id)) {
        upsertLocalCharacter(tableId, fullCharacter);
      }
    });
  }
  registerCharacterSyncHandler(handleCharacterSync);

  // ------------------------------------------------------------------
  // Mutações: preferem socket (com ack) e caem para REST sem socket,
  // em modo display (TV) ou em timeout de ack.
  // ------------------------------------------------------------------

  async function createCharacter(tableId: string, payload: Partial<CharacterDTO>): Promise<Character | null> {
    if (socketService.isConnected()) {
      try {
        const ack = await socketService.createCharacter({ tableId, character: payload });
        if (!ack.ok) throw ackToError(ack);
        const created = (ack as Ack & { character?: Character }).character;
        if (created?._id) {
          upsertLocalCharacter(tableId, created);
          return created;
        }
        // Criada no servidor (resumo chega pelo sessionPatch); a ficha
        // completa precisa vir do REST para o editor.
        await refetchQuietly(tableId);
        return null;
      } catch (err: unknown) {
        if (!(err instanceof SocketAckError)) throw err;
        // Timeout/sem conexão: cai para REST abaixo.
      }
    }
    const created = await apiCreateCharacter(tableId, payload);
    upsertLocalCharacter(tableId, created);
    return created;
  }

  async function updateCharacter(tableId: string, characterId: string, patch: Partial<CharacterDTO>): Promise<Character | null> {
    if (socketService.isConnected()) {
      try {
        const ack = await socketService.updateCharacter({ tableId, characterId, patch });
        if (!ack.ok) throw ackToError(ack);
        const updated = (ack as Ack & { character?: Character }).character;
        const cached = charactersForTable(tableId).find((char) => char._id === characterId);
        if (updated) {
          upsertLocalCharacter(tableId, updated);
          return updated;
        }
        if (cached) {
          // Aplica localmente o patch aceito; o canônico vem pelo sessionPatch.
          const merged: Character = { ...cached, ...patch };
          upsertLocalCharacter(tableId, merged);
          return merged;
        }
        return null;
      } catch (err: unknown) {
        if (!(err instanceof SocketAckError)) throw err;
      }
    }
    const updated = await apiUpdateCharacter(tableId, characterId, patch);
    upsertLocalCharacter(tableId, updated);
    return updated;
  }

  async function deleteCharacter(tableId: string, characterId: string): Promise<void> {
    if (socketService.isConnected()) {
      try {
        const ack = await socketService.deleteCharacter({ tableId, characterId });
        if (!ack.ok) throw ackToError(ack);
        removeFromLocalLists(characterId);
        return;
      } catch (err: unknown) {
        if (!(err instanceof SocketAckError)) throw err;
      }
    }
    await apiDeleteCharacter(tableId, characterId);
    removeFromLocalLists(characterId);
  }

  /** Atalho de PV pela ficha/card: sempre socket; erro de ack vira exceção. */
  async function updateHp(tableId: string, characterId: string, currentHP: number): Promise<void> {
    if (!socketService.isConnected()) {
      throw new Error('Sem conexão com o servidor.');
    }
    const ack = await socketService.updateCharacterHp({ tableId, characterId, currentHP });
    if (!ack.ok) throw ackToError(ack);
    // Reflete no cache local; o canônico vem pelo sessionPatch (resumo + tokens).
    const list = charactersForTable(tableId);
    const cached = list.find((char) => char._id === characterId);
    if (cached?.stats) {
      upsertLocalCharacter(tableId, { ...cached, stats: { ...cached.stats, currentHP } });
    }
  }

  return {
    charactersByTable,
    selectedCharacterId,
    loadingByTable,
    errorByTable,
    charactersForTable,
    selectedCharacter,
    setSelectedCharacter,
    setCharacters,
    fetchForTable,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    updateHp,
  };
});
