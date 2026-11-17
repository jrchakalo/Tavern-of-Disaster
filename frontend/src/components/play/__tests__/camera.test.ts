import { describe, expect, it } from 'vitest';
import {
  clampOffset,
  clampZoom,
  centerOnPoint,
  isCameraIdentity,
  MAX_ZOOM,
  MIN_ZOOM,
  zoomAround,
} from '../camera';

const canvas = { width: 300, height: 300 };
const viewport = { width: 390, height: 620 };

describe('câmera do tabuleiro', () => {
  it('clamps zoom to 1–4× and rejects invalid numbers', () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
    expect(clampZoom(2.5)).toBe(2.5);
  });

  it('keeps offset at zero when the board fits the viewport', () => {
    expect(clampOffset(120, -80, 1, canvas, viewport)).toEqual({ x: 0, y: 0 });
  });

  it('clamps panning to the scaled board edges', () => {
    // 300px × 2 = 600; viewport 390 → folga de 105px em cada lado.
    const offset = clampOffset(500, -500, 2, canvas, viewport);
    expect(offset.x).toBe(105);
    // 300 × 2 = 600; viewport 620 → não há folga vertical.
    expect(offset.y).toBe(0);
  });

  it('clamps horizontal and vertical slack independently in landscape', () => {
    const landscape = { width: 844, height: 320 };
    const scaled = { width: 300 * 3, height: 300 * 3 };
    const offset = clampOffset(1000, 1000, 3, canvas, landscape);
    expect(offset.x).toBe((scaled.width - landscape.width) / 2);
    expect(offset.y).toBe((scaled.height - landscape.height) / 2);
  });

  it('zooms around a focus point without changing the anchor', () => {
    const next = zoomAround({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 0 }, canvas, viewport);
    expect(next.scale).toBe(2);
    // O ponto focado continua sob o dedo: o offset acompanha o crescimento.
    expect(next.x).toBe(-100);
    expect(next.y).toBe(0);
  });

  it('centers a board point and respects the clamps', () => {
    const point = { x: 200, y: 150 };
    const next = centerOnPoint(point, 2, canvas, viewport);
    expect(next.scale).toBe(2);
    expect(next.x).toBe(-(point.x - canvas.width / 2) * 2);
    expect(next.y).toBe(0);
  });

  it('reports the identity camera used by double-tap reset', () => {
    expect(isCameraIdentity({ scale: 1, x: 0, y: 0 })).toBe(true);
    expect(isCameraIdentity({ scale: 1.5, x: 0, y: 0 })).toBe(false);
  });
});
