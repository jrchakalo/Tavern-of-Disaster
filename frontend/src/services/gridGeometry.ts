/**
 * Geometria canônica do tabuleiro.
 *
 * Unidade no fio/protocolo: **célula de grade** (1 = um quadrado).
 * Pixel é apenas detalhe de renderização e nunca deve ir para o servidor.
 */

export type GridPoint = { x: number; y: number };

export type GridSquareCoords = {
  index: number;
  col: number;
  row: number;
};

function safeSize(squareSize: number): number {
  return Number.isFinite(squareSize) && squareSize > 0 ? squareSize : 1;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Converte um ponto em pixels locais do grid para unidades de grade. */
export function pixelToGrid(point: GridPoint, squareSize: number): GridPoint {
  const size = safeSize(squareSize);
  return { x: point.x / size, y: point.y / size };
}

/** Converte unidades de grade para pixels locais do grid. */
export function gridToPixel(point: GridPoint, squareSize: number): GridPoint {
  const size = safeSize(squareSize);
  return { x: point.x * size, y: point.y * size };
}

/** Garante que o ponto fique dentro dos limites do grid (bordas inclusas). */
export function clampGridPoint(point: GridPoint, gridWidth: number, gridHeight: number): GridPoint {
  const width = Math.max(1, gridWidth);
  const height = Math.max(1, gridHeight);
  return {
    x: clamp(point.x, 0, width),
    y: clamp(point.y, 0, height),
  };
}

export function isGridPointInside(point: GridPoint, gridWidth: number, gridHeight: number): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= Math.max(1, gridWidth) &&
    point.y <= Math.max(1, gridHeight)
  );
}

/** Converte `sq-<índice>` em coluna/linha. Retorna null para id inválido. */
export function squareIdToGrid(squareId: string, gridWidth: number): GridSquareCoords | null {
  if (typeof squareId !== 'string') return null;
  const match = /^sq-(\d+)$/.exec(squareId);
  if (!match) return null;
  const width = Math.max(1, gridWidth);
  const index = Number(match[1]);
  if (!Number.isInteger(index) || index < 0) return null;
  return {
    index,
    col: index % width,
    row: Math.floor(index / width),
  };
}

/** Converte um ponto de grade no id da célula que o contém. */
export function gridToSquareId(point: GridPoint, gridWidth: number, gridHeight: number): string | null {
  const width = Math.max(1, gridWidth);
  const height = Math.max(1, gridHeight);
  if (!isGridPointInside(point, width, height)) return null;
  const col = Math.min(width - 1, Math.floor(point.x));
  const row = Math.min(height - 1, Math.floor(point.y));
  return `sq-${row * width + col}`;
}

/** Centro da célula em unidades de grade. */
export function squareCenterInGrid(squareId: string, gridWidth: number): GridPoint | null {
  const coords = squareIdToGrid(squareId, gridWidth);
  if (!coords) return null;
  return { x: coords.col + 0.5, y: coords.row + 0.5 };
}

/** Distância de grade (Chebyshev), usada pelo movimento do VTT. */
export function distanceInSquares(a: GridPoint, b: GridPoint): number {
  return Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}

/** Distância em metros a partir da escala da cena. */
export function distanceInMeters(a: GridPoint, b: GridPoint, metersPerSquare: number): number {
  const scale = Number.isFinite(metersPerSquare) && metersPerSquare > 0 ? metersPerSquare : 1.5;
  return distanceInSquares(a, b) * scale;
}
