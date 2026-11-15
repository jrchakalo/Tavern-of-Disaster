import { describe, expect, it } from 'vitest';
import {
  clampGridPoint,
  distanceInMeters,
  distanceInSquares,
  gridToPixel,
  gridToSquareId,
  isGridPointInside,
  pixelToGrid,
  squareCenterInGrid,
  squareIdToGrid,
} from '../gridGeometry';

describe('gridGeometry', () => {
  it('converte pixel para unidade de grade e volta', () => {
    const pixel = { x: 96, y: 48 };
    const grid = pixelToGrid(pixel, 32);
    expect(grid).toEqual({ x: 3, y: 1.5 });
    expect(gridToPixel(grid, 32)).toEqual(pixel);
  });

  it('trata squareSize inválido sem explodir', () => {
    expect(pixelToGrid({ x: 10, y: 10 }, 0)).toEqual({ x: 10, y: 10 });
    expect(pixelToGrid({ x: 10, y: 10 }, Number.NaN)).toEqual({ x: 10, y: 10 });
  });

  it('faz clamp nas bordas do grid', () => {
    expect(clampGridPoint({ x: -2, y: 99 }, 10, 8)).toEqual({ x: 0, y: 8 });
    expect(clampGridPoint({ x: Number.NaN, y: 3 }, 10, 8)).toEqual({ x: 0, y: 3 });
  });

  it('valida pontos dentro/fora do grid', () => {
    expect(isGridPointInside({ x: 0, y: 0 }, 10, 8)).toBe(true);
    expect(isGridPointInside({ x: 10, y: 8 }, 10, 8)).toBe(true);
    expect(isGridPointInside({ x: 10.1, y: 4 }, 10, 8)).toBe(false);
    expect(isGridPointInside({ x: 4, y: -0.1 }, 10, 8)).toBe(false);
  });

  it('converte squareId em coluna/linha', () => {
    expect(squareIdToGrid('sq-0', 5)).toEqual({ index: 0, col: 0, row: 0 });
    expect(squareIdToGrid('sq-12', 5)).toEqual({ index: 12, col: 2, row: 2 });
    expect(squareIdToGrid('sq-x', 5)).toBeNull();
    expect(squareIdToGrid('', 5)).toBeNull();
  });

  it('converte ponto de grade em squareId', () => {
    expect(gridToSquareId({ x: 0.2, y: 0.2 }, 5, 5)).toBe('sq-0');
    expect(gridToSquareId({ x: 3.9, y: 2.1 }, 5, 5)).toBe('sq-13');
    // A borda direita (x === width) pertence à última célula.
    expect(gridToSquareId({ x: 5, y: 2 }, 5, 5)).toBe('sq-14');
    expect(gridToSquareId({ x: -1, y: 2 }, 5, 5)).toBeNull();
  });

  it('calcula o centro da célula em unidades de grade', () => {
    expect(squareCenterInGrid('sq-0', 5)).toEqual({ x: 0.5, y: 0.5 });
    expect(squareCenterInGrid('sq-12', 5)).toEqual({ x: 2.5, y: 2.5 });
    expect(squareCenterInGrid('nope', 5)).toBeNull();
  });

  it('usa distância Chebyshev e converte para metros', () => {
    expect(distanceInSquares({ x: 0, y: 0 }, { x: 3, y: 1 })).toBe(3);
    expect(distanceInMeters({ x: 0, y: 0 }, { x: 3, y: 1 }, 1.5)).toBe(4.5);
    expect(distanceInMeters({ x: 0, y: 0 }, { x: 1, y: 1 }, 0)).toBe(1.5);
  });
});
