import { rollTable, OP_TABLES, type OpTableKey } from '../opTableService';

function rngFor(value: number, die: number): () => number {
  return () => (value - 0.5) / die;
}

function rollFor(table: OpTableKey, value: number, modifier = 0) {
  const die = table === 'falha-critica' ? 8 : 20;
  return rollTable({ table, modifier }, rngFor(value, die));
}

describe('opTableService.rollTable', () => {
  it('mapeia todas as faixas da tabela de lesão (1d20)', () => {
    const expected: Record<number, string> = {
      1: 'morte-subita',
      4: 'morte-subita',
      5: 'morte-lenta',
      9: 'morte-lenta',
      10: 'laceracao-profunda',
      11: 'sem-olho',
      12: 'sem-mao',
      13: 'sem-pe',
      14: 'tendao-comprometido',
      15: 'musculo-comprometido',
      16: 'orgao-interno-comprometido',
      17: 'orgao-sensorial-comprometido',
      18: 'cicatriz-assustadora',
      19: 'contusao',
      20: 'surto-adrenalina',
    };

    Object.entries(expected).forEach(([value, key]) => {
      const result = rollFor('lesao', Number(value));
      expect(result.table).toBe('lesao');
      expect(result.die).toBe(20);
      expect(result.roll).toBe(Number(value));
      expect(result.key).toBe(key);
      expect(result.summary.length).toBeGreaterThan(0);
    });
  });

  it('trata 20+ no modificador de patamar da lesão', () => {
    const result = rollFor('lesao', 19, 2);
    expect(result.roll).toBe(19);
    expect(result.modifier).toBe(2);
    expect(result.key).toBe('surto-adrenalina');
    expect(result.expression).toBe('Lesão 1d20+2');
  });

  it('mapeia todas as faixas da tabela de trauma (1d20)', () => {
    const expected: Record<number, string> = {
      1: 'colapso-total',
      4: 'colapso-total',
      5: 'tept',
      6: 'tept',
      7: 'degradacao-cognitiva',
      8: 'degradacao-cognitiva',
      9: 'macula-psiquica',
      10: 'macula-psiquica',
      11: 'chaga-da-alma',
      12: 'chaga-da-alma',
      13: 'retracao-defensiva',
      14: 'retracao-defensiva',
      15: 'panico',
      17: 'panico',
      18: 'estupor',
      19: 'estupor',
      20: 'injecao-animo',
    };

    Object.entries(expected).forEach(([value, key]) => {
      const result = rollFor('trauma', Number(value));
      expect(result.table).toBe('trauma');
      expect(result.key).toBe(key);
    });
  });

  it('aplica o modificador na consulta da faixa (sem alterar o roll bruto)', () => {
    const moved = rollFor('lesao', 3, 2);
    expect(moved.roll).toBe(3);
    expect(moved.key).toBe('morte-lenta');

    const jumped = rollFor('trauma', 1, 10);
    expect(jumped.key).toBe('chaga-da-alma');
  });

  it('mapeia todos os resultados da tabela de falha crítica (1d8)', () => {
    const expected: Record<number, string> = {
      1: 'vexame',
      2: 'fisico-1-passo',
      3: 'mente-1-passo',
      4: 'emocao-1-passo',
      5: 'perde-1d4-pv',
      6: 'perde-1d4-pd',
      7: 'perde-item',
      8: 'sem-efeito',
    };

    Object.entries(expected).forEach(([value, key]) => {
      const result = rollFor('falha-critica', Number(value));
      expect(result.table).toBe('falha-critica');
      expect(result.die).toBe(8);
      expect(result.key).toBe(key);
    });
  });

  it('limita o resultado da falha crítica a 8 mesmo com modificador alto', () => {
    const result = rollFor('falha-critica', 8, 5);
    expect(result.roll).toBe(8);
    expect(result.key).toBe('sem-efeito');
    expect(result.expression).toBe('Falha crítica 1d8+5');
  });

  it('expõe todas as bandas sem buracos', () => {
    (Object.keys(OP_TABLES) as OpTableKey[]).forEach((table) => {
      const bands = OP_TABLES[table];
      let next = 1;
      bands.forEach((band) => {
        expect(band.min).toBe(next);
        expect(band.max === null || band.max >= band.min).toBe(true);
        next = (band.max ?? band.min) + 1;
      });
      expect(bands[bands.length - 1].max).toBeNull();
    });
  });

  it('rejeita tabela e modificador inválidos', () => {
    expect(() => rollTable({ table: 'morte' as any }, rngFor(1, 20))).toThrow('Tabela inválida');
    expect(() => rollTable({ table: 'lesao', modifier: 11 }, rngFor(1, 20))).toThrow(
      'Modificador inválido'
    );
    expect(() => rollTable({ table: 'lesao', modifier: -11 }, rngFor(1, 20))).toThrow(
      'Modificador inválido'
    );
    expect(() => rollTable({ table: 'lesao', modifier: 1.5 }, rngFor(1, 20))).toThrow(
      'Modificador inválido'
    );
  });
});
