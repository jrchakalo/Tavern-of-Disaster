import { describe, it, expect } from 'vitest';

import { pingCenterPixels, TOKEN_HIT_MIN_PX, tokenHitStyle } from '../boardGeometry';

/**
 * Pings são unidades de grade em todos os tabuleiros (TABLE_MODE §5.3).
 * O heurístico grid-vs-pixel não existe mais para ping: `x/y` sempre
 * multiplicam o tamanho do quadrado.
 */
describe('pingCenterPixels', () => {
  it('converts grid units to pixels on large grids (no pixel heuristic)', () => {
    expect(pingCenterPixels({ id: 'p1', x: 35, y: 7 }, 50, 50, 10)).toEqual({ x: 350, y: 70 });
  });

  it('anchors squareId pings to the center of the cell', () => {
    // sq-45 em grade de 50 → coluna 45, linha 0
    expect(pingCenterPixels({ id: 'p2', squareId: 'sq-45' }, 50, 50, 10)).toEqual({
      x: 455,
      y: 5,
    });
  });

  it('prefers squareId when the payload carries both forms', () => {
    expect(pingCenterPixels({ id: 'p3', squareId: 'sq-0', x: 35, y: 7 }, 50, 50, 10)).toEqual({
      x: 5,
      y: 5,
    });
  });

  it('returns null without coordinates or without a usable square size', () => {
    expect(pingCenterPixels({ id: 'p4' }, 50, 50, 10)).toBeNull();
    expect(pingCenterPixels({ id: 'p5', x: 1, y: 1 }, 50, 50, 0)).toBeNull();
    expect(pingCenterPixels({ id: 'p6', x: 1, y: 1 }, 50, 50, Number.NaN)).toBeNull();
  });
});

describe('tokenHitStyle', () => {
  const token = {
    token: { _id: 't1', squareId: 'sq-0', name: 'Herói' } as never,
    col: 0,
    row: 0,
    footprint: 1,
  };

  it('garante 44×44 px mesmo com célula menor e mantém o centro da célula', () => {
    const style = tokenHitStyle(token, 20);
    expect(TOKEN_HIT_MIN_PX).toBe(44);
    expect(style.width).toBe('44px');
    expect(style.height).toBe('44px');
    expect(style.left).toBe('-12px');
    expect(style.top).toBe('-12px');
  });

  it('não encolhe tokens maiores que o alvo mínimo', () => {
    const big = { ...token, footprint: 3 };
    const style = tokenHitStyle(big, 40);
    expect(style.width).toBe('120px');
    expect(style.height).toBe('120px');
    expect(style.left).toBe('0px');
  });
});
