import type { AuraInfo, TokenInfo, TokenSize } from '../../types';

export interface BoardTokenEntry {
  token: TokenInfo;
  col: number;
  row: number;
  footprint: number;
}

export function footprintForSize(size: TokenSize | string | undefined): number {
  switch (size) {
    case 'Grande':
      return 2;
    case 'Enorme':
      return 3;
    case 'Descomunal':
      return 4;
    case 'Colossal':
      return 5;
    default:
      return 1;
  }
}

export function squareIndex(squareId: string): number {
  const parsed = parseInt(squareId.replace(/^sq-/, ''), 10);
  return Number.isNaN(parsed) ? -1 : parsed;
}

export function tokenEntries(tokens: TokenInfo[], gridWidth: number): BoardTokenEntry[] {
  const cols = Math.max(1, gridWidth || 1);
  return tokens.map((token) => {
    const index = squareIndex(token.squareId);
    const col = index < 0 ? 0 : index % cols;
    const row = index < 0 ? 0 : Math.floor(index / cols);
    return { token, col, row, footprint: footprintForSize(token.size) };
  });
}

export function tokenStyle(entry: BoardTokenEntry, squareSize: number): Record<string, string> {
  return {
    left: `${entry.col * squareSize}px`,
    top: `${entry.row * squareSize}px`,
    width: `${entry.footprint * squareSize}px`,
    height: `${entry.footprint * squareSize}px`,
  };
}

/**
 * Alvo mínimo de toque do token, em pixels de tela. O tabuleiro usa zoom
 * mínimo 1×, então 44 px locais equivalem a 44 px de tela.
 */
export const TOKEN_HIT_MIN_PX = 44;

/**
 * Caixa de toque invisível, centrada no token. Não altera o desenho (o token
 * visual continua no tamanho da célula), só garante um alvo de 44×44 px mesmo
 * quando a célula renderizada é menor que isso.
 */
export function tokenHitStyle(entry: BoardTokenEntry, squareSize: number): Record<string, string> {
  const hit = Math.max(entry.footprint * squareSize, TOKEN_HIT_MIN_PX);
  const centerX = (entry.col + entry.footprint / 2) * squareSize;
  const centerY = (entry.row + entry.footprint / 2) * squareSize;
  return {
    left: `${centerX - hit / 2}px`,
    top: `${centerY - hit / 2}px`,
    width: `${hit}px`,
    height: `${hit}px`,
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  let normalized = hex.replace('#', '');
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((char) => char + char)
      .join('');
  }
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return `rgba(255,255,255,${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface AuraElement {
  id: string;
  style: Record<string, string>;
}

export interface BoardPing {
  id: string;
  squareId?: string;
  x?: number;
  y?: number;
  color?: string;
}

/**
 * Centro do ping em pixels locais do tabuleiro.
 *
 * Pings são **sempre** unidades de grade (`docs/TABLE_MODE.md` §5.3): `x/y`
 * multiplicam o tamanho do quadrado. Não existe fallback de pixel legado para
 * ping — o servidor valida `0..gridWidth/height` antes de emitir.
 * O ramo `squareId` ancora no centro da célula.
 */
export function pingCenterPixels(
  ping: BoardPing,
  gridWidth: number,
  gridHeight: number,
  squareSize: number,
): { x: number; y: number } | null {
  const size = Number.isFinite(squareSize) && squareSize > 0 ? squareSize : 0;
  if (ping.squareId) {
    const index = squareIndex(ping.squareId);
    if (index >= 0 && size > 0) {
      const cols = Math.max(1, gridWidth);
      const col = index % cols;
      const row = Math.floor(index / cols);
      return { x: (col + 0.5) * size, y: (row + 0.5) * size };
    }
  }
  if (ping.x == null || ping.y == null || size <= 0) return null;
  return { x: ping.x * size, y: ping.y * size };
}

/**
 * Auras usam a mesma geometria do tabuleiro: o raio em metros vira pixels a
 * partir do tamanho do quadrado, e o centro é ancorado no token em coordenadas
 * de grid. Nada de pixels de dispositivo diretos.
 */
export function auraElements(
  auras: AuraInfo[],
  entries: BoardTokenEntry[],
  squareSize: number,
  metersPerSquare: number,
): AuraElement[] {
  const byToken = new Map(entries.map((entry) => [entry.token._id, entry]));
  const result: AuraElement[] = [];
  for (const aura of auras) {
    const entry = byToken.get(aura.tokenId);
    if (!entry) continue;
    const radius = Math.max(0, (aura.radiusMeters / (metersPerSquare || 1.5)) * squareSize);
    const centerX = (entry.col + entry.footprint / 2) * squareSize;
    const centerY = (entry.row + entry.footprint / 2) * squareSize;
    result.push({
      id: aura.id,
      style: {
        left: `${centerX - radius}px`,
        top: `${centerY - radius}px`,
        width: `${radius * 2}px`,
        height: `${radius * 2}px`,
        borderColor: aura.color,
        backgroundColor: hexToRgba(aura.color, 0.12),
      },
    });
  }
  return result;
}

/**
 * BFS em 8 direções com custo de 1 quadrado por passo, igual ao MapViewport.
 * O servidor continua sendo a autoridade; isto é apenas o destaque visual.
 */
export function computeReachableSquares(options: {
  startSquareId: string;
  gridWidth: number;
  gridHeight: number;
  maxMovement: number;
  metersPerSquare: number;
  occupiedSquareIds: Set<string>;
  canOverlap: boolean;
}): string[] {
  const {
    startSquareId,
    gridWidth,
    gridHeight,
    maxMovement,
    metersPerSquare,
    occupiedSquareIds,
    canOverlap,
  } = options;
  const cols = Math.max(1, gridWidth);
  const rows = Math.max(1, gridHeight);
  const startIndex = squareIndex(startSquareId);
  if (startIndex < 0) return [];

  const stepCost = Math.max(0.0001, metersPerSquare || 1.5);
  const maxSteps = Math.floor(Math.max(0, maxMovement) / stepCost + 1e-6);
  const blocked = canOverlap ? new Set<string>() : occupiedSquareIds;
  const reachable = new Set<string>();
  const queue: Array<{ index: number; steps: number }> = [{ index: startIndex, steps: 0 }];
  const visited = new Set<number>([startIndex]);

  while (queue.length > 0) {
    const { index, steps } = queue.shift()!;
    if (steps > 0) reachable.add(`sq-${index}`);
    if (steps >= maxSteps) continue;

    const x = index % cols;
    const y = Math.floor(index / cols);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextY < 0 || nextX >= cols || nextY >= rows) continue;
        const nextIndex = nextY * cols + nextX;
        if (visited.has(nextIndex)) continue;
        visited.add(nextIndex);
        const nextId = `sq-${nextIndex}`;
        if (blocked.has(nextId)) continue;
        queue.push({ index: nextIndex, steps: steps + 1 });
      }
    }
  }
  return Array.from(reachable);
}
