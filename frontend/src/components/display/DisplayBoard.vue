<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import GridLayer from '../GridLayer.vue';
import type { AuraInfo, GridSquare, TokenInfo } from '../../types';
import { auraElements, pingCenterPixels, tokenEntries, tokenStyle, type BoardPing } from '../play/boardGeometry';
import { characterResourceBadges } from '../character/summary';

const props = withDefaults(
  defineProps<{
    squares: GridSquare[];
    gridWidth: number;
    gridHeight: number;
    mapUrl?: string | null;
    tokens?: TokenInfo[];
    currentTurnTokenId?: string | null;
    metersPerSquare?: number;
    auras?: AuraInfo[];
    pings?: BoardPing[];
  }>(),
  {
    squares: () => [],
    gridWidth: 1,
    gridHeight: 1,
    mapUrl: null,
    tokens: () => [],
    currentTurnTokenId: null,
    metersPerSquare: 1.5,
    auras: () => [],
    pings: () => [],
  },
);

const containerRef = ref<HTMLDivElement | null>(null);
const containerSize = ref({ width: 0, height: 0 });
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const element = containerRef.value;
  if (!element || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (rect) containerSize.value = { width: rect.width, height: rect.height };
  });
  resizeObserver.observe(element);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

const boardSize = computed(() => {
  const cols = Math.max(1, props.gridWidth);
  const rows = Math.max(1, props.gridHeight);
  const availableWidth = containerSize.value.width;
  const availableHeight = containerSize.value.height;
  if (availableWidth <= 0 || availableHeight <= 0) {
    return { width: 0, height: 0, squareSize: 0 };
  }
  const cell = Math.min(availableWidth / cols, availableHeight / rows);
  const width = Math.floor(cell * cols);
  const height = Math.floor(cell * rows);
  return { width, height, squareSize: Math.min(width / cols, height / rows) };
});

const entries = computed(() => tokenEntries(props.tokens ?? [], props.gridWidth));

/** PD/PE/SAN/armadura ao lado de PV/CA no rótulo da TV (vazio em D&D). */
function resourceSuffix(token: TokenInfo): string {
  return characterResourceBadges(token.character)
    .map((resource) => `· ${resource.label} ${resource.value}`)
    .join(' ');
}

const auraList = computed(() =>
  auraElements(props.auras ?? [], entries.value, boardSize.value.squareSize, props.metersPerSquare),
);

const pingList = computed(() => {
  const size = boardSize.value.squareSize;
  if (!(size > 0)) return [];
  const result: Array<{ id: string; style: Record<string, string> }> = [];
  for (const ping of props.pings ?? []) {
    const center = pingCenterPixels(ping, props.gridWidth, props.gridHeight, size);
    if (!center) continue;
    result.push({
      id: ping.id,
      style: {
        left: `${center.x - size / 2}px`,
        top: `${center.y - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        '--ping-color': ping.color || 'var(--manila)',
      },
    });
  }
  return result;
});
</script>

<template>
  <div ref="containerRef" class="display-board" aria-label="Tabuleiro somente leitura">
    <div
      class="display-board__canvas"
      :style="{ width: `${boardSize.width}px`, height: `${boardSize.height}px` }"
      role="img"
      :aria-label="`Tabuleiro ${gridWidth} por ${gridHeight}, somente leitura`"
      @contextmenu.prevent
    >
      <img v-if="mapUrl" class="display-board__map" :src="mapUrl" alt="" draggable="false" />
      <div v-else class="display-board__placeholder">
        <p class="display-board__placeholder-title">Imagem da cena ainda não definida</p>
        <p class="display-board__placeholder-copy">
          O Mestre prepara o tabuleiro. Ele aparece aqui assim que a cena for ativada.
        </p>
      </div>

      <GridLayer
        v-if="boardSize.width > 0"
        class="display-board__grid"
        :squares="squares"
        :grid-width="gridWidth"
        :grid-height="gridHeight"
        :square-size="boardSize.squareSize"
        :pixel-width="boardSize.width"
        :pixel-height="boardSize.height"
        :is-measuring="false"
        :memo-key="gridWidth * 1000 + gridHeight"
      />

      <div
        v-for="aura in auraList"
        :key="aura.id"
        class="display-board__aura"
        :style="aura.style"
        aria-hidden="true"
      ></div>

      <div
        v-for="ping in pingList"
        :key="`ping-${ping.id}`"
        class="display-board__ping"
        :style="ping.style"
        aria-hidden="true"
      ></div>

      <div
        v-for="entry in entries"
        :key="entry.token._id"
        class="display-board__token"
        :class="{ 'is-current-turn': entry.token._id === currentTurnTokenId }"
        :style="tokenStyle(entry, boardSize.squareSize)"
        :title="entry.token.name"
      >
        <img
          v-if="entry.token.imageUrl"
          :src="entry.token.imageUrl"
          alt=""
          draggable="false"
        />
        <span v-else class="display-board__initial" aria-hidden="true">
          {{ entry.token.name.charAt(0).toUpperCase() }}
        </span>
        <span class="display-board__label">
          {{ entry.token.name }}<template
            v-if="
              entry.token.character &&
              (entry.token.character.maxHP != null || resourceSuffix(entry.token))
            "
          >
            <template v-if="entry.token.character.maxHP != null">
              · PV {{ entry.token.character.currentHP ?? 0 }}/{{ entry.token.character.maxHP }}
            </template>
            <template v-if="entry.token.character.defense != null">
              · CA {{ entry.token.character.defense }}
            </template>
            <template v-if="resourceSuffix(entry.token)">
              {{ resourceSuffix(entry.token) }}
            </template>
          </template>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.display-board {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  box-sizing: border-box;
}

.display-board__canvas {
  position: relative;
  flex: 0 0 auto;
  overflow: visible;
  border: 1px solid var(--line-strong);
  background: var(--ink-0);
}

.display-board__map {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.display-board__placeholder {
  position: absolute;
  top: clamp(16px, 3vh, 32px);
  left: 50%;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-2);
  width: min(560px, calc(100% - 48px));
  padding: var(--s-5) var(--s-6);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  box-shadow: var(--shadow-overlay);
  text-align: left;
  transform: translateX(-50%);
}

.display-board__placeholder-title {
  margin: 0;
  color: var(--text);
  font-family: var(--font-display);
  font-size: clamp(1.25rem, 0.6vw + 1rem, 1.625rem);
  font-weight: 600;
  line-height: 1.15;
}

.display-board__placeholder-copy {
  max-width: 52ch;
  margin: 0;
  color: var(--text-muted);
  font-size: clamp(0.9375rem, 0.3vw + 0.85rem, 1.125rem);
  line-height: 1.45;
}

.display-board__grid {
  position: absolute;
  inset: 0;
}

.display-board__grid :deep(.grid-viewport) {
  overflow: hidden;
}

.display-board__grid :deep(.grid-square) {
  cursor: default;
}

.display-board__aura {
  position: absolute;
  border-radius: 50%;
  border: 2px dashed;
  pointer-events: none;
  z-index: 2;
}

.display-board__ping {
  position: absolute;
  box-sizing: border-box;
  border: 3px solid var(--ping-color, #ffeb3b);
  border-radius: 50%;
  pointer-events: none;
  z-index: 5;
  animation: displayPingRipple 1.1s ease-out forwards;
}

@keyframes displayPingRipple {
  0% {
    transform: scale(0.35);
    opacity: 1;
  }
  100% {
    transform: scale(1.7);
    opacity: 0;
  }
}

.display-board__token {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  padding: 2px;
  border: 2px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  pointer-events: none;
  z-index: 4;
}

.display-board__token img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 1px;
}

.display-board__initial {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--text);
}

.display-board__label {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 4px);
  width: max-content;
  max-width: min(220px, 40vw);
  padding: 3px 8px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  font-family: var(--font-sans);
  font-size: clamp(1.125rem, 0.5vw + 0.75rem, 1.375rem);
  font-weight: 500;
  line-height: 1.15;
  text-align: center;
  color: var(--text);
  background: rgb(11 13 15 / 0.92);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transform: translateX(-50%);
}

.display-board__token.is-current-turn {
  border-color: var(--manila);
  box-shadow: inset 0 0 0 2px var(--manila);
}

@media (prefers-reduced-motion: reduce) {
  .display-board__token {
    transition: none;
  }

  .display-board__ping {
    animation: none;
    opacity: 0.85;
  }
}
</style>
