import { describe, it, expect } from 'vitest';

import { characterResourceBadges } from '../summary';
import type { CharacterDTO, CharacterSummaryLite } from '../../../types';

describe('character/summary — recursos OP2/OPSH', () => {
  it('D&D 5e sem PD/PE/SAN/armadura não ganha badges extras', () => {
    const dnd: CharacterDTO = {
      _id: 'c',
      ownerId: 'u',
      tableId: 't',
      name: 'Aerin',
      systemKey: 'dnd5e',
      stats: { currentHP: 10, maxHP: 12, defense: 14 },
    };
    expect(characterResourceBadges(dnd)).toEqual([]);
  });

  it('mostra PD e pontos de armadura do OP2', () => {
    const op2: CharacterSummaryLite = {
      _id: 'c',
      name: 'Victoria',
      systemKey: 'ordem-paranormal-2',
      currentHP: 12,
      maxHP: 16,
      currentPD: 4,
      maxPD: 7,
      armorPoints: 2,
      armorPointsMax: 3,
    };
    const badges = characterResourceBadges(op2);
    expect(badges.map((badge) => badge.key)).toEqual(['pd', 'armor']);
    expect(badges[0]).toMatchObject({ label: 'PD', value: '4 / 7' });
    expect(badges[1]).toMatchObject({ label: 'Arm', value: '2 / 3' });
  });

  it('mostra PE/SAN no modo Sanidade e PD no modo sem Sanidade', () => {
    const san: CharacterSummaryLite = {
      _id: 'c',
      name: 'Helena',
      systemKey: 'ordem-paranormal-sobrevivendo-ao-horror',
      sanityMode: 'san',
      currentPE: 8,
      maxPE: 12,
      currentSAN: 10,
      maxSAN: 16,
      armorPoints: 1,
      armorPointsMax: 2,
    };
    expect(characterResourceBadges(san).map((badge) => badge.key)).toEqual(['pe', 'san', 'armor']);

    const pd: CharacterSummaryLite = {
      _id: 'c',
      name: 'Helena',
      systemKey: 'ordem-paranormal-sobrevivendo-ao-horror',
      sanityMode: 'pd',
      currentPD: 5,
      maxPD: 9,
    };
    expect(characterResourceBadges(pd).map((badge) => badge.key)).toEqual(['pd']);
  });

  it('usa a ficha completa como fallback quando o resumo não traz o campo', () => {
    const summary: CharacterSummaryLite = { _id: 'c', name: 'Victoria', currentHP: 5, maxHP: 10 };
    const full: CharacterDTO = {
      _id: 'c',
      ownerId: 'u',
      tableId: 't',
      name: 'Victoria',
      stats: { currentHP: 12, maxHP: 16, currentPD: 3, maxPD: 6 },
    };
    const badges = characterResourceBadges(summary, full);
    expect(badges.map((badge) => badge.key)).toEqual(['pd']);
    expect(badges[0].value).toBe('3 / 6');
  });
});
