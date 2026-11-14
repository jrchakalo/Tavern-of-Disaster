<script setup lang="ts">
import { computed } from 'vue';
import type { GridSquare, TokenInfo, TokenSize } from '../types';

type AuraSummary = { tokenId: string; radiusMeters: number; color: string; name: string; sceneId: string };

type TokenEntry = {
  square: GridSquare;
  token: TokenInfo;
  col: number;
  row: number;
};

interface TokenLayerProps {
  tokens: TokenEntry[];
  squareSize: number;
  pixelWidth: number;
  pixelHeight: number;
  selectedTokenId?: string | null;
  currentTurnTokenId?: string | null;
  currentUserId?: string | null;
  measurementColor?: string;
  areaAffectedSquares?: string[];
  isMeasuring: boolean;
  auras?: AuraSummary[];
  onDragStart?: (event: DragEvent, token: TokenInfo) => void;
  onPointerDown?: (event: PointerEvent, token: TokenInfo) => void;
  onPointerMove?: (event: PointerEvent) => void;
  onPointerUp?: (event: PointerEvent) => void;
  onTokenClick?: (square: GridSquare, event: MouseEvent) => void;
}

const props = withDefaults(defineProps<TokenLayerProps>(), {
  tokens: () => [],
  selectedTokenId: null,
  currentTurnTokenId: null,
  currentUserId: null,
  measurementColor: undefined,
  areaAffectedSquares: () => [],
  auras: () => [],
  onDragStart: undefined,
  onPointerDown: undefined,
  onPointerMove: undefined,
  onPointerUp: undefined,
  onTokenClick: undefined,
});

const affectedSquares = computed(() => new Set(props.areaAffectedSquares || []));
const auraLookup = computed(() => {
  const map = new Map<string, AuraSummary>();
  props.auras?.forEach((aura) => map.set(aura.tokenId, aura));
  return map;
});

const layerStyle = computed(() => ({
  width: `${props.pixelWidth}px`,
  height: `${props.pixelHeight}px`,
}));

function getTokenSizeInSquares(size: TokenSize): number {
  switch (size) {
    case 'Grande': return 2;
    case 'Enorme': return 3;
    case 'Descomunal': return 4;
    case 'Colossal': return 5;
    default: return 1;
  }
}

function getTokenHighlightStyle(squareId: string): Record<string, string> {
  if (!affectedSquares.value.has(squareId)) return {};
  const glowColor = props.measurementColor || '#00ffff';
  return {
    boxShadow: `0 0 8px 4px ${hexToRgba(glowColor, 0.9)}`,
    outline: `2px solid ${hexToRgba(glowColor, 0.9)}`,
  };
}

function hexToRgba(hex: string, alpha = 0.28): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildTokenStyle(entry: TokenEntry): Record<string, string> {
  const footprint = getTokenSizeInSquares(entry.token.size);
  const width = Math.max(1, footprint) * props.squareSize;
  const height = width;
  const top = entry.row * props.squareSize;
  const left = entry.col * props.squareSize;
  const style: Record<string, string> = {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(${left}px, ${top}px)`,
  };

  const ownsActiveToken =
    props.currentUserId &&
    entry.token.ownerId &&
    entry.token.ownerId._id === props.currentUserId &&
    entry.token._id === props.currentTurnTokenId;

  if (props.measurementColor && ownsActiveToken) {
    style['--active-turn-glow'] = hexToRgba(props.measurementColor, 0.9);
  }

  return { ...style, ...getTokenHighlightStyle(entry.square.id) };
}

function handleDragStart(event: DragEvent, token: TokenInfo) {
  props.onDragStart?.(event, token);
}

function handlePointerDown(event: PointerEvent, token: TokenInfo) {
  props.onPointerDown?.(event, token);
}

function handlePointerMove(event: PointerEvent) {
  props.onPointerMove?.(event);
}

function handlePointerUp(event: PointerEvent) {
  props.onPointerUp?.(event);
}

function handleTokenClick(square: GridSquare, event: MouseEvent) {
  props.onTokenClick?.(square, event);
}
</script>

<template>
  <div class="token-layer" :style="layerStyle">
    <div
      v-for="entry in props.tokens"
      :key="entry.token._id"
      class="token"
      :class="{
        selected: entry.token._id === props.selectedTokenId,
        'active-turn-token': entry.token._id === props.currentTurnTokenId,
        'multi-footprint': getTokenSizeInSquares(entry.token.size) > 1,
      }"
      :style="buildTokenStyle(entry)"
      :draggable="!props.isMeasuring"
      @dragstart="handleDragStart($event, entry.token)"
      @pointerdown="handlePointerDown($event, entry.token)"
      @pointermove="handlePointerMove($event)"
      @pointerup="handlePointerUp($event)"
      @click.stop="handleTokenClick(entry.square, $event)"
    >
      <img v-if="entry.token.imageUrl" :src="entry.token.imageUrl" :alt="entry.token.name" class="token-image" />
      <div v-else class="token-fallback" :style="{ backgroundColor: entry.token.color }">
        <span>{{ entry.token.name.substring(0, 2) }}</span>
      </div>
      <span v-if="entry.token.characterId" class="token-character-indicator" title="Token vinculado a uma ficha">PC</span>
      <div v-if="auraLookup.get(entry.token._id)" class="token-aura-label">
        {{ auraLookup.get(entry.token._id)?.name }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.token-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 5;
}

.token {
  position: absolute;
  top: 0;
  left: 0;
  cursor: grab;
  border-radius: 50%;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 0.7em;
  color: #fff;
  font-weight: bold;
  text-shadow: 1px 1px 1px #000;
  overflow: visible;
  pointer-events: auto;
  touch-action: none;
}

.token-image,
.token-fallback {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  transition: box-shadow 0.2s ease, outline 0.2s ease;
}

.token.multi-footprint .token-image,
.token.multi-footprint .token-fallback {
  width: 110%;
  height: 110%;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.token-image { object-fit: cover; }
.token-fallback { display: flex; justify-content: center; align-items: center; font-size: 1.2em; }

.token.selected {
  outline: 2px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
}

.token.active-turn-token {
  box-shadow: 0 0 5px 5px var(--active-turn-glow, #69ff69);
  z-index: 6;
}

.token-character-indicator {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #ffe082;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 2px 4px;
  border-radius: 999px;
  letter-spacing: 0.05em;
  pointer-events: none;
  z-index: 3;
}

.token.multi-footprint.selected {
  outline: none;
  box-shadow: none;
}

.token.multi-footprint.selected .token-image,
.token.multi-footprint.selected .token-fallback {
  outline: 2px solid rgba(255, 255, 255, 0.55);
  box-shadow: 0 0 10px 3px rgba(255, 255, 255, 0.5);
}

.token.multi-footprint.active-turn-token .token-image,
.token.multi-footprint.active-turn-token .token-fallback {
  box-shadow: 0 0 6px 6px var(--active-turn-glow, #69ff69);
}

.token.multi-footprint.selected.active-turn-token .token-image,
.token.multi-footprint.selected.active-turn-token .token-fallback {
  box-shadow: 0 0 10px 6px var(--active-turn-glow, #69ff69), 0 0 14px rgba(255, 255, 255, 0.4);
  outline: 2px solid rgba(255, 255, 255, 0.6);
}

.token-aura-label {
  position: absolute;
  left: 50%;
  bottom: 4px;
  transform: translateX(-50%);
  color: #fff;
  font-weight: 700;
  font-size: 0.7em;
  line-height: 1.1;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}
</style>
