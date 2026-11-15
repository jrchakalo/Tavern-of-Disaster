import { describe, it, expect } from 'vitest';

import {
  characterLevel,
  characterVitals,
  isFullCharacter,
  mergeCharacterSummary,
  tokenCharacter,
} from '../summary';
import type { CharacterDTO, CharacterSummaryDTO, TokenInfo } from '../../types';

const fullCharacter: CharacterDTO = {
  _id: 'char-1',
  ownerId: 'user-1',
  tableId: 'table-1',
  name: 'Nyx',
  systemKey: 'dnd5e',
  stats: { currentHP: 18, maxHP: 18, defense: 13 },
  profile: { level: 2, className: 'Ladino' },
};

const summary: CharacterSummaryDTO = {
  _id: 'char-1',
  name: 'Nyx',
  ownerId: 'user-1',
  systemKey: 'dnd5e',
  level: 3,
  currentHP: 12,
  maxHP: 18,
  defense: 14,
  tokenId: 'tok-1',
};

function makeToken(extra: Partial<TokenInfo> = {}): TokenInfo {
  return {
    _id: 'tok-1',
    squareId: 'sq-0',
    color: '#765770',
    name: 'Nyx token',
    sceneId: 'scene-1',
    movement: 9,
    remainingMovement: 6,
    size: 'Pequeno/Médio',
    ...extra,
  };
}

describe('character/summary — leitura defensiva', () => {
  it('characterVitals lê PV/CA da ficha completa e do resumo', () => {
    expect(characterVitals(fullCharacter)).toEqual({ currentHP: 18, maxHP: 18, defense: 13 });
    expect(characterVitals(summary)).toEqual({ currentHP: 12, maxHP: 18, defense: 14 });
    expect(characterVitals(null)).toEqual({});
    // Resumo sem campos definidos não inventa valor.
    expect(characterVitals({ _id: 'c', name: 'X' })).toEqual({
      currentHP: undefined,
      maxHP: undefined,
      defense: undefined,
    });
  });

  it('characterLevel usa profile na ficha e level no resumo', () => {
    expect(characterLevel(fullCharacter)).toBe(2);
    expect(characterLevel(summary)).toBe(3);
    expect(characterLevel({ _id: 'c', name: 'X' })).toBeUndefined();
    expect(characterLevel(null)).toBeUndefined();
  });

  it('isFullCharacter distingue ficha de resumo', () => {
    expect(isFullCharacter(fullCharacter)).toBe(true);
    expect(isFullCharacter(summary)).toBe(false);
    expect(isFullCharacter(null)).toBe(false);
  });

  it('tokenCharacter lê o resumo colado no token com type guard', () => {
    expect(tokenCharacter(makeToken({ character: { _id: 'char-1', name: 'Nyx', currentHP: 12, maxHP: 18, defense: 14 } }))).toMatchObject({
      _id: 'char-1',
      currentHP: 12,
    });
    expect(tokenCharacter(makeToken())).toBeNull();
    // Forma corrompida não estoura: só string de _id vale.
    expect(tokenCharacter(makeToken({ character: { name: 'X' } as never }))).toBeNull();
    expect(tokenCharacter(null)).toBeNull();
  });

  it('mergeCharacterSummary sobrepõe PV/CA/nível vindos do resumo canônico', () => {
    const merged = mergeCharacterSummary(fullCharacter, summary);
    expect(merged.stats).toEqual({ currentHP: 12, maxHP: 18, defense: 14 });
    expect(merged.profile?.level).toBe(3);
    expect(merged.name).toBe('Nyx');
    // Campos não cobertos pelo resumo são preservados.
    expect(merged.profile?.className).toBe('Ladino');
    expect(merged.systemKey).toBe('dnd5e');

    // Sem resumo devolve a mesma referência (nada a mesclar).
    expect(mergeCharacterSummary(fullCharacter, null)).toBe(fullCharacter);

    // Resumo parcial só sobrescreve o que trouxe.
    const partial = mergeCharacterSummary(fullCharacter, { ...summary, currentHP: undefined, defense: undefined });
    expect(partial.stats?.currentHP).toBe(18);
    expect(partial.stats?.defense).toBe(13);
    expect(partial.profile?.level).toBe(3);
  });
});
