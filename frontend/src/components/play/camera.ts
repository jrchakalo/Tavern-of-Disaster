/**
 * Câmera do tabuleiro do jogador.
 *
 * Puro e sem DOM: a view aplica `transform: translate() scale()` no mesmo
 * container que já desenha a grade. Nenhuma coordenada de grade muda — o
 * pan/zoom é só uma transformação visual. Os clamps garantem que o mapa
 * nunca “fuja” da moldura.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export interface Size {
  width: number;
  height: number;
}

export interface CameraState {
  scale: number;
  x: number;
  y: number;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clampValue(value: number, min: number, max: number): number {
  const result = Math.min(max, Math.max(min, value));
  return result === 0 ? 0 : result;
}

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/**
 * Limite de deslocamento para não abrir área vazia na moldura.
 * Com o tabuleiro menor que o viewport (escala 1), o único offset válido é 0.
 */
export function clampOffset(
  x: number,
  y: number,
  scale: number,
  canvas: Size,
  viewport: Size,
): { x: number; y: number } {
  const safeScale = clampZoom(scale);
  const slackX = Math.max(0, (finite(canvas.width) * safeScale - finite(viewport.width)) / 2);
  const slackY = Math.max(0, (finite(canvas.height) * safeScale - finite(viewport.height)) / 2);
  return {
    x: clampValue(finite(x), -slackX, slackX),
    y: clampValue(finite(y), -slackY, slackY),
  };
}

/**
 * Zoom mantendo um ponto fixo na tela. `focus` é relativo ao centro do
 * tabuleiro, em pixels de tela antes do novo zoom.
 */
export function zoomAround(
  previous: CameraState,
  nextScale: number,
  focus: { x: number; y: number },
  canvas: Size,
  viewport: Size,
): CameraState {
  const scale = clampZoom(nextScale);
  const base = clampZoom(previous.scale);
  const ratio = base > 0 ? scale / base : 1;
  const nextX = focus.x - (focus.x - previous.x) * ratio;
  const nextY = focus.y - (focus.y - previous.y) * ratio;
  const offset = clampOffset(nextX, nextY, scale, canvas, viewport);
  return { scale, x: offset.x, y: offset.y };
}

/**
 * Offset que coloca um ponto do tabuleiro (px locais, a partir do canto
 * superior esquerdo) no centro da moldura.
 */
export function centerOnPoint(
  point: { x: number; y: number },
  scale: number,
  canvas: Size,
  viewport: Size,
): CameraState {
  const safeScale = clampZoom(scale);
  const x = -(finite(point.x) - finite(canvas.width) / 2) * safeScale;
  const y = -(finite(point.y) - finite(canvas.height) / 2) * safeScale;
  const offset = clampOffset(x, y, safeScale, canvas, viewport);
  return { scale: safeScale, x: offset.x, y: offset.y };
}

export function isCameraIdentity(state: CameraState): boolean {
  return state.scale === MIN_ZOOM && state.x === 0 && state.y === 0;
}
