import { getFootprintSize, buildFootprintSquares, isSquareInsideGrid } from '../tokenService';

describe('tokenService helpers', () => {
  it('returns footprint size based on label', () => {
    expect(getFootprintSize('Pequeno/Médio')).toBe(1);
    expect(getFootprintSize('Grande')).toBe(2);
    expect(getFootprintSize('Unknown')).toBe(1);
  });

  it('builds footprint squares for tokens that fit within the grid', () => {
    const squares = buildFootprintSquares('sq-0', 'Grande', 10, 10);
    expect(squares).toEqual(['sq-0', 'sq-1', 'sq-10', 'sq-11']);
  });

  it('throws when footprint would exceed grid boundaries', () => {
    expect(() => buildFootprintSquares('sq-9', 'Grande', 10, 10)).toThrow('Token não cabe dentro do grid.');
  });

  it('detects whether a square id is inside the grid bounds', () => {
    expect(isSquareInsideGrid('sq-5', 3, 3)).toBe(true);
    expect(isSquareInsideGrid('sq-9', 3, 3)).toBe(false);
  });
});
