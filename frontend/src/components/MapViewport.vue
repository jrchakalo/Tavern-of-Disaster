<script setup lang="ts">
import { computed } from 'vue';
import type { ComponentPublicInstance } from 'vue';

import GridDisplay from './GridDisplay.vue';
import type { GridSquare, TokenInfo, PlayerInfo } from '../types';

type MeasurementPreview = {
  type: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance?: string;
  affectedSquares?: string[];
};

type SharedMeasurement = {
  userId: string;
  username: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance: string;
  color: string;
  type?: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
  affectedSquares?: string[];
};

type PersistentMeasurement = SharedMeasurement & { id: string; sceneId: string };

type AuraSummary = { tokenId: string; radiusMeters: number; color: string; name: string; sceneId: string };

type PingInfo = { id: string; userId: string; username: string; sceneId: string; squareId?: string; x?: number; y?: number; color?: string; ts: number };

interface MapViewportProps {
  isMeasuring: boolean;
  viewTransform: { scale: number; x: number; y: number };
  currentMapUrl?: string | null;
  activeSceneType?: 'battlemap' | 'image';
  gridWidth: number;
  gridHeight: number;
  metersPerSquare: number;
  rulerStartPoint?: { x: number; y: number } | null;
  rulerEndPoint?: { x: number; y: number } | null;
  rulerDistance: string;
  previewMeasurement?: MeasurementPreview | null;
  sharedMeasurements?: SharedMeasurement[];
  persistentMeasurements?: PersistentMeasurement[];
  auras?: AuraSummary[];
  userMeasurementColors?: Record<string, string>;
  coneAffectedSquares?: string[];
  measurementColor: string;
  currentTurnTokenId?: string | null;
  squares: GridSquare[];
  imageRenderedWidth?: number | null;
  imageRenderedHeight?: number | null;
  selectedTokenId?: string | null;
  isDm: boolean;
  currentUserId?: string | null;
  selectedPersistentId?: string | null;
  pings?: PingInfo[];
  showAssignMenu: boolean;
  assignMenuPosition: { x: number; y: number };
  assignMenuTargetToken?: TokenInfo | null;
  players?: PlayerInfo[];
  mapImageRefSetter?: (el: HTMLImageElement | null) => void;
  viewportRefSetter?: (el: HTMLDivElement | null) => void;
  gridDisplayRefSetter?: (instance: ComponentPublicInstance | null) => void;
  onWheel: (event: WheelEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onMiddleClick: (event: MouseEvent) => void;
  onSquareRightClick: (square: GridSquare, event: MouseEvent) => void;
  onSquareLeftClick: (square: GridSquare, event: MouseEvent) => void;
  onTokenMoveRequest: (payload: { tokenId: string; targetSquareId: string }) => void;
  onRemovePersistent: (payload: { id: string }) => void;
  onSelectPersistent: (payload: { id: string | null }) => void;
  onViewportContextmenu: () => void;
  onShapeContextmenu: (payload: { id: string }) => void;
  onImageLoad?: () => void;
  onAssignToken: (playerId: string) => void;
  onCloseAssignMenu: () => void;
  onOpenCharacterFromToken?: (characterId: string) => void;
}

const props = withDefaults(defineProps<MapViewportProps>(), {
  currentMapUrl: '',
  activeSceneType: 'battlemap',
  rulerStartPoint: null,
  rulerEndPoint: null,
  previewMeasurement: null,
  sharedMeasurements: () => [],
  persistentMeasurements: () => [],
  auras: () => [],
  userMeasurementColors: () => ({}),
  coneAffectedSquares: () => [],
  currentTurnTokenId: null,
  imageRenderedWidth: null,
  imageRenderedHeight: null,
  selectedTokenId: null,
  currentUserId: null,
  selectedPersistentId: null,
  pings: () => [],
  assignMenuTargetToken: null,
  players: () => [],
  onOpenCharacterFromToken: undefined
});

const hasBattlemap = computed(() => props.currentMapUrl && props.activeSceneType === 'battlemap');

function handleViewportRef(el: Element | ComponentPublicInstance | null) {
  props.viewportRefSetter?.(el as HTMLDivElement | null);
}

function handleMapImageRef(el: Element | ComponentPublicInstance | null) {
  props.mapImageRefSetter?.(el as HTMLImageElement | null);
}

function handleGridDisplayRef(instance: ComponentPublicInstance | null) {
  props.gridDisplayRefSetter?.(instance);
}
</script>

<template>
  <div
    class="viewport"
    :class="{ measuring: props.isMeasuring }"
    :ref="handleViewportRef"
    @wheel.prevent="props.onWheel"
    @pointerdown="props.onPointerDown"
    @pointermove="props.onPointerMove"
    @pointerup="props.onPointerUp"
    @mouseleave="props.onPointerUp"
  >
    <div
      class="map-stage"
      @mousedown.middle.prevent="props.onMiddleClick"
      :style="{ transform: `translate(${props.viewTransform.x}px, ${props.viewTransform.y}px) scale(${props.viewTransform.scale})` }"
    >
      <img
        v-if="props.currentMapUrl"
        :src="props.currentMapUrl"
        alt="Mapa de Batalha"
        class="map-image"
        draggable="false"
        @dragstart.prevent
        :ref="handleMapImageRef"
        @load="props.onImageLoad && props.onImageLoad()"
      />
      <div v-else class="map-placeholder">
        <p>Nenhum mapa definido para esta cena.</p>
        <p v-if="props.isDm">Use o Painel do Mestre para definir uma imagem.</p>
      </div>

      <GridDisplay
        v-if="hasBattlemap"
        :ref="handleGridDisplayRef"
        class="grid-overlay"
        :isMeasuring="props.isMeasuring"
        :viewScale="props.viewTransform.scale"
        :metersPerSquare="props.metersPerSquare"
        :measureStartPoint="props.rulerStartPoint"
        :measureEndPoint="props.rulerEndPoint"
        :measuredDistance="props.rulerDistance"
        :previewMeasurement="props.previewMeasurement"
        :sharedMeasurements="props.sharedMeasurements"
        :persistentMeasurements="props.persistentMeasurements"
        :auras="props.auras"
        :userColorMap="props.userMeasurementColors"
        :areaAffectedSquares="props.coneAffectedSquares"
        :measurementColor="props.measurementColor"
        :currentTurnTokenId="props.currentTurnTokenId"
        :squares="props.squares"
        :gridWidth="props.gridWidth"
        :gridHeight="props.gridHeight"
        :imageWidth="props.imageRenderedWidth || undefined"
        :imageHeight="props.imageRenderedHeight || undefined"
        :selectedTokenId="props.selectedTokenId"
        :isDM="props.isDm"
        :currentUserId="props.currentUserId"
        :selectedPersistentId="props.selectedPersistentId"
        :pings="props.pings"
        @square-right-click="props.onSquareRightClick"
        @square-left-click="props.onSquareLeftClick"
        @token-move-requested="props.onTokenMoveRequest"
        @remove-persistent="props.onRemovePersistent"
        @select-persistent="props.onSelectPersistent"
        @viewport-contextmenu="props.onViewportContextmenu"
        @shape-contextmenu="props.onShapeContextmenu"
      />
    </div>

    <div
      v-if="props.showAssignMenu"
      class="context-menu"
      :style="{ top: `${props.assignMenuPosition.y}px`, left: `${props.assignMenuPosition.x}px` }"
      @click.stop
      @contextmenu.prevent
      @pointerdown.stop
    >
      <h4 v-if="props.assignMenuTargetToken">Atribuir "{{ props.assignMenuTargetToken.name }}"</h4>
      <ul>
        <li
          v-if="props.assignMenuTargetToken?.characterId"
          class="context-action"
          @click="props.onOpenCharacterFromToken && props.onOpenCharacterFromToken(props.assignMenuTargetToken.characterId)"
        >
          Abrir ficha
        </li>
        <li v-if="props.assignMenuTargetToken?.characterId" class="divider" aria-hidden="true"></li>
        <li v-for="player in props.players" :key="player._id" @click="props.onAssignToken(player._id)">
          {{ player.username }}
        </li>
      </ul>
      <button @click="props.onCloseAssignMenu">Fechar</button>
    </div>
  </div>
</template>

<style scoped>
.viewport {
  width: 100%;
  height: calc(100dvh - 140px);
  max-width: 1600px;
  background: var(--color-surface);
  border: 10px solid rgba(0 0 0 / 0.5);
  border-radius: var(--radius-md);
  overflow: hidden;
  position: relative;
  cursor: grab;
  box-shadow: var(--elev-2);
  touch-action: none;
}
@media (max-width: 900px) {
  .viewport { height: calc(100lvh - 240px); border-width: 6px; }
}
.viewport:active { cursor: grabbing; }
.viewport.measuring { cursor: crosshair; }
.map-stage {
  width: 100%;
  height: 100%;
  position: relative;
  transition: transform 0.1s ease-out;
  overflow: hidden;
  transform-origin: center center;
}
.map-image,
.grid-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 100%;
  max-height: 100%;
  user-select: none;
}
.map-image {
  object-fit: contain;
  pointer-events: none;
  display: block;
}
.map-placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  max-width: 80%;
  pointer-events: none;
}
.context-menu {
  position: absolute;
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 5px 0;
  z-index: 1000;
  min-width: 150px;
  box-shadow: var(--elev-2);
}
.context-menu ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.context-menu li {
  padding: 8px 12px;
  cursor: pointer;
  color: var(--color-text);
  font-size: var(--text-sm);
}
.context-menu li.context-action {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.context-menu li:hover {
  background: var(--color-accent);
  color: var(--color-text);
}
.context-menu li.divider {
  border-top: 1px solid var(--color-border);
  margin: 4px 0;
  padding: 0;
  cursor: default;
  pointer-events: none;
}
.context-menu button {
  background: none;
  border: none;
  color: var(--color-text-muted);
  width: 100%;
  padding: 8px;
  margin-top: 5px;
  border-top: 1px solid var(--color-border);
  cursor: pointer;
  font: inherit;
}
.context-menu button:hover {
  color: var(--color-text);
  background: var(--color-surface);
}
</style>
