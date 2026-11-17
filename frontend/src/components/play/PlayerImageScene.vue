<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampOffset,
  clampZoom,
  zoomAround,
  type Size,
} from './camera';

/**
 * Cena de imagem no celular: visualizador com pinça/pan/zoom, sem grade,
 * tokens ou turno. O conteúdo é somente a imagem — nenhuma ação de tabuleiro.
 */
const props = withDefaults(
  defineProps<{
    imageUrl?: string | null;
    sceneName?: string;
  }>(),
  { imageUrl: null, sceneName: '' },
);

const stageRef = ref<HTMLDivElement | null>(null);
const viewport = ref<Size>({ width: 1, height: 1 });
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const element = stageRef.value;
  if (!element || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (rect) {
      viewport.value = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    }
  });
  resizeObserver.observe(element);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

const camera = reactive({ scale: MIN_ZOOM, x: 0, y: 0 });

const transform = computed(
  () => `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`,
);
const zoomLabel = computed(() => `${Math.round(camera.scale * 100)}%`);
const canZoomIn = computed(() => camera.scale < MAX_ZOOM - 0.001);
const canZoomOut = computed(() => camera.scale > MIN_ZOOM + 0.001);
const hasCamera = computed(
  () => camera.scale > MIN_ZOOM + 0.001 || camera.x !== 0 || camera.y !== 0,
);

const ariaLabel = computed(() =>
  props.imageUrl
    ? `Imagem da cena${props.sceneName ? `: ${props.sceneName}` : ''}. Zoom ${zoomLabel.value}.`
    : 'O Mestre ainda não definiu esta imagem.',
);

function applyCamera(next: { scale: number; x: number; y: number }) {
  const scale = clampZoom(next.scale);
  const offset = clampOffset(next.x, next.y, scale, viewport.value, viewport.value);
  camera.scale = scale;
  camera.x = offset.x;
  camera.y = offset.y;
}

function resetCamera() {
  applyCamera({ scale: MIN_ZOOM, x: 0, y: 0 });
}

function focusFromClient(clientX: number, clientY: number) {
  const element = stageRef.value;
  if (!element) return { x: 0, y: 0 };
  const rect = element.getBoundingClientRect();
  return {
    x: clientX - (rect.left + rect.width / 2),
    y: clientY - (rect.top + rect.height / 2),
  };
}

function zoomBy(delta: number, focus = { x: 0, y: 0 }) {
  if (!props.imageUrl) return;
  applyCamera(zoomAround({ ...camera }, camera.scale + delta, focus, viewport.value, viewport.value));
}

function zoomIn() {
  zoomBy(0.5);
}

function zoomOut() {
  zoomBy(-0.5);
}

function onWheel(event: WheelEvent) {
  zoomBy(event.deltaY > 0 ? -0.25 : 0.25, focusFromClient(event.clientX, event.clientY));
}

// ---------------------------------------------------------------------------
// Ponteiros: um dedo arrasta, dois dedos dão zoom. Duplo toque reenquadra.
// ---------------------------------------------------------------------------

const pointers = new Map<number, { x: number; y: number }>();
let gesture: 'none' | 'pan' | 'pinch' = 'none';
let panStart = { x: 0, y: 0, camX: 0, camY: 0 };
let pinchStart = { dist: 0, scale: 1, camX: 0, camY: 0, focus: { x: 0, y: 0 } };
let moved = false;
let lastTapAt = 0;
let lastTapPoint = { x: 0, y: 0 };

function pointerDistance(): number {
  const values = Array.from(pointers.values());
  if (values.length < 2) return 0;
  return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
}

function startPinch() {
  const values = Array.from(pointers.values());
  if (values.length < 2) return;
  const midX = (values[0].x + values[1].x) / 2;
  const midY = (values[0].y + values[1].y) / 2;
  gesture = 'pinch';
  moved = true;
  pinchStart = {
    dist: Math.max(1, pointerDistance()),
    scale: camera.scale,
    camX: camera.x,
    camY: camera.y,
    focus: focusFromClient(midX, midY),
  };
}

function onPointerDown(event: PointerEvent) {
  if (!props.imageUrl) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  try {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  } catch {
    // Captura é opcional; o navegador ainda entrega o gesto.
  }

  if (pointers.size >= 2) {
    startPinch();
    return;
  }

  gesture = 'pan';
  moved = false;
  panStart = { x: event.clientX, y: event.clientY, camX: camera.x, camY: camera.y };
}

function onPointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (gesture === 'pinch' && pointers.size >= 2) {
    const ratio = pointerDistance() / pinchStart.dist;
    applyCamera(
      zoomAround(
        { scale: pinchStart.scale, x: pinchStart.camX, y: pinchStart.camY },
        pinchStart.scale * ratio,
        pinchStart.focus,
        viewport.value,
        viewport.value,
      ),
    );
    return;
  }

  if (gesture !== 'pan') return;
  const dx = event.clientX - panStart.x;
  const dy = event.clientY - panStart.y;
  if (Math.hypot(dx, dy) > 3) moved = true;
  applyCamera({ scale: camera.scale, x: panStart.camX + dx, y: panStart.camY + dy });
}

function onPointerUp(event: PointerEvent) {
  const wasActive = pointers.has(event.pointerId);
  const wasMoved = moved;
  const wasPinch = gesture === 'pinch';
  pointers.delete(event.pointerId);
  if (pointers.size === 0) gesture = 'none';
  if (!wasActive || wasMoved || wasPinch) return;

  const now = Date.now();
  const isDoubleTap =
    now - lastTapAt < 320 &&
    Math.hypot(event.clientX - lastTapPoint.x, event.clientY - lastTapPoint.y) < 28;
  lastTapAt = now;
  lastTapPoint = { x: event.clientX, y: event.clientY };
  if (isDoubleTap) resetCamera();
}

function onPointerCancel(event: PointerEvent) {
  pointers.delete(event.pointerId);
  if (pointers.size === 0) gesture = 'none';
}
</script>

<template>
  <div class="player-image" :class="{ 'is-empty': !imageUrl }">
    <div
      ref="stageRef"
      class="player-image__stage"
      role="group"
      :aria-label="ariaLabel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @lostpointercapture="onPointerCancel"
      @wheel.prevent="onWheel"
      @dblclick="resetCamera"
      @contextmenu.prevent
    >
      <img
        v-if="imageUrl"
        class="player-image__img"
        :src="imageUrl"
        alt=""
        draggable="false"
        :style="{ transform }"
      />

      <div v-else class="player-image__empty">
        <p class="player-image__empty-title">O Mestre ainda não definiu esta imagem</p>
        <p class="player-image__empty-copy">
          A imagem da cena aparece aqui assim que o Mestre a definir.
        </p>
      </div>

      <p v-if="imageUrl" class="player-image__label">Imagem da cena</p>
    </div>

    <div v-if="imageUrl" class="player-image__controls" role="group" aria-label="Zoom da imagem">
      <button
        type="button"
        class="player-image__btn"
        aria-label="Aproximar imagem"
        :disabled="!canZoomIn"
        @click="zoomIn"
      >
        +
      </button>
      <button
        type="button"
        class="player-image__btn"
        aria-label="Afastar imagem"
        :disabled="!canZoomOut"
        @click="zoomOut"
      >
        −
      </button>
      <button
        type="button"
        class="player-image__btn"
        aria-label="Reenquadrar imagem"
        :disabled="!hasCamera"
        @click="resetCamera"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </button>
      <span v-if="camera.scale > MIN_ZOOM + 0.001" class="player-image__scale" aria-live="polite">
        {{ zoomLabel }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.player-image {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--ink-0);
}

.player-image__stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  -webkit-user-select: none;
  user-select: none;
}

.player-image__stage:active {
  cursor: grabbing;
}

.player-image__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-origin: center center;
  will-change: transform;
  pointer-events: none;
  -webkit-user-drag: none;
}

.player-image__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-2);
  width: min(320px, calc(100% - 32px));
  padding: var(--s-5) var(--s-4);
  border: 1px solid var(--line-strong);
  border-top: 3px solid var(--manila);
  border-radius: var(--radius-md);
  background: var(--panel);
  text-align: center;
}

.player-image__empty-title {
  margin: 0;
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.2;
}

.player-image__empty-copy {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.45;
}

.player-image__label {
  position: absolute;
  bottom: 10px;
  left: 10px;
  z-index: 2;
  margin: 0;
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: rgb(11 13 15 / 0.82);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  letter-spacing: 0.02em;
  pointer-events: none;
}

.player-image__controls {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: rgb(18 23 26 / 0.94);
}

.player-image__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--raised);
  color: var(--text);
  font-family: var(--font-data);
  font-size: var(--text-base);
  line-height: 1;
  cursor: pointer;
}

.player-image__btn:hover:not(:disabled) {
  border-color: var(--accent-ink);
  background: var(--raised-2);
}

.player-image__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.player-image__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.player-image__scale {
  padding-top: 2px;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  text-align: center;
}

@media (max-height: 520px) and (orientation: landscape) {
  .player-image__controls {
    top: 4px;
    right: 4px;
    flex-direction: row;
  }
}

@media (prefers-reduced-motion: reduce) {
  .player-image__img {
    transition: none;
  }
}
</style>
