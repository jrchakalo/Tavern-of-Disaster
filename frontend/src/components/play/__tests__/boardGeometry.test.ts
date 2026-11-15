import { describe, it, expect } from 'vitest';

import { pingCenterPixels } from '../boardGeometry';

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
