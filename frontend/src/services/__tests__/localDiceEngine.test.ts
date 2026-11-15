import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rollLocalDice } from '../localDiceEngine';

// Testes P3-FE-5: motor local de dados — dados explosivos `!` e limites
// idênticos ao backend (docs/SHEETS_DICE.md §6.1/§6.2).

describe('localDiceEngine — sintaxe existente', () => {
  it('rola NdM simples', () => {
    const result = rollLocalDice('2d6');
    expect(result.rolls).toHaveLength(2);
    expect(result.rolls.every((r) => r.value >= 1 && r.value <= 6)).toBe(true);
    expect(result.total).toBe(result.rolls.reduce((sum, r) => sum + r.value, 0));
  });

  it('mantém kh/kl, adv/dis e modificador', () => {
    const result = rollLocalDice('2d20kh1+5');
    expect(result.rolls.filter((r) => r.kept === 'kept')).toHaveLength(1);
    expect(result.modifier).toBe(5);

    const dis = rollLocalDice('2d20dis');
    expect(dis.rolls).toHaveLength(2);
    expect(dis.rolls.filter((r) => r.kept === 'kept')).toHaveLength(1);
    expect(dis.total).toBe(Math.min(...dis.rolls.map((r) => r.value)));
  });

  it('0d6 devolve apenas o modificador (comportamento do backend)', () => {
    const result = rollLocalDice('0d6+3');
    expect(result.rolls).toHaveLength(0);
    expect(result.total).toBe(3);
  });
});

describe('localDiceEngine — dados explosivos (!)', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randomSpy = vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('dado no valor máximo rola de novo e soma (1d10! = 10 + reroll)', () => {
    // Sequência: 10 (explode), 7 → total 17
    randomSpy.mockReturnValueOnce(0.95).mockReturnValueOnce(0.6);
    const result = rollLocalDice('1d10!');

    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0].value).toBe(17);
    expect(result.total).toBe(17);
  });

  it('cadeia de explosões soma cada re-rolagem (1d6! = 6+6+2)', () => {
    // 0.99→6 (explode), 0.99→6 (explode), 0.2→2
    randomSpy
      .mockReturnValueOnce(0.999)
      .mockReturnValueOnce(0.999)
      .mockReturnValueOnce(0.2);
    const result = rollLocalDice('1d6!');

    expect(result.rolls[0].value).toBe(14);
    expect(result.total).toBe(14);
  });

  it('explosão respeita o cap de 20 por dado (1d2!)', () => {
    // Sempre valor máximo (2): rolagem inicial + 20 re-rolagens = 42.
    randomSpy.mockReturnValue(0.999);
    const result = rollLocalDice('1d2!');

    expect(result.rolls[0].value).toBe(42);
  });

  it('kh funciona com explosivos (2d6!kh1)', () => {
    // Dado A: 6 (explode) + 1 = 7; Dado B: 2 → kh1 mantém 7
    randomSpy
      .mockReturnValueOnce(0.999) // A: 6
      .mockReturnValueOnce(0.0)   // A: 1
      .mockReturnValueOnce(0.3);  // B: 2
    const result = rollLocalDice('2d6!kh1');

    expect(result.rolls).toHaveLength(2);
    const values = result.rolls.map((r) => r.value).sort((a, b) => b - a);
    expect(values).toEqual([7, 2]);
    expect(result.total).toBe(7);
  });

  it('modificador é aplicado ao total explosivo (1d10!+6)', () => {
    randomSpy.mockReturnValueOnce(0.95).mockReturnValueOnce(0.6); // 10 + 7
    const result = rollLocalDice('1d10!+6');
    expect(result.total).toBe(23);
    expect(result.modifier).toBe(6);
  });
});

describe('localDiceEngine — limites do backend', () => {
  it('rejeita expressão acima de 80 caracteres', () => {
    const expression = `1d20+${'1'.repeat(80)}`;
    expect(() => rollLocalDice(expression)).toThrow(/Expressão de dados inválida/);
  });

  it('rejeita mais de 100 dados', () => {
    expect(() => rollLocalDice('101d20')).toThrow(/Máximo de 100 dados/);
  });

  it('rejeita faces fora de 2..1000', () => {
    expect(() => rollLocalDice('1d1001')).toThrow(/faces inválido/i);
    expect(() => rollLocalDice('1d1')).toThrow(/faces inválido/i);
  });

  it('rejeita modificador fora de ±1000', () => {
    expect(() => rollLocalDice('1d20+1001')).toThrow(/Modificador fora do limite/);
    expect(() => rollLocalDice('1d20-1001')).toThrow(/Modificador fora do limite/);
  });

  it('rejeita expressões inválidas', () => {
    expect(() => rollLocalDice('d')).toThrow();
    expect(() => rollLocalDice('2x6')).toThrow();
    expect(() => rollLocalDice('')).toThrow();
    expect(() => rollLocalDice('1d20;drop table')).toThrow();
  });
});
