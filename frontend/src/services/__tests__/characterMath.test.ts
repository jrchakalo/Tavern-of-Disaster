import { describe, expect, it } from 'vitest';
import {
  DND_SKILLS,
  abilityModifier,
  abilityModifierLabel,
  formatModifier,
  passiveScore,
  proficiencyBonus,
  savingThrow,
  skillBonus,
  skillByKey,
} from '../characterMath';

describe('characterMath (D&D 5e)', () => {
  it('calcula modificadores de atributo', () => {
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(18)).toBe(4);
    expect(abilityModifier(20)).toBe(5);
    expect(abilityModifier(Number.NaN)).toBe(0);
  });

  it('calcula bônus de proficiência por nível', () => {
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(4)).toBe(2);
    expect(proficiencyBonus(5)).toBe(3);
    expect(proficiencyBonus(9)).toBe(4);
    expect(proficiencyBonus(17)).toBe(6);
    expect(proficiencyBonus(0)).toBe(2);
  });

  it('calcula testes de resistência', () => {
    expect(savingThrow(14, false, 5)).toBe(2);
    expect(savingThrow(14, true, 5)).toBe(5);
  });

  it('calcula perícias com proficiência e expertise', () => {
    expect(skillBonus(16, false, false, 5)).toBe(3);
    expect(skillBonus(16, true, false, 5)).toBe(6);
    expect(skillBonus(16, true, true, 5)).toBe(9);
  });

  it('calcula passiva', () => {
    expect(passiveScore(14, true, false, 5)).toBe(15);
    expect(passiveScore(14, true, true, 5)).toBe(18);
  });

  it('formata modificadores', () => {
    expect(formatModifier(3)).toBe('+3');
    expect(formatModifier(0)).toBe('+0');
    expect(formatModifier(-2)).toBe('-2');
    expect(abilityModifierLabel(8)).toBe('-1');
  });

  it('tem as 18 perícias padrão e busca por chave', () => {
    expect(DND_SKILLS).toHaveLength(18);
    expect(skillByKey('perception')?.ability).toBe('wis');
    expect(skillByKey('stealth')?.ability).toBe('dex');
    expect(skillByKey('nope')).toBeUndefined();
  });
});
