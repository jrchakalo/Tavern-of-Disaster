<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import {
  Application,
  Assets,
  Container,
  FederatedPointerEvent,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import type { AuraInfo, GridSquare, MeasurementDTO, PlayerInfo, TokenInfo } from '../types';

type MeasurementTool = 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';

type MeasurementPreview = {
  type: MeasurementTool;
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance?: string;
  affectedSquares?: string[];
} | null;

type SharedMeasurement = MeasurementDTO;

type PersistentMeasurement = SharedMeasurement & { id: string; sceneId: string };

type PingInfo = {
  id: string;
  userId: string;
  username: string;
  sceneId: string;
  squareId?: string;
  x?: number;
  y?: number;
  color?: string;
  ts: number;
};

interface MapViewportPixiProps {
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
  previewMeasurement?: MeasurementPreview;
  sharedMeasurements?: SharedMeasurement[];
  persistentMeasurements?: PersistentMeasurement[];
  auras?: AuraInfo[];
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

const props = withDefaults(defineProps<MapViewportPixiProps>(), {
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
  onOpenCharacterFromToken: undefined,
});

const hasBattlemap = computed(() => Boolean(props.currentMapUrl) && props.activeSceneType === 'battlemap');
const viewportRef = ref<HTMLDivElement | null>(null);
const mapStageRef = ref<HTMLDivElement | null>(null);
const pixiHostRef = ref<HTMLDivElement | null>(null);
const gridOverlayRef = ref<HTMLDivElement | null>(null);
const ghostImageRef = ref<HTMLImageElement | null>(null);
const overlayExpose = { $el: null as HTMLElement | null };

const pixiApp = shallowRef<Application | null>(null);
const layers = {
  background: new Container(),
  grid: new Graphics(),
  tokens: new Container(),
  tokenHighlights: new Container(),
  preview: new Graphics(),
  shared: new Container(),
  persistent: new Container(),
  auras: new Container(),
  pings: new Container(),
};

const mapSprite = shallowRef<Sprite | null>(null);
const tokenSpriteMap = new Map<string, Container>();
const tokenTextures = new Map<string, Texture>();
const draggingTokenId = ref<string | null>(null);
const draggingPointerId = ref<number | null>(null);
const dragStartSquare = ref<string | null>(null);

const gridMetrics = ref({ width: 512, height: 512, cols: 1, rows: 1, cellW: 64, cellH: 64 });
const viewportSize = ref({ width: 0, height: 0 });
const textureSize = ref<{ width: number; height: number } | null>(null);
const gridSquaresShallow = shallowRef(props.squares);
const computedGridSquares = computed(() => gridSquaresShallow.value || []);
const gridOverlayStyle = computed(() => ({
  width: `${gridMetrics.value.width}px`,
  height: `${gridMetrics.value.height}px`,
}));

let viewportResizeObserver: ResizeObserver | null = null;

watch(() => props.squares, (next) => { gridSquaresShallow.value = next; syncTokens(); }, { deep: false });
watch(() => props.currentMapUrl, () => loadBackgroundTexture());
watch(() => [props.gridWidth, props.gridHeight], () => updateGridMetrics());
watch(() => props.previewMeasurement, () => drawPreviewMeasurement(), { deep: true });
watch(() => props.sharedMeasurements, () => drawSharedMeasurements(), { deep: true });
watch(() => props.persistentMeasurements, () => drawPersistentMeasurements(), { deep: true });
watch(() => props.auras, () => drawAuras(), { deep: true });
watch(() => props.pings, () => drawPings(), { deep: true });
watch(() => props.selectedTokenId, () => highlightTokens());
watch(() => props.currentTurnTokenId, () => highlightTokens());

watch(() => pixiHostRef.value, () => {
  if (pixiHostRef.value && !pixiApp.value) {
    initPixi();
  }
});

watch(() => ghostImageRef.value, () => {
  props.mapImageRefSetter?.(ghostImageRef.value);
});

watch(() => gridOverlayRef.value, (el) => {
  overlayExpose.$el = el;
  props.gridDisplayRefSetter?.(el ? (overlayExpose as unknown as ComponentPublicInstance) : null);
});

watch(() => viewportRef.value, (el) => {
  props.viewportRefSetter?.(el ?? null);
});

watch(() => props.viewTransform, () => updateTransformStyles(), { deep: true, immediate: true });

onMounted(() => {
  nextTick(() => {
    setupResizeObserver();
    loadBackgroundTexture();
    syncTokens();
    drawGrid();
    drawPreviewMeasurement();
    drawSharedMeasurements();
    drawPersistentMeasurements();
    drawAuras();
    drawPings();
  });
});

onBeforeUnmount(() => {
  viewportResizeObserver?.disconnect();
  viewportResizeObserver = null;
  tokenTextures.forEach((texture) => texture.destroy(true));
  tokenTextures.clear();
  destroyPixi();
  props.viewportRefSetter?.(null);
  props.gridDisplayRefSetter?.(null);
  props.mapImageRefSetter?.(null);
});

function setupResizeObserver() {
  if (!mapStageRef.value) return;
  viewportResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      viewportSize.value = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
    }
    updateGridMetrics();
  });
  viewportResizeObserver.observe(mapStageRef.value);
}

async function initPixi() {
  if (!pixiHostRef.value || pixiApp.value) return;
  const app = new Application();
  await app.init({
    antialias: true,
    backgroundAlpha: 0,
    resolution: window.devicePixelRatio || 1,
    resizeTo: pixiHostRef.value,
  });
  pixiHostRef.value.appendChild(app.canvas);

  layers.background.sortableChildren = false;
  layers.tokens.sortableChildren = true;
  layers.tokenHighlights.sortableChildren = true;
  layers.preview.sortableChildren = false;
  layers.shared.sortableChildren = true;
  layers.persistent.sortableChildren = true;
  layers.auras.sortableChildren = true;
  layers.pings.sortableChildren = true;

  app.stage.addChild(layers.background);
  app.stage.addChild(layers.grid);
  app.stage.addChild(layers.auras);
  app.stage.addChild(layers.tokens);
  app.stage.addChild(layers.tokenHighlights);
  app.stage.addChild(layers.preview);
  app.stage.addChild(layers.shared);
  app.stage.addChild(layers.persistent);
  app.stage.addChild(layers.pings);

  pixiApp.value = app;
  updateGridMetrics();
}

function destroyPixi() {
  tokenSpriteMap.forEach((container) => container.destroy({ children: true }));
  tokenSpriteMap.clear();
  if (pixiApp.value) {
    pixiApp.value.destroy(true, { children: true, texture: true });
    pixiApp.value = null;
  }
}

function updateGridMetrics() {
  const cols = Math.max(1, props.gridWidth || 1);
  const rows = Math.max(1, props.gridHeight || 1);
  const tex = textureSize.value;
  const viewport = viewportSize.value;
  const availableWidth = viewport.width || pixiHostRef.value?.clientWidth || 800;
  const availableHeight = viewport.height || pixiHostRef.value?.clientHeight || 600;
  if (!tex) {
    gridMetrics.value = {
      width: availableWidth,
      height: availableHeight,
      cols,
      rows,
      cellW: availableWidth / cols,
      cellH: availableHeight / rows,
    };
    resizeRenderer();
    drawGrid();
    syncTokens();
    return;
  }

  let targetWidth = availableWidth;
  let targetHeight = (tex.height / tex.width) * targetWidth;
  if (targetHeight > availableHeight) {
    targetHeight = availableHeight;
    targetWidth = (tex.width / tex.height) * targetHeight;
  }

  gridMetrics.value = {
    width: targetWidth,
    height: targetHeight,
    cols,
    rows,
    cellW: targetWidth / cols,
    cellH: targetHeight / rows,
  };

  resizeRenderer();
  drawGrid();
  syncTokens();
  drawPreviewMeasurement();
  drawSharedMeasurements();
  drawPersistentMeasurements();
  drawAuras();
  drawPings();
}

function resizeRenderer() {
  if (!pixiApp.value) return;
  const { width, height } = gridMetrics.value;
  pixiApp.value.renderer.resize(width, height);
  if (pixiHostRef.value) {
    pixiHostRef.value.style.width = `${width}px`;
    pixiHostRef.value.style.height = `${height}px`;
  }
}

async function loadBackgroundTexture() {
  if (!pixiApp.value) return;
  layers.background.removeChildren();
  mapSprite.value = null;

  if (!props.currentMapUrl) {
    textureSize.value = null;
    updateGridMetrics();
    return;
  }

  try {
    const texture = await Assets.load(props.currentMapUrl);
    const sprite = new Sprite(texture as Texture);
    sprite.anchor.set(0);
    sprite.position.set(0, 0);
    sprite.width = gridMetrics.value.width;
    sprite.height = gridMetrics.value.height;
    layers.background.addChild(sprite);
    mapSprite.value = sprite;
    textureSize.value = { width: texture.width, height: texture.height };
    updateGridMetrics();
    props.onImageLoad?.();
  } catch (error) {
    console.warn('[pixi] falha ao carregar mapa', error);
    textureSize.value = null;
  }
}

function drawGrid() {
  const { cols, rows, cellW, cellH } = gridMetrics.value;
  const g = layers.grid;
  g.clear();
  g.lineStyle(1, 0xffffff, props.activeSceneType === 'battlemap' ? 0.3 : 0.1);
  for (let c = 0; c <= cols; c++) {
    const x = c * cellW;
    g.moveTo(x, 0);
    g.lineTo(x, rows * cellH);
  }
  for (let r = 0; r <= rows; r++) {
    const y = r * cellH;
    g.moveTo(0, y);
    g.lineTo(cols * cellW, y);
  }
}

function syncTokens() {
  if (!pixiApp.value || !hasBattlemap.value) {
    tokenSpriteMap.forEach((container) => container.destroy({ children: true }));
    tokenSpriteMap.clear();
    return;
  }

  const nextSquares = computedGridSquares.value;
  const width = Math.max(1, props.gridWidth || 1);
  const seen = new Set<string>();

  nextSquares.forEach((square) => {
    if (!square.token) return;
    const token = square.token;
    seen.add(token._id);
    const index = parseInt(square.id.replace('sq-', ''), 10);
    const col = Number.isNaN(index) ? 0 : index % width;
    const row = Number.isNaN(index) ? 0 : Math.floor(index / width);
    upsertTokenSprite({ square, token, col, row });
  });

  Array.from(tokenSpriteMap.keys()).forEach((tokenId) => {
    if (!seen.has(tokenId)) {
      const container = tokenSpriteMap.get(tokenId);
      container?.destroy({ children: true });
      tokenSpriteMap.delete(tokenId);
    }
  });

  highlightTokens();
}

function upsertTokenSprite(entry: { square: GridSquare; token: TokenInfo; col: number; row: number }) {
  const footprint = getTokenFootprint(entry.token.size);
  const width = gridMetrics.value.cellW * footprint;
  const height = gridMetrics.value.cellH * footprint;
  const x = entry.col * gridMetrics.value.cellW;
  const y = entry.row * gridMetrics.value.cellH;

  let container = tokenSpriteMap.get(entry.token._id);
  if (!container) {
    container = new Container();
    container.eventMode = 'dynamic';
    container.cursor = props.isMeasuring ? 'crosshair' : 'pointer';
    container.interactiveChildren = true;
    layers.tokens.addChild(container);
    tokenSpriteMap.set(entry.token._id, container);

    container.on('pointertap', (evt: FederatedPointerEvent) => handleTokenPointerTap(evt, entry.square));
    container.on('pointerdown', (evt: FederatedPointerEvent) => handleTokenPointerDown(evt, entry));
    container.on('pointerup', (evt: FederatedPointerEvent) => handleTokenPointerUp(evt, entry));
    container.on('pointerupoutside', (evt: FederatedPointerEvent) => handleTokenPointerUp(evt, entry));
    container.on('rightdown', (evt: FederatedPointerEvent) => handleTokenRightClick(evt, entry.square));
  }

  container.removeChildren();
  container.position.set(x, y);
  container.width = width;
  container.height = height;

  if (entry.token.imageUrl) {
    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    sprite.width = width;
    sprite.height = height;
    sprite.position.set(width / 2, height / 2);
    sprite.texture = getTokenTexture(entry.token.imageUrl);
    container.addChild(sprite);
  } else {
    const fallback = new Graphics();
    fallback.beginFill(parseInt(entry.token.color.replace('#', ''), 16), 0.95);
    fallback.drawCircle(width / 2, height / 2, Math.min(width, height) / 2);
    fallback.endFill();
    const label = new Text({
      text: entry.token.name.slice(0, 2).toUpperCase(),
      style: { fill: 0xffffff, fontWeight: 'bold', fontSize: Math.min(width, height) * 0.35 },
      anchor: 0.5,
      x: width / 2,
      y: height / 2,
    });
    container.addChild(fallback, label);
  }
}

function getTokenTexture(url: string): Texture {
  const cached = tokenTextures.get(url);
  if (cached) return cached;
  const texture = Texture.from(url);
  tokenTextures.set(url, texture);
  return texture;
}

function getTokenFootprint(size: TokenInfo['size']) {
  switch (size) {
    case 'Grande': return 2;
    case 'Enorme': return 3;
    case 'Descomunal': return 4;
    case 'Colossal': return 5;
    default: return 1;
  }
}

function handleTokenPointerTap(evt: FederatedPointerEvent, square: GridSquare) {
  evt.originalEvent?.stopPropagation();
  const mouseEvt = toMouseEvent(evt);
  if (evt.button === 2) {
    props.onSquareRightClick(square, mouseEvt);
    return;
  }
  props.onSquareLeftClick(square, mouseEvt);
}

function handleTokenRightClick(evt: FederatedPointerEvent, square: GridSquare) {
  evt.originalEvent?.preventDefault();
  evt.originalEvent?.stopPropagation();
  props.onSquareRightClick(square, toMouseEvent(evt));
}

function handleTokenPointerDown(evt: FederatedPointerEvent, entry: { square: GridSquare; token: TokenInfo; col: number; row: number }) {
  if (props.isMeasuring) return;
  if (evt.button !== 0) return;
  draggingTokenId.value = entry.token._id;
  draggingPointerId.value = evt.pointerId;
  dragStartSquare.value = entry.token.squareId;
  evt.originalEvent?.stopPropagation();
  evt.originalEvent?.preventDefault();
}

function handleTokenPointerUp(evt: FederatedPointerEvent, entry: { square: GridSquare; token: TokenInfo }) {
  if (draggingTokenId.value !== entry.token._id) return;
  if (draggingPointerId.value !== evt.pointerId) return;
  evt.originalEvent?.stopPropagation();
  evt.originalEvent?.preventDefault();
  const dropSquare = resolveSquareFromPointer(evt.global.x, evt.global.y);
  if (dropSquare && dragStartSquare.value && dropSquare.id !== dragStartSquare.value) {
    props.onTokenMoveRequest({ tokenId: entry.token._id, targetSquareId: dropSquare.id });
  }
  draggingTokenId.value = null;
  draggingPointerId.value = null;
  dragStartSquare.value = null;
  syncTokens();
}

function resolveSquareFromPointer(globalX: number, globalY: number): GridSquare | null {
  if (!pixiApp.value) return null;
  const rect = pixiApp.value.canvas.getBoundingClientRect();
  const localX = ((globalX - rect.left) / rect.width) * gridMetrics.value.width;
  const localY = ((globalY - rect.top) / rect.height) * gridMetrics.value.height;
  const col = Math.floor(localX / gridMetrics.value.cellW);
  const row = Math.floor(localY / gridMetrics.value.cellH);
  if (col < 0 || row < 0 || col >= gridMetrics.value.cols || row >= gridMetrics.value.rows) return null;
  const id = `sq-${row * gridMetrics.value.cols + col}`;
  return computedGridSquares.value.find((sq) => sq.id === id) || null;
}

function highlightTokens() {
  layers.tokenHighlights.removeChildren();
  tokenSpriteMap.forEach((container, tokenId) => {
    const footprint = Math.max(1, container.width / gridMetrics.value.cellW);
    if (props.selectedTokenId === tokenId || props.currentTurnTokenId === tokenId) {
      const glow = new Graphics();
      glow.lineStyle(4, props.selectedTokenId === tokenId ? 0xffffff : 0xffeb3b, 0.85);
      glow.drawRoundedRect(container.x, container.y, container.width, container.height, Math.min(container.width, container.height) * 0.2);
      layers.tokenHighlights.addChild(glow);
    }
    if (footprint > 1 && props.selectedTokenId === tokenId) {
      const outline = new Graphics();
      outline.lineStyle(2, 0xffffff, 0.8);
      outline.drawRect(container.x, container.y, container.width, container.height);
      layers.tokenHighlights.addChild(outline);
    }
  });
}

function drawPreviewMeasurement() {
  const preview = props.previewMeasurement;
  const g = layers.preview;
  g.clear();
  if (!preview) return;
  g.lineStyle(3, parseHexColor(props.measurementColor), 0.95);
  if (preview.type === 'ruler' || preview.type === 'line') {
    g.moveTo(preview.start.x, preview.start.y);
    g.lineTo(preview.end.x, preview.end.y);
  } else if (preview.type === 'circle') {
    const radius = Math.hypot(preview.end.x - preview.start.x, preview.end.y - preview.start.y);
    g.drawCircle(preview.start.x, preview.start.y, radius);
  } else if (preview.type === 'square') {
    const size = Math.hypot(preview.end.x - preview.start.x, preview.end.y - preview.start.y);
    g.drawRect(preview.start.x - size, preview.start.y - size, size * 2, size * 2);
  } else if (preview.type === 'cone') {
    const path = buildConePath(preview.start, preview.end);
    g.moveTo(preview.start.x, preview.start.y);
    path.forEach((point, index) => {
      if (index === 0) return;
      g.lineTo(point.x, point.y);
    });
    g.closePath();
  }
}

function buildConePath(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const base = Math.atan2(dy, dx);
  const spread = Math.PI / 4;
  const r = len;
  const points = [start];
  points.push({ x: start.x + r * Math.cos(base - spread), y: start.y + r * Math.sin(base - spread) });
  points.push({ x: start.x + r * Math.cos(base + spread), y: start.y + r * Math.sin(base + spread) });
  return points;
}

function drawSharedMeasurements() {
  layers.shared.removeChildren();
  (props.sharedMeasurements || []).forEach((measurement) => {
    const g = new Graphics();
    g.lineStyle(3, parseHexColor(measurement.color), 0.9);
    drawMeasurementGraphic(g, measurement);
    layers.shared.addChild(g);
  });
}

function drawPersistentMeasurements() {
  layers.persistent.removeChildren();
  (props.persistentMeasurements || []).forEach((measurement) => {
    const g = new Graphics();
    const color = measurement.color || '#ff8c00';
    g.lineStyle(props.selectedPersistentId === measurement.id ? 5 : 3, parseHexColor(color), 0.95);
    drawMeasurementGraphic(g, measurement);
    g.eventMode = 'static';
    g.cursor = 'pointer';
    g.on('pointertap', () => props.onSelectPersistent({ id: props.selectedPersistentId === measurement.id ? null : measurement.id }));
    g.on('rightdown', () => props.onShapeContextmenu({ id: measurement.id! }));
    layers.persistent.addChild(g);
  });
}

function drawMeasurementGraphic(g: Graphics, measurement: SharedMeasurement | PersistentMeasurement) {
  const start = toLocalPoint(measurement.start);
  const end = toLocalPoint(measurement.end);
  switch (measurement.type) {
    case 'circle': {
      const radius = Math.hypot(end.x - start.x, end.y - start.y);
      g.drawCircle(start.x, start.y, radius);
      break;
    }
    case 'square': {
      const size = Math.hypot(end.x - start.x, end.y - start.y);
      g.drawRect(start.x - size, start.y - size, size * 2, size * 2);
      break;
    }
    case 'cone': {
      const path = buildConePath(start, end);
      g.moveTo(start.x, start.y);
      path.forEach((point, index) => {
        if (index === 0) return;
        g.lineTo(point.x, point.y);
      });
      g.closePath();
      break;
    }
    default: {
      g.moveTo(start.x, start.y);
      g.lineTo(end.x, end.y);
      break;
    }
  }
}

function toLocalPoint(point: { x: number; y: number }): { x: number; y: number } {
  const cols = Math.max(1, props.gridWidth || 1);
  const rows = Math.max(1, props.gridHeight || 1);
  const withinGrid = point.x <= cols + 2 && point.y <= rows + 2;
  if (withinGrid) {
    return {
      x: point.x * gridMetrics.value.cellW,
      y: point.y * gridMetrics.value.cellH,
    };
  }
  return point;
}

function drawAuras() {
  layers.auras.removeChildren();
  (props.auras || []).forEach((aura) => {
    const square = computedGridSquares.value.find((sq) => sq.token && sq.token._id === aura.tokenId);
    if (!square || !square.token) return;
    const index = parseInt(square.id.replace('sq-', ''), 10);
    const col = Number.isNaN(index) ? 0 : index % gridMetrics.value.cols;
    const row = Number.isNaN(index) ? 0 : Math.floor(index / gridMetrics.value.cols);
    const footprint = getTokenFootprint(square.token.size);
    const centerX = (col + footprint / 2) * gridMetrics.value.cellW;
    const centerY = (row + footprint / 2) * gridMetrics.value.cellH;
    const squaresPerMeter = 1 / (props.metersPerSquare || 1.5);
    const radius = (aura.radiusMeters * squaresPerMeter + footprint / 2) * gridMetrics.value.cellW;
    const graphic = new Graphics();
    graphic.lineStyle(4, parseHexColor(aura.color || '#ff8c00'), 0.6);
    graphic.drawCircle(centerX, centerY, radius);
    layers.auras.addChild(graphic);
  });
}

function drawPings() {
  layers.pings.removeChildren();
  (props.pings || []).forEach((ping) => {
    const position = ping.squareId ? getSquareCenter(ping.squareId) : ping;
    if (!position) return;
    const circle = new Graphics();
    circle.lineStyle(4, parseHexColor(ping.color || '#ffeb3b'), 0.85);
    circle.drawCircle(position.x, position.y, gridMetrics.value.cellW * 0.75);
    layers.pings.addChild(circle);
  });
}

function getSquareCenter(squareId: string) {
  const idx = parseInt(squareId.replace('sq-', ''), 10);
  if (Number.isNaN(idx)) return null;
  const col = idx % gridMetrics.value.cols;
  const row = Math.floor(idx / gridMetrics.value.cols);
  return {
    x: col * gridMetrics.value.cellW + gridMetrics.value.cellW / 2,
    y: row * gridMetrics.value.cellH + gridMetrics.value.cellH / 2,
  };
}

function parseHexColor(color: string) {
  const normalized = color.startsWith('#') ? color.substring(1) : color;
  return parseInt(normalized, 16) || 0xffffff;
}

function toMouseEvent(evt: FederatedPointerEvent): MouseEvent {
  const native = evt.originalEvent;
  if (native instanceof MouseEvent) return native;
  return new MouseEvent('click', {
    clientX: evt.clientX,
    clientY: evt.clientY,
    button: evt.button,
    buttons: evt.buttons,
  });
}

function updateTransformStyles() {
  if (!mapStageRef.value) return;
  const { scale, x, y } = props.viewTransform;
  mapStageRef.value.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}
</script>

<template>
  <div
    class="viewport"
    :class="{ measuring: props.isMeasuring }"
    ref="viewportRef"
    @wheel.prevent="props.onWheel"
    @pointerdown="props.onPointerDown"
    @pointermove="props.onPointerMove"
    @pointerup="props.onPointerUp"
    @mouseleave="props.onPointerUp"
  >
    <div class="map-stage" ref="mapStageRef" @mousedown.middle.prevent="props.onMiddleClick">
      <div v-if="props.currentMapUrl" class="pixi-wrapper">
        <div class="pixi-layer" ref="pixiHostRef"></div>
        <div
          v-if="hasBattlemap"
          class="grid-overlay"
          :style="gridOverlayStyle"
          ref="gridOverlayRef"
          @contextmenu.prevent="props.onViewportContextmenu"
        ></div>
        <img
          v-if="props.currentMapUrl"
          ref="ghostImageRef"
          class="ghost-map-image"
          :src="props.currentMapUrl"
          alt="Mapa de referência"
          @load="props.onImageLoad && props.onImageLoad()"
        />
      </div>
      <div v-else class="map-placeholder">
        <p>Nenhum mapa definido para esta cena.</p>
        <p v-if="props.isDm">Use o Painel do Mestre para definir uma imagem.</p>
      </div>
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
  overflow: hidden;
  transform-origin: center center;
  transition: transform 0.12s ease-out;
}
.pixi-wrapper {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.pixi-layer {
  position: relative;
  width: 100%;
  height: 100%;
}
.grid-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.ghost-map-image {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
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
