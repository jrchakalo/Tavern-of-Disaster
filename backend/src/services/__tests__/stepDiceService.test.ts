import { rollStep, shiftDie, type StepRollInput } from '../stepDiceService';

type ScriptedRoll = { value: number; die: number };

/** Fonte de aleatoriedade determinística: devolve `value` no dado `die`. */
function rngFor(script: ScriptedRoll[]): () => number {
  let index = 0;
  return () => {
    const entry = script[Math.min(index, script.length - 1)];
    index += 1;
    return (entry.value - 0.5) / entry.die;
  };
}

const baseStep: StepRollInput = {
  attribute: 'fisico',
  attributeDie: 10,
  skillKey: 'luta',
  skillDie: 10,
};

describe('stepDiceService.rollStep', () => {
  it('soma atributo e perícia e compara com a DT padrão 7', () => {
    const result = rollStep(baseStep, rngFor([
      { value: 5, die: 10 },
      { value: 4, die: 10 },
    ]));

    expect(result.kind).toBe('step');
    expect(result.expression).toBe('Luta d10 + Físico d10 (DT 7)');
    expect(result.modifier).toBe(0);
    expect(result.total).toBe(9);
    expect(result.step).toMatchObject({
      attribute: { key: 'fisico', die: 10, value: 5 },
      skill: { key: 'luta', die: 10, value: 4 },
      bonusDice: [],
      high: 5,
      low: 4,
      difficulty: 7,
      success: true,
      critical: false,
      fumble: false,
      dreadEnds: false,
      summedDice: [5, 4],
    });
    expect(result.rolls.map((roll) => roll.role)).toEqual(['attribute', 'skill']);
    expect(result.rolls.every((roll) => roll.kept === 'kept')).toBe(true);
  });

  it('falha quando o total fica abaixo da DT', () => {
    const result = rollStep({ ...baseStep, difficulty: 9 }, rngFor([
      { value: 3, die: 10 },
      { value: 2, die: 10 },
    ]));

    expect(result.total).toBe(5);
    expect(result.step.difficulty).toBe(9);
    expect(result.step.success).toBe(false);
    expect(result.step.fumble).toBe(false);
  });

  it('crítico com dois dados iguais >= 6 passa automaticamente mesmo abaixo da DT', () => {
    const result = rollStep({ ...baseStep, difficulty: 15 }, rngFor([
      { value: 6, die: 10 },
      { value: 6, die: 10 },
    ]));

    expect(result.total).toBe(12);
    expect(result.step.critical).toBe(true);
    expect(result.step.success).toBe(true);
  });

  it('não é crítico quando o valor repetido é menor que 6', () => {
    const result = rollStep({ ...baseStep, difficulty: 15 }, rngFor([
      { value: 5, die: 10 },
      { value: 5, die: 10 },
    ]));

    expect(result.step.critical).toBe(false);
    expect(result.step.success).toBe(false);
  });

  it('falha crítica quando todos os dados do teste valem 1', () => {
    const result = rollStep(baseStep, rngFor([
      { value: 1, die: 10 },
      { value: 1, die: 10 },
    ]));

    expect(result.total).toBe(2);
    expect(result.step.fumble).toBe(true);
    expect(result.step.success).toBe(false);
  });

  it('inclui dados bônus na checagem de crítico', () => {
    const result = rollStep({ ...baseStep, bonusDice: [6] }, rngFor([
      { value: 6, die: 10 },
      { value: 2, die: 10 },
      { value: 6, die: 6 },
    ]));

    expect(result.step.critical).toBe(true);
    expect(result.step.summedDice).toEqual([6, 6, 2]);
  });

  it('pavor anula o dado 2 e mantém o 7', () => {
    const result = rollStep({ ...baseStep, dreadDie: 6 }, rngFor([
      { value: 7, die: 10 },
      { value: 2, die: 10 },
      { value: 4, die: 6 },
    ]));

    expect(result.step.canceledValues).toEqual([2]);
    expect(result.total).toBe(7);
    expect(result.step.high).toBe(7);
    expect(result.step.low).toBe(7);
    expect(result.step.success).toBe(true);
    expect(result.rolls[1]).toMatchObject({ value: 2, kept: 'dropped', role: 'skill' });
    expect(result.rolls[2]).toMatchObject({ value: 4, role: 'dread', kept: 'dropped' });
  });

  it('pavor que anula todos os dados gera falha crítica', () => {
    const result = rollStep({ ...baseStep, dreadDie: 6 }, rngFor([
      { value: 3, die: 10 },
      { value: 1, die: 10 },
      { value: 5, die: 6 },
    ]));

    expect(result.step.canceledValues).toEqual([3, 1]);
    expect(result.step.fumble).toBe(true);
    expect(result.step.success).toBe(false);
    expect(result.total).toBe(0);
    expect(result.step.high).toBe(0);
    expect(result.step.low).toBe(0);
  });

  it('pavor que não anula nada mantém a soma', () => {
    const result = rollStep({ ...baseStep, dreadDie: 6 }, rngFor([
      { value: 6, die: 10 },
      { value: 5, die: 10 },
      { value: 3, die: 6 },
    ]));

    expect(result.step.canceledValues).toEqual([]);
    expect(result.total).toBe(11);
    expect(result.step.high).toBe(6);
    expect(result.step.low).toBe(5);
  });

  it('pavor 1 encerra o medo e não anula nada', () => {
    const result = rollStep({ ...baseStep, dreadDie: 6 }, rngFor([
      { value: 4, die: 10 },
      { value: 3, die: 10 },
      { value: 1, die: 6 },
    ]));

    expect(result.step.dreadEnds).toBe(true);
    expect(result.step.canceledValues).toEqual([]);
    expect(result.total).toBe(7);
  });

  it('não deixa o crítico usar dados anulados pelo pavor', () => {
    const result = rollStep({ ...baseStep, dreadDie: 10 }, rngFor([
      { value: 8, die: 10 },
      { value: 8, die: 10 },
      { value: 9, die: 10 },
    ]));

    expect(result.step.canceledValues).toEqual([8, 8]);
    expect(result.step.critical).toBe(false);
    expect(result.step.fumble).toBe(true);
    expect(result.step.success).toBe(false);
  });

  it('aplica aumento e redução de passo na perícia por padrão', () => {
    const up = rollStep({ ...baseStep, skillDie: 6, stepDelta: 1 }, rngFor([
      { value: 3, die: 10 },
      { value: 5, die: 8 },
    ]));
    expect(up.step.skill.die).toBe(8);
    expect(up.rolls[1].die).toBe(8);
    expect(up.expression).toBe('Luta d8 + Físico d10 (DT 7)');

    const down = rollStep({ ...baseStep, skillDie: 4, stepDelta: -2 }, rngFor([
      { value: 3, die: 10 },
      { value: 2, die: 4 },
    ]));
    expect(down.step.skill.die).toBe(4);

    const capped = rollStep({ ...baseStep, skillDie: 12, stepDelta: 2 }, rngFor([
      { value: 3, die: 10 },
      { value: 9, die: 12 },
    ]));
    expect(capped.step.skill.die).toBe(12);
  });

  it('aplica o passo no atributo quando stepTarget é attribute', () => {
    const result = rollStep(
      { ...baseStep, attributeDie: 6, stepDelta: 1, stepTarget: 'attribute' },
      rngFor([
        { value: 5, die: 8 },
        { value: 4, die: 10 },
      ])
    );

    expect(result.step.attribute.die).toBe(8);
    expect(result.step.skill.die).toBe(10);
    expect(shiftDie(20, 2)).toBe(20);
  });

  it('soma no máximo os 3 maiores dados restantes', () => {
    const result = rollStep({ ...baseStep, bonusDice: [6, 8] }, rngFor([
      { value: 2, die: 10 },
      { value: 3, die: 10 },
      { value: 5, die: 6 },
      { value: 4, die: 8 },
    ]));

    expect(result.step.summedDice).toEqual([5, 4, 3]);
    expect(result.total).toBe(12);
    expect(result.rolls.filter((roll) => roll.kept === 'kept')).toHaveLength(3);
    expect(result.rolls[0].kept).toBe('dropped');
  });

  it('limita a 2 dados bônus (4 dados rolados)', () => {
    expect(() =>
      rollStep({ ...baseStep, bonusDice: [6, 6, 6] }, rngFor([{ value: 1, die: 10 }]))
    ).toThrow('Limite de 2 dados bônus');
  });

  it('no modo dano usa a soma dos dois maiores apenas no crítico', () => {
    const critical = rollStep({ ...baseStep, bonusDice: [6], damageMode: true }, rngFor([
      { value: 8, die: 10 },
      { value: 8, die: 10 },
      { value: 2, die: 6 },
    ]));
    expect(critical.step.critical).toBe(true);
    expect(critical.step.summedDice).toEqual([8, 8, 2]);
    expect(critical.step.damageBase).toBe(16);

    const normal = rollStep({ ...baseStep, damageMode: true, damageModifier: 3 }, rngFor([
      { value: 7, die: 10 },
      { value: 2, die: 10 },
    ]));
    expect(normal.step.critical).toBe(false);
    expect(normal.step.damageBase).toBe(7);
    expect(normal.step.damageModifier).toBe(3);
  });

  it('não calcula damageBase fora do modo dano', () => {
    const result = rollStep(baseStep, rngFor([
      { value: 7, die: 10 },
      { value: 2, die: 10 },
    ]));
    expect(result.step.damageBase).toBeUndefined();
  });

  it('valida dados, atributo, passo e dificuldade', () => {
    expect(() => rollStep({ ...baseStep, attributeDie: 5 as any })).toThrow('Dado inválido');
    expect(() => rollStep({ ...baseStep, skillDie: 100 as any })).toThrow('Dado inválido');
    expect(() =>
      rollStep({ ...baseStep, bonusDice: [7 as any] }, rngFor([{ value: 1, die: 10 }]))
    ).toThrow('Dado inválido');
    expect(() => rollStep({ ...baseStep, attribute: 'forca' as any })).toThrow('Atributo inválido');
    expect(() => rollStep({ ...baseStep, skillKey: '  ' })).toThrow('Perícia inválida');
    expect(() => rollStep({ ...baseStep, stepDelta: 3 })).toThrow('Ajuste de passo inválido');
    expect(() => rollStep({ ...baseStep, difficulty: 0 })).toThrow('Dificuldade inválida');
    expect(() => rollStep({ ...baseStep, difficulty: 101 })).toThrow('Dificuldade inválida');
  });

  it('aceita d20 explícito (efeito paranormal) para atributo e perícia', () => {
    const result = rollStep(
      { ...baseStep, attributeDie: 20, skillDie: 20 },
      rngFor([
        { value: 18, die: 20 },
        { value: 11, die: 20 },
      ])
    );

    expect(result.step.attribute.die).toBe(20);
    expect(result.step.skill.die).toBe(20);
    expect(result.total).toBe(29);
  });

  it('usa o label informado na expressão', () => {
    const result = rollStep(
      { ...baseStep, label: 'Ataque corpo a corpo' },
      rngFor([
        { value: 4, die: 10 },
        { value: 4, die: 10 },
      ])
    );

    expect(result.expression).toBe('Ataque corpo a corpo d10 + Físico d10 (DT 7)');
    expect(result.step.label).toBe('Ataque corpo a corpo');
  });
});
