import {
  zPlaceTokenPayload,
  zCreateTokenTemplate,
  zRollDicePayload,
  zCharacterStats,
  zCreateCharacter,
  zLoginRequest,
} from '../schemas';

const baseTokenPayload = {
  tableId: '6af838beedca4f72eb0a8672',
  sceneId: '6af838beedca4f72eb0a8673',
  squareId: 'sq-1',
  name: 'Herói',
  size: 'Pequeno/Médio' as const,
};

describe('schemas de URL opcional', () => {
  it('aceita token sem imagem (string vazia vira undefined)', () => {
    const parsed = zPlaceTokenPayload.parse({ ...baseTokenPayload, imageUrl: '' });
    expect(parsed.imageUrl).toBeUndefined();
  });

  it('aceita token sem o campo de imagem', () => {
    const parsed = zPlaceTokenPayload.parse(baseTokenPayload);
    expect(parsed.imageUrl).toBeUndefined();
  });

  it('mantém uma URL válida', () => {
    const parsed = zPlaceTokenPayload.parse({
      ...baseTokenPayload,
      imageUrl: 'https://example.com/token.webp',
    });
    expect(parsed.imageUrl).toBe('https://example.com/token.webp');
  });

  it('rejeita URL inválida', () => {
    expect(() =>
      zPlaceTokenPayload.parse({ ...baseTokenPayload, imageUrl: 'não-é-url' })
    ).toThrow();
  });

  it('aceita template de token sem imagem', () => {
    const parsed = zCreateTokenTemplate.parse({
      name: 'Goblin',
      systemId: '6af838beedca4f72eb0a8672',
      imageUrl: '',
    });
    expect(parsed.imageUrl).toBeUndefined();
  });
});

describe('zLoginRequest (identificador novo ou email legado)', () => {
  it('normaliza { identifier, password } para o formato canônico', () => {
    const parsed = zLoginRequest.parse({ identifier: '  Alice  ', password: 'senha123' });
    expect(parsed).toEqual({ identifier: 'Alice', password: 'senha123' });
  });

  it('mantém compatibilidade com o formato legado { email, password }', () => {
    const parsed = zLoginRequest.parse({ email: 'alice@test.dev', password: 'senha123' });
    expect(parsed).toEqual({ identifier: 'alice@test.dev', password: 'senha123' });
  });

  it('dá prioridade a identifier quando os dois campos vêm juntos', () => {
    const parsed = zLoginRequest.parse({
      identifier: 'alice',
      email: 'alice@test.dev',
      password: 'senha123',
    });
    expect(parsed.identifier).toBe('alice');
  });

  it('rejeita identifier vazio, curto ou longo demais', () => {
    expect(() => zLoginRequest.parse({ identifier: '', password: 'senha123' })).toThrow();
    expect(() => zLoginRequest.parse({ identifier: '   ', password: 'senha123' })).toThrow();
    expect(() => zLoginRequest.parse({ identifier: 'ab', password: 'senha123' })).toThrow();
    expect(() =>
      zLoginRequest.parse({ identifier: 'a'.repeat(255), password: 'senha123' })
    ).toThrow();
  });

  it('rejeita payload sem identifier e sem email', () => {
    expect(() => zLoginRequest.parse({ password: 'senha123' })).toThrow();
  });

  it('rejeita senha ausente ou curta', () => {
    expect(() => zLoginRequest.parse({ identifier: 'alice' })).toThrow();
    expect(() => zLoginRequest.parse({ identifier: 'alice', password: '123' })).toThrow();
    expect(() => zLoginRequest.parse({ email: 'alice@test.dev' })).toThrow();
  });

  it('rejeita email legado malformado', () => {
    expect(() =>
      zLoginRequest.parse({ email: 'não-é-email', password: 'senha123' })
    ).toThrow();
  });
});

describe('zRollDicePayload (expressão, passo e tabela)', () => {
  const tableId = '6af838beedca4f72eb0a8672';

  it('mantém compatibilidade com { expression }', () => {
    const parsed = zRollDicePayload.parse({ tableId, expression: '2d6+3' });
    expect(parsed.expression).toBe('2d6+3');
    expect(parsed.step).toBeUndefined();
    expect(parsed.table).toBeUndefined();
  });

  it('aceita um teste de passo completo', () => {
    const parsed = zRollDicePayload.parse({
      tableId,
      step: {
        attribute: 'fisico',
        attributeDie: 10,
        skillKey: 'luta',
        skillDie: 8,
        bonusDice: [6, 8],
        stepDelta: 1,
        stepTarget: 'skill',
        difficulty: 9,
        dreadDie: 6,
        label: 'Luta (Físico)',
        damageModifier: 3,
        damageMode: true,
      },
    });
    expect(parsed.step).toMatchObject({
      attribute: 'fisico',
      attributeDie: 10,
      skillKey: 'luta',
      skillDie: 8,
      difficulty: 9,
      dreadDie: 6,
    });
  });

  it('aceita d20 explícito e dreadDie nulo', () => {
    const parsed = zRollDicePayload.parse({
      tableId,
      step: {
        attribute: 'mente',
        attributeDie: 20,
        skillKey: 'bruxaria',
        skillDie: 20,
        dreadDie: null,
      },
    });
    expect(parsed.step?.attributeDie).toBe(20);
    expect(parsed.step?.dreadDie).toBeNull();
  });

  it('aceita rolagem de tabela com modificador de patamar', () => {
    const parsed = zRollDicePayload.parse({ tableId, table: 'lesao', modifier: 2 });
    expect(parsed.table).toBe('lesao');
    expect(parsed.modifier).toBe(2);
  });

  it('exige exatamente um entre expression, step e table', () => {
    expect(() => zRollDicePayload.parse({ tableId })).toThrow();
    expect(() =>
      zRollDicePayload.parse({
        tableId,
        expression: '1d20',
        step: { attribute: 'fisico', attributeDie: 10, skillKey: 'luta', skillDie: 10 },
      })
    ).toThrow();
    expect(() => zRollDicePayload.parse({ tableId, expression: '1d20', table: 'trauma' })).toThrow();
  });

  it('rejeita modificador fora de rolagem de tabela', () => {
    expect(() => zRollDicePayload.parse({ tableId, expression: '1d20', modifier: 1 })).toThrow();
  });

  it('rejeita tabela desconhecida', () => {
    expect(() => zRollDicePayload.parse({ tableId, table: 'morte' })).toThrow();
  });

  it('rejeita passo com mais de 2 dados bônus, dado inválido e dificuldade fora da faixa', () => {
    const base = { attribute: 'fisico', attributeDie: 10, skillKey: 'luta', skillDie: 10 };
    expect(() =>
      zRollDicePayload.parse({ tableId, step: { ...base, bonusDice: [6, 6, 6] } })
    ).toThrow();
    expect(() => zRollDicePayload.parse({ tableId, step: { ...base, skillDie: 5 } })).toThrow();
    expect(() =>
      zRollDicePayload.parse({ tableId, step: { ...base, difficulty: 0 } })
    ).toThrow();
    expect(() =>
      zRollDicePayload.parse({ tableId, step: { ...base, stepDelta: 3 } })
    ).toThrow();
    expect(() =>
      zRollDicePayload.parse({ tableId, step: { ...base, damageModifier: 101 } })
    ).toThrow();
  });
});

describe('zCharacterStats (PD, PE, SAN e armadura)', () => {
  it('aceita recursos completos', () => {
    const parsed = zCharacterStats.parse({
      currentHP: 5,
      maxHP: 10,
      currentPD: 3,
      maxPD: 5,
      armorPoints: 2,
      armorPointsMax: 3,
      currentPE: 1,
      maxPE: 2,
      currentSAN: 4,
      maxSAN: 6,
    });
    expect(parsed).toMatchObject({ currentPD: 3, armorPoints: 2, currentSAN: 4 });
  });

  it('valida as relações atuais <= máximo', () => {
    expect(() => zCharacterStats.parse({ currentPD: 6, maxPD: 5 })).toThrow();
    expect(() => zCharacterStats.parse({ currentPE: 6, maxPE: 5 })).toThrow();
    expect(() => zCharacterStats.parse({ currentSAN: 6, maxSAN: 5 })).toThrow();
    expect(() => zCharacterStats.parse({ armorPoints: 4, armorPointsMax: 3 })).toThrow();
  });

  it('não quebra patch parcial com um único campo', () => {
    expect(zCharacterStats.parse({ currentPD: 2 })).toEqual({ currentPD: 2 });
    expect(zCharacterStats.parse({ maxSAN: 8 })).toEqual({ maxSAN: 8 });
  });

  it('rejeita valores negativos', () => {
    expect(() => zCharacterStats.parse({ currentPD: -1 })).toThrow();
    expect(() => zCharacterStats.parse({ armorPoints: -1 })).toThrow();
  });
});

describe('ficha OP2/OPSH (aditivo)', () => {
  const base = { name: 'Agente' };

  it('aceita perfil, medo, relações, rituais, condições, traumas e ferimentos', () => {
    const parsed = zCreateCharacter.parse({
      ...base,
      profile: {
        perfil: 'executor',
        vocacao: 'Investigador',
        idade: 34,
        classe: 'combatente',
        origem: 'Militar',
        trilha: 'Aniquilador',
        nex: 25,
        patente: 'operador',
        conceito: 'Caçador de monstros',
        level: 3,
      },
      stats: { currentPD: 4, maxPD: 6, armorPoints: 1, armorPointsMax: 2 },
      fear: { dreadDie: 6, active: true, notes: 'Medo de altura' },
      relations: [{ name: 'Irmã', grade: 3, note: 'Única família' }],
      rituals: [{ name: 'Luz', cost: '1 PE', circle: 1, description: 'Ilumina a área.' }],
      conditions: ['Atordoado'],
      traumas: ['TEPT'],
      injuries: [{ attribute: 'agilidade', penalty: -1, note: 'Joelho' }],
      sanityMode: 'san',
    });

    expect(parsed.relations).toHaveLength(1);
    expect(parsed.fear?.dreadDie).toBe(6);
    expect(parsed.sanityMode).toBe('san');
  });

  it('mantém fichas D&D antigas válidas sem os campos novos', () => {
    const parsed = zCreateCharacter.parse({
      ...base,
      profile: { className: 'Guerreiro', level: 5, race: 'Humano' },
      stats: { currentHP: 30, maxHP: 40, defense: 17 },
      skills: { athletics: 5, perception: 'expertise' },
      spellSlots: { '1': { used: 0, max: 2 } },
    });
    expect(parsed.fear).toBeUndefined();
    expect(parsed.conditions).toBeUndefined();
  });

  it('rejeita limites e enumerações inválidas', () => {
    expect(() =>
      zCreateCharacter.parse({
        ...base,
        fear: { dreadDie: 5 },
      })
    ).toThrow();

    expect(() =>
      zCreateCharacter.parse({
        ...base,
        profile: { perfil: 'heroi' },
      })
    ).toThrow();

    expect(() =>
      zCreateCharacter.parse({
        ...base,
        relations: Array.from({ length: 21 }, (_, index) => ({
          name: `Relação ${index}`,
          grade: 1 as const,
        })),
      })
    ).toThrow();

    expect(() =>
      zCreateCharacter.parse({
        ...base,
        rituals: Array.from({ length: 51 }, (_, index) => ({ name: `Ritual ${index}` })),
      })
    ).toThrow();

    expect(() =>
      zCreateCharacter.parse({
        ...base,
        conditions: Array.from({ length: 51 }, (_, index) => `Condição ${index}`),
      })
    ).toThrow();

    expect(() =>
      zCreateCharacter.parse({
        ...base,
        injuries: Array.from({ length: 21 }, (_, index) => ({
          attribute: 'vigor',
          penalty: -1,
          note: `${index}`,
        })),
      })
    ).toThrow();
  });

  it('rejeita condição acima de 100 caracteres', () => {
    expect(() => zCreateCharacter.parse({ ...base, conditions: ['x'.repeat(101)] })).toThrow();
  });
});
