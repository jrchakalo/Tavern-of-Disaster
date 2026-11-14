import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Character, CharacterDTO } from '../types';
import {
  getMyCharacters,
  getTableCharacters,
  createCharacter as apiCreateCharacter,
  updateCharacter as apiUpdateCharacter,
  deleteCharacter as apiDeleteCharacter,
} from '../services/characterService';

export type CharacterScope = 'dm' | 'player';

type CharacterMap = Record<string, Character[]>;

type LoadingMap = Record<string, boolean>;

type ErrorMap = Record<string, string | null>;

export const useCharacterStore = defineStore('character', () => {
  const charactersByTable = ref<CharacterMap>({});
  const selectedCharacterId = ref<string | null>(null);
  const loadingByTable = ref<LoadingMap>({});
  const errorByTable = ref<ErrorMap>({});

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

  async function createCharacter(tableId: string, payload: Partial<CharacterDTO>) {
    const created = await apiCreateCharacter(tableId, payload);
    const existing = charactersForTable(tableId);
    setCharacters(tableId, [...existing, created]);
    return created;
  }

  async function updateCharacter(tableId: string, characterId: string, payload: Partial<CharacterDTO>) {
    const updated = await apiUpdateCharacter(tableId, characterId, payload);
    const updatedList = charactersForTable(tableId).map((char) =>
      char._id === updated._id ? updated : char
    );
    setCharacters(tableId, updatedList);
    return updated;
  }

  async function deleteCharacter(tableId: string, characterId: string) {
    await apiDeleteCharacter(tableId, characterId);
    const remaining = charactersForTable(tableId).filter((char) => char._id !== characterId);
    setCharacters(tableId, remaining);
    if (selectedCharacterId.value === characterId) {
      selectedCharacterId.value = null;
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
    fetchForTable,
    createCharacter,
    updateCharacter,
    deleteCharacter,
  };
});
