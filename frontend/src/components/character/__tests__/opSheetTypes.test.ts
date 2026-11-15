import { describe, it, expect } from 'vitest';

import type { CharacterDTO } from '../../../types';
import {
  OP2_SKILLS,
  OPSH_SKILLS,
  attackUsesRangedSkill,
  buildOpDraft,
  buildOpPatch,
  buildOpshDraft,
  buildOpshPatch,
  canonicalOp2SkillKey,
  opshDerivedDefense,
  opshHasNatural20,
  opshInjuryFromRoll,
  opshResourceFormula,
  opshRollExpression,
  parseAttributeScore,
  parseDamageModifier,
  parseDie,
  parseTraining,
  relationBonusDie,
  stepDie,
} from '../opSheetTypes';

function op2Character(overrides: Partial<CharacterDTO> = {}): CharacterDTO {
  return {
    _id: 'char-op2',
    ownerId: 'user-1',
    tableId: 'table-1',
    name: 'Victoria',
    systemKey: 'ordem-paranormal-2',
    profile: { perfil: 'analista', vocacao: 'Policial', level: 3, idade: 29 },
    attributes: { fisico: 8, mente: 10, emocao: 6 },
    // ocultismo/oficio/pesquisar são nomes do Alpha aceitos como alias.
    skills: { ocultismo: 8, oficio: 10, pesquisar: 6, luta: 8, pilotaria: '+7' },
    stats: {
      currentHP: 12,
      maxHP: 16,
      currentPD: 5,
      maxPD: 7,
      armorPoints: 2,
      armorPointsMax: 3,
    },
    fear: { active: true, dreadDie: 6, notes: 'Corredor' },
    relations: [{ name: 'Mãe', grade: 3, note: 'Ligação forte' }],
    rituals: [{ name: 'Visão', cost: '1 PE', description: 'Vê o oculto' }],
    conditions: ['Abalado'],
    traumas: ['Pânico'],
    injuries: ['Sem olho'],
    attacks: [{ name: 'Revólver', damage: 'RA+3', range: 'longo', notes: '6 balas' }],
    inventory: [{ name: 'Lanterna', quantity: 1 }],
    notes: 'Notas',
    ...overrides,
  };
}

describe('opSheetTypes — OP2', () => {
  it('expõe as 20 perícias e canonicaliza os aliases do Alpha', () => {
    expect(OP2_SKILLS).toHaveLength(20);
    expect(OP2_SKILLS.map((skill) => skill.label)).toContain('Bruxaria');
    expect(canonicalOp2SkillKey('ocultismo')).toBe('bruxaria');
    expect(canonicalOp2SkillKey('oficio')).toBe('metalurgia');
    expect(canonicalOp2SkillKey('maquinas')).toBe('metalurgia');
    expect(canonicalOp2SkillKey('tecnologia')).toBe('metalurgia');
    expect(canonicalOp2SkillKey('pesquisar')).toBe('inspecionar');
    expect(canonicalOp2SkillKey('LUTA')).toBe('luta');
  });

  it('aumenta/reduz passo sem sair de d4..d12', () => {
    expect(stepDie(6, 1)).toBe(8);
    expect(stepDie(12, 1)).toBe(12);
    expect(stepDie(4, -1)).toBe(4);
    expect(stepDie(8, -2)).toBe(4);
    expect(stepDie(20, 0)).toBe(12);
    expect(parseDie('8')).toBe(8);
    expect(parseDie('texto', 6)).toBe(6);
  });

  it('lê dano RA+X, alcance e bônus de relação', () => {
    expect(parseDamageModifier('RA+3')).toBe(3);
    expect(parseDamageModifier('RA - 2')).toBe(-2);
    expect(parseDamageModifier('1d8+3')).toBe(3);
    expect(parseDamageModifier('sem bônus')).toBe(0);
    expect(relationBonusDie(1)).toBe(6);
    expect(relationBonusDie(2)).toBe(8);
    expect(relationBonusDie(3)).toBe(12);
    expect(attackUsesRangedSkill('longo')).toBe(true);
    expect(attackUsesRangedSkill('corpo a corpo')).toBe(false);
  });

  it('faz round-trip do rascunho/patch preservando perícia desconhecida', () => {
    const draft = buildOpDraft(op2Character());
    expect(draft.attributes).toEqual({ fisico: 8, mente: 10, emocao: 6 });
    expect(draft.skills.find((skill) => skill.key === 'bruxaria')?.die).toBe(8);
    expect(draft.skills.find((skill) => skill.key === 'metalurgia')?.die).toBe(10);
    expect(draft.skills.find((skill) => skill.key === 'inspecionar')?.die).toBe(6);
    const legacy = draft.skills.find((skill) => skill.key === 'pilotaria');
    expect(legacy?.legacy).toBe(true);
    expect(legacy?.raw).toBe('+7');

    const patch = buildOpPatch(draft);
    expect(patch.name).toBe('Victoria');
    expect(patch.profile?.perfil).toBe('analista');
    expect(patch.profile?.vocacao).toBe('Policial');
    expect(patch.profile?.level).toBe(3);
    expect(patch.stats).toMatchObject({
      currentHP: 12,
      maxHP: 16,
      currentPD: 5,
      maxPD: 7,
      armorPoints: 2,
      armorPointsMax: 3,
    });
    expect(patch.skills?.bruxaria).toBe(8);
    expect(patch.skills?.metalurgia).toBe(10);
    expect(patch.skills?.inspecionar).toBe(6);
    // Alias não é duplicado; a perícia desconhecida volta intacta.
    expect(patch.skills?.ocultismo).toBeUndefined();
    expect(patch.skills?.pilotaria).toBe('+7');
    expect(patch.fear).toMatchObject({ active: true, dreadDie: 6 });
    expect(patch.relations?.[0]).toMatchObject({ name: 'Mãe', grade: 3 });
    expect(patch.rituals?.[0]).toMatchObject({ name: 'Visão', cost: '1 PE' });
    expect(patch.conditions).toEqual(['Abalado']);
    expect(patch.traumas).toEqual(['Pânico']);
    expect(patch.injuries).toEqual(['Sem olho']);
    expect(patch.attacks?.[0]).toMatchObject({ name: 'Revólver', damage: 'RA+3', range: 'longo' });
    expect(patch.inventory?.[0]).toMatchObject({ name: 'Lanterna', quantity: 1 });
  });

  it('aceita ficha vazia sem inventar valores', () => {
    const draft = buildOpDraft(null);
    expect(draft.attributes).toEqual({ fisico: 6, mente: 6, emocao: 6 });
    expect(draft.skills).toHaveLength(20);
    expect(draft.fear.active).toBe(false);
    expect(draft.fear.dreadDie).toBe(6);
    const patch = buildOpPatch(draft);
    expect(patch.stats).toBeUndefined();
    expect(patch.attributes).toEqual({ fisico: 6, mente: 6, emocao: 6 });
  });
});

function opshCharacter(overrides: Partial<CharacterDTO> = {}): CharacterDTO {
  return {
    _id: 'char-opsh',
    ownerId: 'user-1',
    tableId: 'table-1',
    name: 'Helena',
    systemKey: 'ordem-paranormal-sobrevivendo-ao-horror',
    profile: {
      classe: 'especialista',
      origem: 'Jornalista',
      trilha: 'Infiltrador',
      nex: '45%',
      patente: 'operador',
      level: 4,
      idade: 33,
      conceito: 'Curiosa',
      profissao: 'Jornalista investigativa',
    },
    attributes: { agilidade: 0, forca: 2, intelecto: 4, presenca: 3, vigor: 1 },
    skills: {
      acrobacia: 5,
      profissao: 10,
      intuicao: 5,
      percepcao: 15,
      pontaria: 5,
      custom: 10,
    },
    stats: {
      currentHP: 18,
      maxHP: 24,
      defense: 13,
      currentPE: 8,
      maxPE: 12,
      currentSAN: 10,
      maxSAN: 16,
      armorPoints: 2,
      armorPointsMax: 2,
    },
    sanityMode: 'san',
    progressionMode: 'nex',
    conditions: ['Abalado'],
    traumas: ['TEPT'],
    injuries: [{ attribute: 'vigor', penalty: 2, notes: 'Dano massivo' }],
    rituals: [{ name: 'Amaldiçoar', circle: '2', cost: '3 PE' }],
    attacks: [{ name: 'Pistola', bonus: '+5', damage: '2d6' }],
    inventory: [{ name: 'Kit médico', quantity: 1 }],
    ...overrides,
  };
}

describe('opSheetTypes — OPSH', () => {
  it('usa as 28 perícias validadas no OP1 v1.1', () => {
    expect(OPSH_SKILLS).toHaveLength(28);
    const byKey = new Map(OPSH_SKILLS.map((skill) => [skill.key, skill.attribute]));
    expect(byKey.get('intuicao')).toBe('intelecto');
    expect(byKey.get('percepcao')).toBe('presenca');
    expect(byKey.get('pontaria')).toBe('agilidade');
    expect(byKey.get('artes')).toBe('presenca');
    expect(byKey.get('atualidades')).toBe('intelecto');
    expect(byKey.get('profissao')).toBe('intelecto');
    expect(byKey.get('vontade')).toBe('presenca');
  });

  it('gera Nd20kh1 com atributo > 0 e 2d20kl1 com atributo 0', () => {
    expect(parseAttributeScore(0)).toBe(0);
    expect(parseAttributeScore(3)).toBe(3);
    expect(parseAttributeScore(9)).toBe(5);
    expect(opshRollExpression(4, 5)).toBe('4d20kh1+5');
    expect(opshRollExpression(0, 10)).toBe('2d20kl1+10');
    expect(opshRollExpression('0', 0)).toBe('2d20kl1+0');
    expect(parseTraining(10)).toBe(10);
    expect(parseTraining(12)).toBe(10);
    expect(parseTraining(99)).toBe(15);
  });

  it('calcula Defesa derivada e detecta 20 natural só no dado escolhido', () => {
    expect(opshDerivedDefense(3)).toBe(13);
    expect(opshDerivedDefense(0)).toBe(10);
    expect(opshHasNatural20([{ value: 20, kept: 'kept' }])).toBe(true);
    expect(opshHasNatural20([{ value: 20, kept: 'dropped' }])).toBe(false);
    expect(opshHasNatural20([])).toBe(false);
  });

  it('mapeia o 1d6 de ferimento debilitante', () => {
    expect(opshInjuryFromRoll(1)).toBe('agilidade');
    expect(opshInjuryFromRoll(5)).toBe('vigor');
    expect(opshInjuryFromRoll(6)).toBe('superficial');
  });

  it('mostra a fórmula certa por classe, modo e progressão', () => {
    expect(opshResourceFormula({ classe: 'combatente', sanityMode: 'san' })).toContain('PV 20+VIG');
    expect(opshResourceFormula({ classe: 'combatente', sanityMode: 'san' })).toContain('SAN 12');
    expect(
      opshResourceFormula({ classe: 'especialista', sanityMode: 'pd', progressionMode: 'nex' }),
    ).toContain('PD 8+PRE');
    expect(
      opshResourceFormula({ classe: 'ocultista', sanityMode: 'pd', progressionMode: 'patente' }),
    ).toContain('PD 16+PRE');
    expect(opshResourceFormula({ classe: 'sobrevivente', sanityMode: 'san' })).toContain('PV 8+VIG');
    expect(opshResourceFormula({ classe: 'sobrevivente', sanityMode: 'pd' })).toContain('PD 4+PRE');
  });

  it('faz round-trip preservando classe, SAN, progressão, ferimento e legado', () => {
    const draft = buildOpshDraft(opshCharacter());
    expect(draft.attributes.agilidade).toBe('0');
    expect(draft.sanityMode).toBe('san');
    expect(draft.progressionMode).toBe('nex');
    expect(draft.profissao).toBe('Jornalista investigativa');
    expect(draft.skills.find((skill) => skill.key === 'profissao')?.training).toBe(10);
    // Chaves de atributo vêm corrigidas do contrato.
    expect(draft.skills.find((skill) => skill.key === 'intuicao')?.attribute).toBe('intelecto');
    expect(draft.skills.find((skill) => skill.key === 'percepcao')?.attribute).toBe('presenca');
    expect(draft.skills.find((skill) => skill.key === 'pontaria')?.attribute).toBe('agilidade');
    const legacy = draft.skills.find((skill) => skill.key === 'custom');
    expect(legacy?.legacy).toBe(true);
    expect(legacy?.training).toBe(10);

    const patch = buildOpshPatch(draft);
    expect(patch.attributes).toMatchObject({
      agilidade: 0,
      forca: 2,
      intelecto: 4,
      presenca: 3,
      vigor: 1,
    });
    expect(patch.profile).toMatchObject({
      classe: 'especialista',
      origem: 'Jornalista',
      nex: '45%',
      patente: 'operador',
      profissao: 'Jornalista investigativa',
    });
    expect(patch.sanityMode).toBe('san');
    expect(patch.progressionMode).toBe('nex');
    expect(patch.skills?.profissao).toBe(10);
    expect(patch.skills?.custom).toBe(10);
    expect(patch.injuries).toEqual([
      { attribute: 'vigor', penalty: 2, notes: 'Dano massivo' },
    ]);
    expect(patch.stats).toMatchObject({
      currentHP: 18,
      maxHP: 24,
      defense: 13,
      currentPE: 8,
      maxPE: 12,
      currentSAN: 10,
      maxSAN: 16,
      armorPoints: 2,
      armorPointsMax: 2,
    });
  });

  it('default do OPSH é SAN e a progressão desconhecida vira NEX', () => {
    const draft = buildOpshDraft({
      _id: 'c',
      ownerId: 'u',
      tableId: 't',
      name: 'Sem nada',
      systemKey: 'ordem-paranormal-sobrevivendo-ao-horror',
    });
    expect(draft.sanityMode).toBe('san');
    expect(draft.progressionMode).toBe('nex');
    expect(draft.attributes).toMatchObject({
      agilidade: '1',
      forca: '1',
      intelecto: '1',
      presenca: '1',
      vigor: '1',
    });
    expect(draft.skills).toHaveLength(28);
  });
});
