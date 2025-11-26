<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';

import { storeToRefs } from 'pinia';
import { authToken, currentUser } from '../services/authService';
import { toast } from '../services/toast';
import { socketService } from '../services/socketService';
import { useTableStore } from '../stores/tableStore';
import { useCharacterStore } from '../stores/characterStore';

import MapViewport from '../components/MapViewport.vue';
import TokenCreationForm from '../components/TokenCreationForm.vue';
import TokenEditForm from '../components/TokenEditForm.vue';
import InitiativePanel from '../components/InitiativePanel.vue';
import Icon from '../components/Icon.vue';
import Toolbar from '../components/Toolbar.vue';
import AuraDialog from '../components/AuraDialog.vue';
import CharacterSheet from '../components/CharacterSheet.vue';
import ActionLog from '../components/ActionLog.vue';
import DiceRoller from '../components/DiceRoller.vue';
import DiceAnimation from '../components/DiceAnimation.vue';

import type { GridSquare, TokenInfo, IScene, IInitiativeEntry, TokenSize, Character, DiceRolledPayload } from '../types';

type MeasurementTool = 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
type ToolMode = MeasurementTool | 'select' | 'none';
type GridDisplayExpose = { $el: HTMLElement };
type MiddleClickHandler = ((event: MouseEvent) => void) & { lastTriggerTs?: number };
const isMeasurementTool = (tool: ToolMode): tool is MeasurementTool => tool !== 'select' && tool !== 'none';

const route = useRoute();
const tableId = Array.isArray(route.params.tableId) ? route.params.tableId[0] : route.params.tableId;
const showAssignMenu = ref(false);
const assignMenuPosition = ref({ x: 0, y: 0 });
const assignMenuTargetToken = ref<TokenInfo | null>(null);
const viewportRef = ref<HTMLDivElement | null>(null);
const viewTransform = ref({ scale: 1, x: 0, y: 0 });
const activePointers = ref<PointerEvent[]>([]);
const initialPinchDistance = ref(0);
const selectedTokenId = ref<string | null>(null);
const showTokenForm = ref(false);
const showTokenEditForm = ref(false);
const tokenBeingEdited = ref<TokenInfo | null>(null);
const targetSquareIdForToken = ref<string | null>(null);
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
// Auras dialog state
const showAuraDialog = ref(false);
const auraDialogTokenId = ref<string | null>(null);
const mapUrlInput = ref(''); // URL digitada para imagem de cena
const newSceneName = ref('');
const newSceneImageUrl = ref('');
const newSceneType = ref<'battlemap' | 'image'>('battlemap'); // Tipo da nova cena
const isDmPanelCollapsed = ref(false);
const gridDisplayRef = ref<GridDisplayExpose | null>(null);
const mapImgRef = ref<HTMLImageElement | null>(null);
const imageRenderedWidth = ref<number | null>(null);
const imageRenderedHeight = ref<number | null>(null);
// Escala (m por quadrado) controlada pelo Mestre
const squareFeet = computed(() => (metersPerSquare.value || 1.5) * 3.28084);
// Modo persistente: próxima medição vira persistente
const persistentMode = ref<boolean>(false);
// Subsections collapse state (DM panel)
const isSessionCollapsed = ref(false);
const isScenesCollapsed = ref(false);
const isGridCollapsed = ref(false);

function updateImageDimensions() {
  if (mapImgRef.value) {
    imageRenderedWidth.value = mapImgRef.value.clientWidth;
    imageRenderedHeight.value = mapImgRef.value.clientHeight;
  }
}

function setViewportEl(el: HTMLDivElement | null) {
  viewportRef.value = el;
}

function setMapImageEl(el: HTMLImageElement | null) {
  mapImgRef.value = el;
}

function setGridDisplayInstance(instance: GridDisplayExpose | null) {
  gridDisplayRef.value = instance;
}

function closeAssignMenu() {
  showAssignMenu.value = false;
}

const activeTool = ref<ToolMode>('none');
const rulerStartPoint = ref<{ x: number; y: number } | null>(null);
const rulerEndPoint = ref<{ x: number; y: number } | null>(null);
const rulerDistance = ref('0.0m');
const isMeasuring = computed(() => isMeasurementTool(activeTool.value));
const coneOriginSquareId = ref<string | null>(null); // Origem área
const coneAffectedSquares = ref<string[]>([]); // Quadrados afetados
const selectedPersistentId = ref<string | null>(null);
const previewMeasurement = ref<{
  type: MeasurementTool;
  start: { x: number; y: number; };
  end: { x: number; y: number; };
  distance?: string;
  affectedSquares?: string[];
} | null>(null);

// Mobile drag for player initiative wrapper removed per latest request

const tableStore = useTableStore();
const {
  //State
  currentTable, 
  scenes, 
  activeSceneId, 
  initiativeList, 
  squares, 
  gridWidth,
  gridHeight,
  sessionStatus,
  currentMapUrl,
  sharedMeasurements,
  metersPerSquare,
  persistentMeasurements,
  auras,
  pings,
  connectionStatus,
  pauseUntil,
  transitionAt,
  transitionMs,
  userMeasurementColors,
  clockSkewMs,
  logs,
  currentTurnTokenId,
  // Getters
  isDM, 
  activeScene, 
  tokensOnMap, 
  myActiveToken 
} = storeToRefs(tableStore);

const characterStore = useCharacterStore();
const { loadingByTable: characterLoadingMap, errorByTable: characterErrorMap, selectedCharacterId: selectedCharacterStoreId } = storeToRefs(characterStore);

const showCharacterSheet = ref(false);
const activeCharacterId = ref<string | null>(null);
const charactersForTable = computed(() => characterStore.charactersForTable(tableId));
const activeCharacter = computed<Character | null>(() => {
  if (!activeCharacterId.value) return null;
  return charactersForTable.value.find((char) => char._id === activeCharacterId.value) || null;
});
const isActiveCharacterOwner = computed(() => {
  if (!activeCharacter.value || !currentUser.value) return false;
  return activeCharacter.value.ownerId === currentUser.value.id;
});
const characterFetchScope = computed(() => (isDM.value ? 'dm' : 'player'));
const isCharacterListLoading = computed(() => Boolean(characterLoadingMap.value[tableId]));
const characterError = computed(() => characterErrorMap.value[tableId] ?? null);
const hasCharacters = computed(() => charactersForTable.value.length > 0);

const characterOwnerDirectory = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  const table = currentTable.value;
  if (!table) return map;
  map[table.dm._id] = table.dm.username;
  table.players.forEach((player) => {
    map[player._id] = player.username;
  });
  return map;
});

const sharedMeasurementList = computed(() => Object.values(sharedMeasurements.value));
const showActionLog = ref(false);
const logCount = computed(() => logs.value.length);
const showDicePopup = ref(false);
const diceAnimationPayload = ref<DiceRolledPayload | null>(null);
const diceAnimationVisible = ref(false);
const diceAnimationId = ref(0);
const DICE_ANIMATION_DURATION = 3600;

// Transição curta antes do LIVE
const showTransition = ref(false);
const transitionVideoRef = ref<HTMLVideoElement | null>(null);
// Quem pode interagir/visualizar o mapa (DM ou sessão ao vivo)
const canUseMap = computed(() => isDM.value || sessionStatus.value === 'LIVE');
// Pausa: Mestre define duração e jogadores veem contador
const pauseInput = ref<number>(5); // default 5min
const nowTs = ref<number>(Date.now());
const pauseRemaining = computed(() => {
  if (sessionStatus.value !== 'PAUSED' || !pauseUntil.value) return 0;
  const until = pauseUntil.value.getTime();
  // Corrige defasagem de relógio entre cliente e servidor
  const skew = clockSkewMs.value || 0;
  const clientNowCorrected = nowTs.value + skew;
  const ms = Math.max(0, until - clientNowCorrected);
  return Math.ceil(ms / 1000);
});

const connectionLabel = computed(() => {
  switch (connectionStatus.value) {
    case 'connecting':
      return 'Conectando…';
    case 'reconnecting':
      return 'Reconectando…';
    case 'disconnected':
      return 'Desconectado';
    case 'error':
      return 'Erro de conexão';
    default:
      return 'Conectado';
  }
});

const isConnectionDegraded = computed(() => ['reconnecting', 'disconnected', 'error'].includes(connectionStatus.value));
const dmRollerExpanded = ref(true);

let intervalId: number | null = null;
let diceAnimationTimer: number | null = null;
onMounted(() => {
  intervalId = window.setInterval(() => { nowTs.value = Date.now(); }, 500);
  tableStore.registerDiceAnimationHook(triggerDiceAnimation);
});
onUnmounted(() => {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  tableStore.registerDiceAnimationHook(null);
  dismissDiceAnimation();
});

// Observa evento de transição vindo do servidor para todos os clientes
watch(transitionAt, (at) => {
  if (!at) return;
  showTransition.value = true;
  // tenta iniciar reprodução
  setTimeout(() => { transitionVideoRef.value?.play?.(); }, 0);
  const duration = transitionMs.value || 3000;
  setTimeout(() => { showTransition.value = false; }, duration);
});

// Cor de medição
const measurementColor = ref<string>('');
const PLAYER_COLORS = ['#ff8c00', '#12c2e9', '#ff4d4d', '#43a047', '#ffd166', '#ff66cc', '#00bcd4', '#8bc34a', '#e91e63', '#9c27b0', '#795548', '#cddc39'];

function loadOrInitUserColor() {
  // Mestre é sempre roxo
  if (isDM.value) {
    measurementColor.value = '#3c096c';
    return;
  }
  const uid = currentUser?.value?.id;
  const sceneKey = activeSceneId.value || 'global';
  if (!uid) { measurementColor.value = '#ff8c00'; return; }
  const key = `tod:userColor:${uid}:${tableId}:${sceneKey}`;
  const saved = localStorage.getItem(key);
  if (saved && /^#?[0-9a-fA-F]{6}$/.test(saved)) {
    measurementColor.value = saved.startsWith('#') ? saved : `#${saved}`;
    return;
  }
  // Escolhe cor aleatória não-roxa
  const random = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)] || '#ff8c00';
  measurementColor.value = random;
  localStorage.setItem(key, random);
}

// Inicializa e atualiza quando papel/cena muda
watch([isDM, activeSceneId], () => {
  loadOrInitUserColor();
}, { immediate: true });

// Persiste quando jogador troca manualmente
watch(measurementColor, (c) => {
  if (isDM.value) return; // DM não persiste
  const uid = currentUser?.value?.id;
  const sceneKey = activeSceneId.value || 'global';
  if (!uid || !c) return;
  const key = `tod:userColor:${uid}:${tableId}:${sceneKey}`;
  localStorage.setItem(key, c);
});

async function fetchCharactersForTable() {
  if (!tableId) return;
  try {
    await characterStore.fetchForTable(tableId, { scope: characterFetchScope.value });
  } catch (error) {
    console.error('[characters] falha ao carregar', error);
    const message = error instanceof Error ? error.message : 'Não foi possível carregar as fichas.';
    toast.error(message);
  }
}

function refreshCharacters() {
  fetchCharactersForTable();
}

function openCharacterSheet(characterId: string) {
  activeCharacterId.value = characterId;
  showCharacterSheet.value = true;
  characterStore.setSelectedCharacter(characterId);
}

function closeCharacterSheet() {
  showCharacterSheet.value = false;
  activeCharacterId.value = null;
  characterStore.setSelectedCharacter(null);
}

async function handleQuickCreateCharacter() {
  if (!tableId) return;
  const baseName = 'Novo Personagem';
  const nextNumber = charactersForTable.value.length + 1;
  try {
    const created = await characterStore.createCharacter(tableId, { name: `${baseName} ${nextNumber}` });
    toast.success('Ficha criada.');
    openCharacterSheet(created._id);
  } catch (error) {
    console.error('[characters] erro ao criar', error);
    const message = error instanceof Error ? error.message : 'Não foi possível criar a ficha.';
    toast.error(message);
  }
}

async function handleCharacterSave(payload: Partial<Character>) {
  if (!tableId || !activeCharacterId.value) return;
  try {
    await characterStore.updateCharacter(tableId, activeCharacterId.value, payload);
    toast.success('Ficha atualizada.');
  } catch (error) {
    console.error('[characters] erro ao salvar', error);
    const message = error instanceof Error ? error.message : 'Não foi possível salvar a ficha.';
    toast.error(message);
  }
}

async function handleCharacterDelete() {
  if (!tableId || !activeCharacterId.value) return;
  const confirmed = window.confirm('Remover esta ficha? Esta ação não pode ser desfeita.');
  if (!confirmed) return;
  try {
    await characterStore.deleteCharacter(tableId, activeCharacterId.value);
    toast.success('Ficha removida.');
    closeCharacterSheet();
  } catch (error) {
    console.error('[characters] erro ao excluir', error);
    const message = error instanceof Error ? error.message : 'Não foi possível remover a ficha.';
    toast.error(message);
  }
}

function resolveCharacterOwnerName(ownerId?: string | null) {
  if (!ownerId) return 'Sem dono';
  const table = currentTable.value;
  if (table?.dm._id === ownerId) return `${table.dm.username} (Mestre)`;
  return characterOwnerDirectory.value[ownerId] || 'Jogador';
}

watch(characterFetchScope, () => {
  fetchCharactersForTable();
}, { immediate: true });

watch(charactersForTable, (list) => {
  if (activeCharacterId.value && !list.some((char) => char._id === activeCharacterId.value)) {
    closeCharacterSheet();
  }
});

watch(selectedCharacterStoreId, (newId) => {
  if (newId === activeCharacterId.value) {
    showCharacterSheet.value = Boolean(newId);
    return;
  }
  activeCharacterId.value = newId;
  showCharacterSheet.value = Boolean(newId);
});

// Medições persistentes da cena ativa
const persistentsForActiveScene = computed(() =>
  persistentMeasurements.value.filter(pm => pm.sceneId === activeSceneId.value)
);

function handleSetActiveScene(sceneId: string) {
  socketService.setActiveScene(tableId, sceneId);
}

function handleUpdateSessionStatus(newStatus: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED') {
  const options: { pauseSeconds?: number } = {};
  if (newStatus === 'PAUSED') options.pauseSeconds = Math.max(0, Math.floor((pauseInput.value * 60) || 0));
  socketService.updateSessionStatus(tableId, newStatus, options);
}

async function startSessionWithTransition() {
  // dispara transição para todos por ~3s e muda status para LIVE após isso
  socketService.startTransition(tableId, 3000);
  showTransition.value = true;
  // tenta tocar o vídeo local também
  setTimeout(() => { transitionVideoRef.value?.play?.(); }, 0);
  await new Promise(res => setTimeout(res, 3000));
  showTransition.value = false;
  handleUpdateSessionStatus('LIVE');
}

// Toggle vindo da Toolbar para fixar medições
function handleTogglePersistent(on: boolean) { persistentMode.value = on; }

function handleColorSelected(color: string) {
  measurementColor.value = color;
}

function toggleActionLog() {
  showActionLog.value = !showActionLog.value;
}

function toggleDicePopup() {
  showDicePopup.value = !showDicePopup.value;
}

function dismissDiceAnimation(options: { clearPayload?: boolean } = {}) {
  if (diceAnimationTimer) {
    window.clearTimeout(diceAnimationTimer);
    diceAnimationTimer = null;
  }
  diceAnimationVisible.value = false;
  if (options.clearPayload !== false) {
    diceAnimationPayload.value = null;
  }
}

function triggerDiceAnimation(payload: DiceRolledPayload) {
  dismissDiceAnimation({ clearPayload: false });
  diceAnimationPayload.value = payload;
  diceAnimationId.value += 1;
  requestAnimationFrame(() => {
    diceAnimationVisible.value = true;
  });
  diceAnimationTimer = window.setTimeout(() => {
    dismissDiceAnimation();
  }, DICE_ANIMATION_DURATION);
}

function toggleDmRoller() {
  dmRollerExpanded.value = !dmRollerExpanded.value;
}

function setMap() {
  if (mapUrlInput.value.trim() !== '') {
    socketService.setMap(tableId, mapUrlInput.value);
  }
}

function onSceneDragEnd() {
  const orderedSceneIds = scenes.value.map(scene => scene._id);
  socketService.reorderScenes(tableId, orderedSceneIds);
}

function onSceneReorder(updatedScenes: IScene[]) {
  scenes.value = [...updatedScenes];
  onSceneDragEnd();
}

function createToken(payload: { name: string; imageUrl: string; movement: number; ownerId: string; size: TokenSize; canOverlap?: boolean; characterId?: string | null }) {
  if (targetSquareIdForToken.value && activeSceneId.value) {
  // Validação footprint local
    const sizeMap: Record<string, number> = { 'Pequeno/Médio':1,'Grande':2,'Enorme':3,'Descomunal':4,'Colossal':5 };
    const footprint = sizeMap[payload.size] || 1;
    if (footprint > 1) {
      const anchorIdx = parseInt(targetSquareIdForToken.value.replace('sq-',''));
      const anchorX = anchorIdx % gridWidth.value; const anchorY = Math.floor(anchorIdx / gridWidth.value);
      let fits = true; let free = true;
      for (let dy=0; dy<footprint && fits && free; dy++) {
        for (let dx=0; dx<footprint; dx++) {
          const nx = anchorX + dx; const ny = anchorY + dy;
          if (nx >= gridWidth.value || ny >= gridHeight.value) { fits = false; break; }
          const idx = ny * gridWidth.value + nx;
          const sq = squares.value.find(s=>s.id === `sq-${idx}`);
            if (sq && sq.token) { free = false; break; }
        }
      }
  if (!fits) { toast.warning('Token não cabe no grid nesse posicionamento.'); return; }
  if (!free) { toast.warning('Espaço ocupado por outro token.'); return; }
    }
    socketService.placeToken({ tableId, sceneId: activeSceneId.value, squareId: targetSquareIdForToken.value, ...payload });
  }
  // Fecha o formulário
  showTokenForm.value = false;
  targetSquareIdForToken.value = null;
}

function handleTokenMoveRequest(payload: { tokenId: string; targetSquareId: string }) {
  socketService.moveToken({ tableId, ...payload });
}

function handleAssignToken(newOwnerId: string) {
  if (assignMenuTargetToken.value) {
    socketService.assignToken({
      tableId,
      tokenId: assignMenuTargetToken.value._id,
      newOwnerId
    });
  }
  showAssignMenu.value = false;
}

function handleOpenCharacterFromToken(characterId?: string | null) {
  if (!characterId) return;
  openCharacterSheet(characterId);
}

function handleSelectPersistent(payload: { id: string | null }) {
  selectedPersistentId.value = payload.id;
}

function handleDeleteSelectedPersistent() {
  if (!activeSceneId.value || !selectedPersistentId.value) return;
  socketService.removePersistentMeasurement({ tableId, sceneId: activeSceneId.value, id: selectedPersistentId.value });
  selectedPersistentId.value = null;
}

function handleClearAllMeasurements() {
  if (!isDM.value || !activeSceneId.value) return;
  socketService.clearAllMeasurements(tableId, activeSceneId.value);
}

// Remoção de medição persistente (Mestre ou autor)
function handleRemovePersistent(payload: { id: string }) {
  if (!activeSceneId.value) return;
  socketService.removePersistentMeasurement({ tableId, sceneId: activeSceneId.value, id: payload.id });
}

function handleUndoMove() {
  if (currentTurnTokenId.value) {
    socketService.undoMove(tableId, currentTurnTokenId.value);
  }
}

function handleNextTurn() {
  if (activeSceneId.value) {
  // Avançar turno: limpa medições e ferramentas
  handleToolSelected('none');
  selectedPersistentId.value = null;
    socketService.nextTurn(tableId, activeSceneId.value);
  }
}

function handleRemoveFromInitiative(initiativeEntryId: string) {
  // Evita confirm() bloqueante; fluxo segue direto e feedback vem via toast do socket
  if (activeSceneId.value) {
    socketService.removeFromInitiative({
      tableId,
      sceneId: activeSceneId.value,
      initiativeEntryId
    });
  }
}


function handleSaveTokenEdit(payload: { name?: string; movement?: number; imageUrl?: string; ownerId?: string; size?: TokenSize; resetRemainingMovement?: boolean; canOverlap?: boolean; characterId?: string | null }) {
  if (!tokenBeingEdited.value) return;
  socketService.editToken({ tableId, tokenId: tokenBeingEdited.value._id, ...payload });
  showTokenEditForm.value = false;
  tokenBeingEdited.value = null;
}

function onInitiativeDragEnd() {
  if (activeSceneId.value) {
    socketService.reorderInitiative({
      tableId,
      sceneId: activeSceneId.value,
      newOrder: initiativeList.value
    });
  }
}

function handleInitiativeReorder(newOrder: IInitiativeEntry[]) {
  initiativeList.value = [...newOrder];
  onInitiativeDragEnd();
}

function handleLeftClickOnSquare(square: GridSquare) {
  if (activeTool.value === 'ruler' || activeTool.value === 'cone') return;
  if (square.token) {
    selectedTokenId.value = (selectedTokenId.value === square.token._id) ? null : square.token._id;
  } else {
    selectedTokenId.value = null;
  }
}


const handleMiddleClickFree: MiddleClickHandler = (event) => {
  if (event.button !== 1 || !activeSceneId.value) return;
  // Rate limit ping
  if (handleMiddleClickFree.lastTriggerTs && Date.now() - handleMiddleClickFree.lastTriggerTs < 300) return;
  handleMiddleClickFree.lastTriggerTs = Date.now();
  // Coordenadas relativas ao grid interno
  const mapStage = event.currentTarget as HTMLElement;
  let viewportEl: HTMLElement | null = mapStage.querySelector('.grid-overlay .grid-viewport');
  if (!viewportEl) viewportEl = mapStage.querySelector('.grid-overlay') as HTMLElement | null;
  const rect = (viewportEl || mapStage).getBoundingClientRect();
  const scale = viewTransform.value.scale || 1;
  const x = (event.clientX - rect.left) / scale;
  const y = (event.clientY - rect.top) / scale;
  socketService.sendPing({ tableId, sceneId: activeSceneId.value, x, y, color: measurementColor.value || (isDM.value ? '#3c096c' : '#ff8c00') });
};

// Mestre altera escala; jogadores recebem
watch(metersPerSquare, (val, oldVal) => {
  if (!isDM.value) return; // somente Mestre emite
  if (val <= 0) { metersPerSquare.value = oldVal; return; }
  if (activeSceneId.value && val !== oldVal) {
    socketService.updateSceneScale(tableId, activeSceneId.value, val);
  }
});

function handleRightClick(square: GridSquare, event: MouseEvent) {
  event.preventDefault();

  // Ferramenta ativa: clique direito cancela
  if (isMeasuring.value) {
  // PIN ligado: cancela ferramenta + pin
    if (persistentMode.value) {
      persistentMode.value = false;
      handleToolSelected('none');
    } else {
      if (activeSceneId.value && sharedMeasurements.value[currentUser?.value?.id || '']) {
        socketService.removeMyMeasurement({ tableId, sceneId: activeSceneId.value });
      } else {
        activeTool.value = 'none';
      }
      previewMeasurement.value = null;
      rulerStartPoint.value = null;
      coneOriginSquareId.value = null;
      coneAffectedSquares.value = [];
    }
    return;
  }

  // Se nenhuma ferramenta estiver ativa, executa a lógica original de menus do Mestre.
  if (isDM.value && square.token) { // Se for o Mestre e clicar num token existente
    event.preventDefault(); 
    showTokenForm.value = false;

    if (!viewportRef.value) return;

    const viewportRect = viewportRef.value.getBoundingClientRect();

    const mouseX = event.clientX - viewportRect.left;
    const mouseY = event.clientY - viewportRect.top;

    assignMenuPosition.value = { x: mouseX, y: mouseY };
    assignMenuTargetToken.value = square.token;
    showAssignMenu.value = true;
  } else if (isDM.value && !square.token) { // Se o quadrado estiver vazio
    targetSquareIdForToken.value = square.id;
    showTokenForm.value = true;
  }
}

// Captura clique direito em qualquer área do viewport (não apenas nas células do grid)
function handleViewportContextMenu() {
  // Se estiver medindo e o PIN estiver ligado, desliga ambos (pin e ferramenta)
  if (isMeasuring.value && persistentMode.value) {
    persistentMode.value = false;
    handleToolSelected('none');
    return;
  }
  // Se estiver medindo sem PIN, apenas cancela a medição atual
  if (isMeasuring.value) {
    if (activeSceneId.value && sharedMeasurements.value[currentUser?.value?.id || '']) {
      socketService.removeMyMeasurement({ tableId, sceneId: activeSceneId.value });
    } else {
      activeTool.value = 'none';
    }
    previewMeasurement.value = null;
    rulerStartPoint.value = null;
    coneOriginSquareId.value = null;
    coneAffectedSquares.value = [];
  }
}

function handleShapeContextMenu(payload: { id: string }) {
  // Seleciona a figura e, se Mestre, remove-a
  selectedPersistentId.value = payload.id || null;
  if (isDM.value && activeSceneId.value) {
    socketService.removePersistentMeasurement({ tableId, sceneId: activeSceneId.value, id: payload.id });
  }
}

// Auras
const selectedToken = computed(() => tokensOnMap.value.find(t => t._id === selectedTokenId.value) || null);
const auraForSelected = computed(() => selectedTokenId.value ? auras.value.find(a => a.tokenId === selectedTokenId.value) || null : null);
const canRemoveAura = computed(() => Boolean(isDM.value && selectedToken.value && auraForSelected.value));
// Editar aura: DM sempre; jogador só no seu turno
const canAddAura = computed(() => Boolean((isDM.value || myActiveToken.value) && selectedTokenId.value && !isMeasuring.value));

function handleAuraSave(payload: { name: string; color: string; radiusMeters: number }) {
  if (!auraDialogTokenId.value || !activeSceneId.value) return;
  socketService.upsertAura({
    tableId,
    sceneId: activeSceneId.value,
    tokenId: auraDialogTokenId.value,
    name: payload.name,
    color: payload.color,
    radiusMeters: payload.radiusMeters,
  });
  // A cor da aura passa a ser a última aplicada
  measurementColor.value = payload.color;
  showAuraDialog.value = false;
  auraDialogTokenId.value = null;
}

function handleAuraRemove() {
  if (!auraDialogTokenId.value || !activeSceneId.value) return;
  socketService.removeAura({ tableId, sceneId: activeSceneId.value, tokenId: auraDialogTokenId.value });
  showAuraDialog.value = false;
  auraDialogTokenId.value = null;
}

function handleToolbarRemoveAura() {
  if (!selectedTokenId.value || !activeSceneId.value) return;
  socketService.removeAura({ tableId, sceneId: activeSceneId.value, tokenId: selectedTokenId.value });
}

function handleToolbarEditAura() {
  if (!selectedTokenId.value) return;
  auraDialogTokenId.value = selectedTokenId.value;
  showAuraDialog.value = true;
}

async function handleCreateScene() {
  if (!newSceneName.value.trim() || !tableId) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/tables/${tableId}/scenes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken.value}`,
      },
      body: JSON.stringify({ 
        name: newSceneName.value,
        imageUrl: newSceneImageUrl.value,
        gridSize: 30, // Tamanho padrão do grid
        type: newSceneType.value, // Envia o tipo da cena
      }),
    });

    const newScene = await response.json();
    if (response.ok) {
      scenes.value.push(newScene); // Adiciona a nova cena à lista local
      newSceneName.value = '';
      newSceneImageUrl.value = '';
    } else {
      toast.error(newScene.message || 'Erro ao criar cena.');
    }
  } catch (error) { console.error("Erro ao criar cena", error); }
}

function handleEditScene(scene: IScene) {
  // Abre um prompt simples do navegador para pegar os novos valores
  const newName = prompt("Digite o novo nome para a cena:", scene.name);

  if (newName === null) return; // Usuário cancelou

  // Chama a nova API PUT para editar
  fetch(`${API_BASE_URL}/api/tables/${tableId}/scenes/${scene._id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken.value}`,
    },
    body: JSON.stringify({ name: newName }),
  })
  .then(res => res.json())
  .then(updatedScene => {
    if (updatedScene._id) {
      // Atualiza a cena na lista local para refletir a mudança imediatamente
      const index = scenes.value.findIndex(s => s._id === updatedScene._id);
      if (index !== -1) {
        scenes.value[index] = updatedScene;
      }
    } else {
      toast.error(updatedScene.message || 'Erro ao editar cena.');
    }
  })
  .catch(err => console.error("Erro ao editar cena:", err));
}

async function handleDeleteScene(sceneId: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/tables/${tableId}/scenes/${sceneId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken.value}`,
      },
    });

    const data = await response.json();
    if (response.ok) {
      // Remove a cena da lista local para refletir a mudança imediatamente
      const wasActive = activeSceneId.value === sceneId;
      scenes.value = scenes.value.filter(s => s._id !== sceneId);
      if (wasActive) {
        const first = scenes.value[0];
        if (first) {
          // Atualiza ativa localmente e avisa o servidor para manter sincronizado
          handleSetActiveScene(first._id);
        } else {
          // Sem cenas restantes
          // Zera mapa e ativos locais
          currentMapUrl.value = null;
        }
      }
      toast.success(data.message || 'Cena excluída.');
    } else {
      toast.error(data.message || 'Erro ao excluir cena.');
    }
  } catch (error) { console.error("Erro ao excluir cena:", error); }
}

// Função para quando um ponteiro (dedo/mouse) toca a tela
function handlePointerDown(event: PointerEvent) {
  // Ignora se o clique não for o botão esquerdo do mouse (ou um toque)
  if (event.button !== 0) return;

  if (isMeasuring.value) {
    // Se uma ferramenta está ativa, o pointerDown INICIA a pré-visualização.
  if (activeTool.value === 'ruler') {
      if (!gridDisplayRef.value) return;
      const gridRect = gridDisplayRef.value.$el.getBoundingClientRect();
      const scale = viewTransform.value.scale || 1;
      const local = {
        x: (event.clientX - gridRect.left) / scale,
        y: (event.clientY - gridRect.top) / scale
      };
      previewMeasurement.value = {
        type: 'ruler',
        start: local,
        end: local,
  distance: '0.0m (0ft)'
      };
  } else if (activeTool.value === 'cone' || activeTool.value === 'circle' || activeTool.value === 'square' || activeTool.value === 'line' || activeTool.value === 'beam') {
      if (!gridDisplayRef.value) return;
      const gridRect = gridDisplayRef.value.$el.getBoundingClientRect();
      const scale = viewTransform.value.scale || 1;
      const local = {
        x: (event.clientX - gridRect.left) / scale,
        y: (event.clientY - gridRect.top) / scale
      };
      // Determina o quadrado de origem baseado na posição local e usa o CENTRO dessa célula como ápice
        const originSquare = getSquareIdFromLocalPoint(local.x, local.y);
        coneOriginSquareId.value = originSquare;
        const originCenter = originSquare ? getSquareCenterLocalPointFromId(originSquare) : local;
        const measurementType = activeTool.value as MeasurementTool;
        previewMeasurement.value = { type: measurementType, start: originCenter, end: originCenter };
      // Inicializa sem afetar nada (comprimento 0)
      coneAffectedSquares.value = [];
    }
    // (Futuramente: else if (activeTool.value === 'cone') { ... })

    // Captura o ponteiro para que o 'pointerup' funcione mesmo se o mouse sair da área
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    return;
  }

  // Lógica de pan: desabilita pan quando ferramenta SELECT está ativa
  if (activeTool.value === 'select') return;
  // Lógica original de pan
  if ((event.target as HTMLElement).closest('button, .token')) return;
  activePointers.value.push(event);
  viewportRef.value?.setPointerCapture(event.pointerId);
}

// Função para quando um ponteiro se move
function handlePointerMove(event: PointerEvent) {
  // Se a régua estiver ativa e um ponto inicial tiver sido definido, atualiza a linha.
  if (previewMeasurement.value) {
    if (!gridDisplayRef.value) return;
    const gridRect = gridDisplayRef.value.$el.getBoundingClientRect();
    const scale = viewTransform.value.scale || 1;
    const currentPos = {
      x: (event.clientX - gridRect.left) / scale,
      y: (event.clientY - gridRect.top) / scale
    };
    previewMeasurement.value.end = currentPos;
  if (previewMeasurement.value.type === 'ruler') {
      const dx = currentPos.x - previewMeasurement.value.start.x;
      const dy = currentPos.y - previewMeasurement.value.start.y;
      const pixelDistance = Math.sqrt(dx * dx + dy * dy);
      const unscaledGridWidth = gridRect.width / scale;
      const worldSquareSize = unscaledGridWidth / (gridWidth.value || 1);
      const distanceInSquares = pixelDistance / worldSquareSize;
      const meters = distanceInSquares * (metersPerSquare.value || 1.5);
      const feet = meters * 3.28084;
      previewMeasurement.value.distance = `${meters.toFixed(1)}m (${Math.round(feet)}ft)`;
  } else if (previewMeasurement.value.type === 'cone') {
  // Cone: distância quantizada 0,5m
      if (!coneOriginSquareId.value) return;
      const originCenter = getSquareCenterLocalPointFromId(coneOriginSquareId.value);
      if (!originCenter) return;
      const unscaledGridWidth = gridRect.width / scale;
      const worldSquareSize = unscaledGridWidth / (gridWidth.value || 1);

      // Distância exibida (contínua) a partir do mouse
      const dxMouse = currentPos.x - originCenter.x;
      const dyMouse = currentPos.y - originCenter.y;
      const distSquaresDisplay = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse) / worldSquareSize;
      const mPerSq = metersPerSquare.value || 1.5;
      const metersDisplay = quantizeMeters(distSquaresDisplay * mPerSq, 0.5);
      previewMeasurement.value.distance = formatDistance(metersDisplay);

      // Apontamento por centro da célula alvo para direção e células afetadas
      const targetSquareId = getSquareIdFromLocalPoint(currentPos.x, currentPos.y);
      if (targetSquareId) {
        const targetCenter = getSquareCenterLocalPointFromId(targetSquareId) || currentPos;
        const dx = targetCenter.x - originCenter.x;
        const dy = targetCenter.y - originCenter.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len;
        const uy = dy / len;

        // Seleção de células baseada no alcance quantizado
        coneAffectedSquares.value = calculateConeArea(coneOriginSquareId.value, targetSquareId, metersDisplay);

        // Posiciona a etiqueta num comprimento coerente com a última faixa pintada
        const lengthInSquares = Math.max(0, Math.floor(metersDisplay / mPerSq));
        const clampSquares = lengthInSquares + 1.0;
        const clampedLenPx = clampSquares * worldSquareSize;
        previewMeasurement.value.start = originCenter;
        previewMeasurement.value.end = {
          x: originCenter.x + ux * clampedLenPx,
          y: originCenter.y + uy * clampedLenPx
        };
      }
    } else if (previewMeasurement.value.type === 'circle') {
  // Círculo
      if (!coneOriginSquareId.value) return;
      const originCenter = getSquareCenterLocalPointFromId(coneOriginSquareId.value);
      if (!originCenter) return;
      const unscaledGridWidth = gridRect.width / scale;
      const worldSquareSize = unscaledGridWidth / (gridWidth.value || 1);

      const dx = currentPos.x - originCenter.x;
      const dy = currentPos.y - originCenter.y;
      const distSquares = Math.sqrt(dx * dx + dy * dy) / worldSquareSize;
      const mPerSq = metersPerSquare.value || 1.5;
      const metersDisplay = distSquares * mPerSq;
      previewMeasurement.value.distance = formatDistance(metersDisplay);

      coneAffectedSquares.value = calculateCircleArea(coneOriginSquareId.value, metersDisplay);
      // Posição da etiqueta um pouco além do raio
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len, uy = dy / len;
      const clampedLenPx = distSquares * worldSquareSize;
      previewMeasurement.value.start = originCenter;
      previewMeasurement.value.end = { x: originCenter.x + ux * clampedLenPx, y: originCenter.y + uy * clampedLenPx };
  } else if (previewMeasurement.value.type === 'square') {
  // Quadrado centrado na origem
      if (!coneOriginSquareId.value) return;
      const originCenter = getSquareCenterLocalPointFromId(coneOriginSquareId.value);
      if (!originCenter) return;
      const unscaledGridWidth = gridRect.width / scale;
      const worldSquareSize = unscaledGridWidth / (gridWidth.value || 1);

      const dx = currentPos.x - originCenter.x;
      const dy = currentPos.y - originCenter.y;
      const distSquares = Math.sqrt(dx * dx + dy * dy) / worldSquareSize;
      const mPerSq = metersPerSquare.value || 1.5;
      const sideMeters = Math.max(0, distSquares * mPerSq * 2); // arrasto da borda até centro ≈ metade do lado
      previewMeasurement.value.distance = formatDistance(sideMeters);

      coneAffectedSquares.value = calculateSquareArea(coneOriginSquareId.value, sideMeters);
  // Apenas rótulo; contorno é desenhado pelo GridDisplay como quadrado centrado na origem
  previewMeasurement.value.start = originCenter;
  previewMeasurement.value.end = currentPos;
    } else if (previewMeasurement.value.type === 'line') {
      const dx = currentPos.x - previewMeasurement.value.start.x;
      const dy = currentPos.y - previewMeasurement.value.start.y;
      const pixelDistance = Math.sqrt(dx * dx + dy * dy);
      const unscaledGridWidth = gridRect.width / scale;
      const worldSquareSize = unscaledGridWidth / (gridWidth.value || 1);
      const distanceInSquares = pixelDistance / worldSquareSize;
      const meters = distanceInSquares * (metersPerSquare.value || 1.5);
      previewMeasurement.value.distance = formatDistance(meters);
      const originId = coneOriginSquareId.value;
      const targetId = getSquareIdFromLocalPoint(currentPos.x, currentPos.y);
      if (originId && targetId) {
        coneAffectedSquares.value = calculateLineSquares(originId, targetId);
      }
  } else if (previewMeasurement.value.type === 'beam') {
      const dx = currentPos.x - previewMeasurement.value.start.x;
      const dy = currentPos.y - previewMeasurement.value.start.y;
      const pixelDistance = Math.sqrt(dx * dx + dy * dy);
      const unscaledGridWidth = gridRect.width / scale;
      const worldSquareSize = unscaledGridWidth / (gridWidth.value || 1);
      const distanceInSquares = pixelDistance / worldSquareSize;
      const meters = distanceInSquares * (metersPerSquare.value || 1.5);
      previewMeasurement.value.distance = formatDistance(meters);
      const originId = coneOriginSquareId.value;
      const targetId = getSquareIdFromLocalPoint(currentPos.x, currentPos.y);
      if (originId && targetId) {
        coneAffectedSquares.value = calculateBeamOrWallArea(originId, targetId, 1);
      }
    }
    return;
  }

  // Se nenhuma ferramenta estiver ativa, executa a lógica de pan & zoom.
  if (activePointers.value.length === 1) {
    viewTransform.value.x += event.movementX;
    viewTransform.value.y += event.movementY;
  } else if (activePointers.value.length === 2) {

    // Encontra o novo índice do ponteiro que se moveu
    const index = activePointers.value.findIndex(p => p.pointerId === event.pointerId);
    if (index !== -1) {
      // Atualiza a posição do ponteiro na nossa lista
      activePointers.value[index] = event;
    }

    const p1 = activePointers.value[0];
    const p2 = activePointers.value[1];

    // Calcula a nova distância entre os dois ponteiros
    const currentDistance = Math.sqrt(Math.pow(p1.clientX - p2.clientX, 2) + Math.pow(p1.clientY - p2.clientY, 2));

    // Define a distância inicial na primeira vez que o gesto é detectado
    if (initialPinchDistance.value === 0) {
      initialPinchDistance.value = currentDistance;
    }

    // Calcula a nova escala baseada na mudança da distância
    const newScale = viewTransform.value.scale * (currentDistance / initialPinchDistance.value);
    viewTransform.value.scale = Math.max(0.1, Math.min(newScale, 10));

    // Atualiza a distância inicial para o próximo movimento
    initialPinchDistance.value = currentDistance;
  }
}

// Função para quando um ponteiro (dedo/mouse) sai da tela
function handlePointerUp(event: PointerEvent) {
  // Se estávamos pré-visualizando, o pointerUp FINALIZA a medição.
  if (previewMeasurement.value) {
  if (activeTool.value === 'ruler' && previewMeasurement.value.type === 'ruler' && activeSceneId.value) {
      const canShare = isDM.value || !!myActiveToken.value; // DM ou jogador cujo token está no turno
      if (canShare) {
    // Converte pontos locais (px) para unidades de grade (células)
    const gridRect = gridDisplayRef.value!.$el.getBoundingClientRect();
    const scale = viewTransform.value.scale || 1;
    const unscaledGridWidth = gridRect.width / scale;
    const worldSquareSize = unscaledGridWidth / (gridWidth.value || 1);
    const toGrid = (p: {x:number;y:number}) => ({ x: p.x / worldSquareSize, y: p.y / worldSquareSize });
        socketService.shareMeasurement({
          tableId,
          sceneId: activeSceneId.value,
      start: toGrid(previewMeasurement.value.start),
      end: toGrid(previewMeasurement.value.end),
          distance: previewMeasurement.value.distance || '0m',
          type: 'ruler',
          color: measurementColor.value || (isDM.value ? '#3c096c' : '#ff8c00')
        });
      }
    } else if (activeTool.value === 'cone' && previewMeasurement.value.type === 'cone' && activeSceneId.value) {
      const canShare = isDM.value || !!myActiveToken.value;
      if (canShare) {
    const gridRect = gridDisplayRef.value!.$el.getBoundingClientRect();
    const scale = viewTransform.value.scale || 1;
    const unscaledGridWidth = gridRect.width / scale;
    const worldSquareSize = unscaledGridWidth / (gridWidth.value || 1);
    const toGrid = (p: {x:number;y:number}) => ({ x: p.x / worldSquareSize, y: p.y / worldSquareSize });
        // Se modo persistente estiver ativo, cria persistente; senão, compartilha efêmera
        if (persistentMode.value) {
          socketService.addPersistentMeasurement({
            tableId,
            sceneId: activeSceneId.value,
      start: toGrid(previewMeasurement.value.start),
      end: toGrid(previewMeasurement.value.end),
            distance: previewMeasurement.value.distance || '0m',
            type: 'cone',
            affectedSquares: coneAffectedSquares.value,
            color: measurementColor.value || (isDM.value ? '#3c096c' : '#ff8c00')
          });
          // Harmoniza comportamento: após persistir, desliga o PIN
          persistentMode.value = false;
        } else {
          socketService.shareMeasurement({
            tableId,
            sceneId: activeSceneId.value,
      start: toGrid(previewMeasurement.value.start),
      end: toGrid(previewMeasurement.value.end),
            distance: previewMeasurement.value.distance || '0m',
            type: 'cone',
            affectedSquares: coneAffectedSquares.value,
            color: measurementColor.value || (isDM.value ? '#3c096c' : '#ff8c00')
          });
        }
      }
    } else if (activeTool.value === 'circle' && previewMeasurement.value.type === 'circle' && activeSceneId.value) {
      const canShare = isDM.value || !!myActiveToken.value;
      if (canShare) {
    const gridRect = gridDisplayRef.value!.$el.getBoundingClientRect();
    const scale = viewTransform.value.scale || 1;
    const unscaledGridWidth = gridRect.width / scale;
    const worldSquareSize = unscaledGridWidth / (gridWidth.value || 1);
    const toGrid = (p: {x:number;y:number}) => ({ x: p.x / worldSquareSize, y: p.y / worldSquareSize });
        if (persistentMode.value) {
          socketService.addPersistentMeasurement({
            tableId,
            sceneId: activeSceneId.value,
      start: toGrid(previewMeasurement.value.start),
      end: toGrid(previewMeasurement.value.end),
            distance: previewMeasurement.value.distance || '0m',
            type: 'circle',
            affectedSquares: coneAffectedSquares.value,
            color: measurementColor.value || (isDM.value ? '#3c096c' : '#ff8c00')
          });
          // Harmoniza comportamento: após persistir, desliga o PIN
          persistentMode.value = false;
        } else {
          socketService.shareMeasurement({
            tableId,
            sceneId: activeSceneId.value,
      start: toGrid(previewMeasurement.value.start),
      end: toGrid(previewMeasurement.value.end),
            distance: previewMeasurement.value.distance || '0m',
            type: 'circle',
            affectedSquares: coneAffectedSquares.value,
            color: measurementColor.value || (isDM.value ? '#3c096c' : '#ff8c00')
          });
        }
      }
  } else if (activeTool.value === 'square' && previewMeasurement.value.type === 'square' && activeSceneId.value) {
      const canShare = isDM.value || !!myActiveToken.value;
      if (canShare) {
    const gridRect = gridDisplayRef.value!.$el.getBoundingClientRect();
    const scale = viewTransform.value.scale || 1;
    const unscaledGridWidth = gridRect.width / scale;
    const worldSquareSize = unscaledGridWidth / (gridWidth.value || 1);
    const toGrid = (p: {x:number;y:number}) => ({ x: p.x / worldSquareSize, y: p.y / worldSquareSize });
        if (persistentMode.value) {
          socketService.addPersistentMeasurement({
            tableId,
            sceneId: activeSceneId.value,
      start: toGrid(previewMeasurement.value.start),
      end: toGrid(previewMeasurement.value.end),
            distance: previewMeasurement.value.distance || '0m',
            type: 'square',
            affectedSquares: coneAffectedSquares.value,
            color: measurementColor.value || (isDM.value ? '#3c096c' : '#ff8c00')
          });
          // Ao persistir, desliga o modo pin
          persistentMode.value = false;
        } else {
          socketService.shareMeasurement({
            tableId,
            sceneId: activeSceneId.value,
      start: toGrid(previewMeasurement.value.start),
      end: toGrid(previewMeasurement.value.end),
            distance: previewMeasurement.value.distance || '0m',
            type: 'square',
            affectedSquares: coneAffectedSquares.value,
            color: measurementColor.value || (isDM.value ? '#3c096c' : '#ff8c00')
          });
        }
      }
    } else if (activeTool.value === 'line' && previewMeasurement.value.type === 'line' && activeSceneId.value) {
      const canShare = isDM.value || !!myActiveToken.value;
      if (canShare) {
        const gridRect = gridDisplayRef.value!.$el.getBoundingClientRect();
        const scale = viewTransform.value.scale || 1;
        const unscaledGridWidth = gridRect.width / scale;
        const worldSquareSize = unscaledGridWidth / (gridWidth.value || 1);
        const toGrid = (p: {x:number;y:number}) => ({ x: p.x / worldSquareSize, y: p.y / worldSquareSize });
        if (persistentMode.value) {
          socketService.addPersistentMeasurement({
            tableId,
            sceneId: activeSceneId.value,
            start: toGrid(previewMeasurement.value.start),
            end: toGrid(previewMeasurement.value.end),
            distance: previewMeasurement.value.distance || '0m',
            type: 'line',
            affectedSquares: coneAffectedSquares.value,
            color: measurementColor.value || (isDM.value ? '#3c096c' : '#ff8c00')
          });
          persistentMode.value = false;
        } else {
          socketService.shareMeasurement({
            tableId,
            sceneId: activeSceneId.value,
            start: toGrid(previewMeasurement.value.start),
            end: toGrid(previewMeasurement.value.end),
            distance: previewMeasurement.value.distance || '0m',
            type: 'line',
            affectedSquares: coneAffectedSquares.value,
            color: measurementColor.value || (isDM.value ? '#3c096c' : '#ff8c00')
          });
        }
      }
  } else if (activeTool.value === 'beam' && previewMeasurement.value.type === 'beam' && activeSceneId.value) {
      const canShare = isDM.value || !!myActiveToken.value;
      if (canShare) {
        const gridRect = gridDisplayRef.value!.$el.getBoundingClientRect();
        const scale = viewTransform.value.scale || 1;
        const unscaledGridWidth = gridRect.width / scale;
        const worldSquareSize = unscaledGridWidth / (gridWidth.value || 1);
        const toGrid = (p: {x:number;y:number}) => ({ x: p.x / worldSquareSize, y: p.y / worldSquareSize });
        const type = previewMeasurement.value.type;
        if (persistentMode.value) {
          socketService.addPersistentMeasurement({
            tableId,
            sceneId: activeSceneId.value,
            start: toGrid(previewMeasurement.value.start),
            end: toGrid(previewMeasurement.value.end),
            distance: previewMeasurement.value.distance || '0m',
            type,
            affectedSquares: coneAffectedSquares.value,
            color: measurementColor.value || (isDM.value ? '#3c096c' : '#ff8c00')
          });
          persistentMode.value = false;
        } else {
          socketService.shareMeasurement({
            tableId,
            sceneId: activeSceneId.value,
            start: toGrid(previewMeasurement.value.start),
            end: toGrid(previewMeasurement.value.end),
            distance: previewMeasurement.value.distance || '0m',
            type,
            affectedSquares: coneAffectedSquares.value,
            color: measurementColor.value || (isDM.value ? '#3c096c' : '#ff8c00')
          });
        }
      }
    }
    previewMeasurement.value = null; 
    // Limpeza dos quadrados pintados
    const canShareNow = isDM.value || !!myActiveToken.value;
    if (!canShareNow) {
  // Não é turno do jogador: limpa prévia
      coneAffectedSquares.value = [];
      coneOriginSquareId.value = null;
    } else {
  // Limpeza normal pós medição (régua/none/persistente)
      if (activeTool.value === 'ruler' || activeTool.value === 'none' || persistentMode.value) {
        coneAffectedSquares.value = [];
        coneOriginSquareId.value = null;
      }
    }

    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    return;
  }

  // Lógica original de pan & zoom
  activePointers.value = activePointers.value.filter(p => p.pointerId !== event.pointerId);
  if (activePointers.value.length < 2) {
    initialPinchDistance.value = 0;
  }
  viewportRef.value?.releasePointerCapture(event.pointerId);
}

function handleWheel(event: WheelEvent) {
    event.preventDefault();
    const zoomIntensity = 0.1;
    if (event.deltaY < 0) {
        viewTransform.value.scale *= (1 + zoomIntensity);
    } else {
        viewTransform.value.scale *= (1 - zoomIntensity);
    }
    viewTransform.value.scale = Math.max(0.1, Math.min(viewTransform.value.scale, 10));
}

function resetView() {
  viewTransform.value.scale = 1;
  // Centraliza visão
  viewTransform.value.x = 0;
  viewTransform.value.y = 0;
}

function handleToolSelected(tool: 'ruler' | 'cone' | 'circle' | 'square' | 'none') {
  activeTool.value = tool;

  // Reset geral ao trocar ferramenta
  rulerStartPoint.value = null;
  rulerEndPoint.value = null;
  rulerDistance.value = '0.0m';
  coneOriginSquareId.value = null;
  coneAffectedSquares.value = [];
  previewMeasurement.value = null;

  // Ativar ferramenta: limpa UI
  if (tool !== 'none') {
    showTokenForm.value = false;
    selectedTokenId.value = null;
  }

  // Sempre limpa seleção ao trocar de ferramenta
  selectedPersistentId.value = null;

  // Ferramenta none: remove medição compartilhada
  if (tool === 'none' && activeSceneId.value) {
    try {
      socketService.removeMyMeasurement({ tableId, sceneId: activeSceneId.value });
    } catch {}
  }
}


function calculateConeArea(originId: string, targetId: string, lengthInMeters: number): string[] {
  if (originId === targetId) return [];

  // Escala dinâmica (m/quadrado)
  const mPerSq = metersPerSquare.value || 1.5;
  const lengthInSquares = Math.max(0, Math.floor(lengthInMeters / mPerSq));

  const cols = gridWidth.value;
  const rows = gridHeight.value;
  const getCoords = (id: string) => {
    const index = parseInt(id.replace('sq-', ''));
    return { x: index % cols, y: Math.floor(index / cols) };
  };
  const getId = (x: number, y: number) => `sq-${y * cols + x}`;

  const origin = getCoords(originId);
  const target = getCoords(targetId);

  // Vetores pelos centros
  const originCenter = { x: origin.x + 0.5, y: origin.y + 0.5 };
  const targetCenter = { x: target.x + 0.5, y: target.y + 0.5 };
  const dir = { x: targetCenter.x - originCenter.x, y: targetCenter.y - originCenter.y };
  const dirLen = Math.hypot(dir.x, dir.y) || 1;
  const nx = dir.x / dirLen;
  const ny = dir.y / dirLen;
  // Ângulo 90° (±45°)
  const halfAngle = (45 * Math.PI) / 180;
  const cosHalf = Math.cos(halfAngle);

  const maxDist = lengthInSquares + 0.5; // tolerância para bordas
  const affected = new Set<string>([originId]);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const vx = cx - originCenter.x;
      const vy = cy - originCenter.y;
      const vLen = Math.hypot(vx, vy);
      if (vLen === 0) continue;
      if (vLen > maxDist) continue; // fora do raio
      // Produto escalar para checar ângulo
      const dot = (vx * nx + vy * ny) / vLen; // cos(theta)
      if (dot <= 0) continue; // atrás do ápice
      if (dot >= cosHalf) {
        affected.add(getId(x, y));
      }
    }
  }
  return Array.from(affected);
}

// Linha supercover (células atravessadas)
function calculateLineSquares(originId: string, targetId: string): string[] {
  const cols = gridWidth.value;
  const rows = gridHeight.value;
  const getCoords = (id: string) => { const idx = parseInt(id.replace('sq-', '')); return { x: idx % cols, y: Math.floor(idx / cols) }; };
  const getId = (x: number, y: number) => `sq-${y * cols + x}`;
  const a = getCoords(originId);
  const b = getCoords(targetId);
  let x0 = a.x + 0.5, y0 = a.y + 0.5;
  const x1 = b.x + 0.5, y1 = b.y + 0.5;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const visited = new Set<string>();
  const add = (x:number,y:number) => { if (x>=0 && x<cols && y>=0 && y<rows) visited.add(getId(Math.floor(x), Math.floor(y))); };
  add(x0, y0);
  while (Math.floor(x0) !== Math.floor(x1) || Math.floor(y0) !== Math.floor(y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
    add(x0, y0);
  }
  return Array.from(visited);
}

// Feixe/Parede: retângulo orientado
function calculateBeamOrWallArea(originId: string, targetId: string, widthSquares = 1): string[] {
  const cols = gridWidth.value, rows = gridHeight.value;
  const getCoords = (id: string) => { const idx = parseInt(id.replace('sq-', '')); return { x: idx % cols, y: Math.floor(idx / cols) }; };
  const getId = (x: number, y: number) => `sq-${y * cols + x}`;
  const o = getCoords(originId);
  const t = getCoords(targetId);
  const ocx = o.x + 0.5, ocy = o.y + 0.5;
  const tcx = t.x + 0.5, tcy = t.y + 0.5;
  const vx = tcx - ocx, vy = tcy - ocy;
  const len = Math.hypot(vx, vy);
  // Se o alvo está na mesma célula (comprimento ~0), limita ao quadrado de origem
  if (!isFinite(len) || len < 1e-6) return [originId];
  const ux = vx / len, uy = vy / len;
  const half = (widthSquares / 2);
  const visited = new Set<string>();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      const wx = cx - ocx, wy = cy - ocy;
      const proj = wx * ux + wy * uy;
      if (proj < 0 || proj > len) continue;
      const perp = Math.abs(wx * (-uy) + wy * ux);
      if (perp <= half + 0.001) visited.add(getId(x, y));
    }
  }
  visited.add(originId);
  return Array.from(visited);
}

// Local (px) -> id do quadrado
function getSquareIdFromLocalPoint(localX: number, localY: number): string | null {
  if (!gridDisplayRef.value) return null;
  const gridRect = gridDisplayRef.value.$el.getBoundingClientRect();
  const scale = viewTransform.value.scale || 1;
  const unscaledGridWidth = gridRect.width / scale;
  const unscaledGridHeight = gridRect.height / scale;
  const cols = gridWidth.value || 1;
  const rows = gridHeight.value || 1;
  const cellW = unscaledGridWidth / cols;
  const cellH = unscaledGridHeight / rows;
  const col = Math.min(cols - 1, Math.max(0, Math.floor(localX / cellW)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(localY / cellH)));
  return `sq-${row * cols + col}`;
}

// Centro local (px) para id
function getSquareCenterLocalPointFromId(squareId: string): { x: number; y: number } | null {
  if (!gridDisplayRef.value) return null;
  const gridRect = gridDisplayRef.value.$el.getBoundingClientRect();
  const scale = viewTransform.value.scale || 1;
  const unscaledGridWidth = gridRect.width / scale;
  const unscaledGridHeight = gridRect.height / scale;
  const cols = gridWidth.value || 1;
  const rows = gridHeight.value || 1;
  const cellW = unscaledGridWidth / cols;
  const cellH = unscaledGridHeight / rows;
  const index = parseInt(squareId.replace('sq-', ''));
  if (isNaN(index)) return null;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: col * cellW + cellW / 2, y: row * cellH + cellH / 2 };
}

// Arredonda metros para múltiplos de step
function quantizeMeters(meters: number, step = 0.5): number {
  if (!isFinite(meters) || meters < 0) return 0;
  const s = step > 0 ? step : 0.5;
  return Math.round(meters / s) * s;
}

// Formata: X.Ym (Zft)
function formatDistance(meters: number): string {
  const feetRaw = meters * 3.28084;
  // Arredonda para o inteiro mais próximo (1 ft de precisão)
  const feetRounded = Math.round(feetRaw);
  const metersStr = meters.toFixed(1).replace('.', ',');
  return `${metersStr}m (${feetRounded}ft)`;
}

// Atualização automática sempre que largura ou altura mudarem (DM apenas)
watch([gridWidth, gridHeight], ([w, h], [ow, oh]) => {
  if (!isDM.value || !activeSceneId.value) return;
  if (w === ow && h === oh) return;
  socketService.updateGridDimensions(tableId, activeSceneId.value, w, h);
});

// Limpa seleção ao trocar de cena ou quando o item selecionado some
watch(activeSceneId, () => {
  selectedPersistentId.value = null;
  // Reset seleção/ferramentas ao trocar cena
  selectedTokenId.value = null;
  showAuraDialog.value = false;
  auraDialogTokenId.value = null;
  persistentMode.value = false;
  // Ensure no measuring tool remains active
  activeTool.value = 'none';
});

watch(persistentMeasurements, () => {
  if (!selectedPersistentId.value) return;
  const stillExists = persistentMeasurements.value.some(pm => pm.id === selectedPersistentId.value);
  if (!stillExists) selectedPersistentId.value = null;
});

onMounted(() => {
  socketService.connect(tableId);
  // Resize janela -> recalcula dimensões imagem
  window.addEventListener('resize', updateImageDimensions);
  window.addEventListener('keydown', handleGlobalEsc);
});

onUnmounted(() => {
  socketService.disconnect();
  window.removeEventListener('resize', updateImageDimensions);
  window.removeEventListener('keydown', handleGlobalEsc);
});

function handleGlobalEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') {
  // ESC: limpa medições
    previewMeasurement.value = null;
    rulerStartPoint.value = null;
    rulerEndPoint.value = null;
    coneOriginSquareId.value = null;
    coneAffectedSquares.value = [];
    // Sai de ferramenta se estava medindo
    if (isMeasuring.value) activeTool.value = 'none';
  }
}

watch(currentMapUrl, () => {
  // Recalcula ao trocar imagem
  setTimeout(updateImageDimensions, 50);
});

// Ao finalizar o turno (mudança do token em turno), limpamos medições locais e desselecionamos ferramentas
watch(currentTurnTokenId, (novo, antigo) => {
  if (novo === antigo) return;
  // Novo turno: limpa ferramenta/medição
  handleToolSelected('none');
  // Desliga pin
  persistentMode.value = false;
  // Limpeza local
  previewMeasurement.value = null;
  coneAffectedSquares.value = [];
  coneOriginSquareId.value = null;
});

// Áreas adicionais
// Círculo: inclui células cujos centros estão a uma distância <= raio + tolerância em quadrados
function calculateCircleArea(originId: string, radiusMeters: number): string[] {
  const mPerSq = metersPerSquare.value || 1.5;
  const radiusSq = Math.max(0, radiusMeters / mPerSq);
  const cols = gridWidth.value, rows = gridHeight.value;
  const getCoords = (id: string) => { const idx = parseInt(id.replace('sq-', '')); return { x: idx % cols, y: Math.floor(idx / cols) }; };
  const getId = (x: number, y: number) => `sq-${y * cols + x}`;
  const originCoords = getCoords(originId);
  let centerX = originCoords.x + 0.5;
  let centerY = originCoords.y + 0.5;
  // Multi-footprint: centro geométrico
  const square = squares.value.find(s => s.id === originId);
  if (square?.token) {
    const sizeMap: Record<TokenSize, number> = { 'Pequeno/Médio':1,'Grande':2,'Enorme':3,'Descomunal':4,'Colossal':5 } as const;
    const span = sizeMap[square.token.size as TokenSize] || 1;
    if (span > 1) {
      // Anchor -> centro real do token
      centerX = originCoords.x + (span / 2);
      centerY = originCoords.y + (span / 2);
    }
  }
  return computeCircle(centerX, centerY);

  function computeCircle(ocx: number, ocy: number): string[] {
    const maxDist = radiusSq + 0.5; // tolerância
    const affected = new Set<string>([originId]);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        const dx = cx - ocx, dy = cy - ocy;
        const d = Math.hypot(dx, dy);
        if (d <= maxDist) affected.add(getId(x, y));
      }
    }
    return Array.from(affected);
  }
}

// Quadrado: lado em metros centrado
function calculateSquareArea(originId: string, sideMeters: number): string[] {
  const mPerSq = metersPerSquare.value || 1.5;
  const sideSq = Math.max(0, sideMeters / mPerSq);
  const half = sideSq / 2;
  const cols = gridWidth.value, rows = gridHeight.value;
  const getCoords = (id: string) => { const idx = parseInt(id.replace('sq-', '')); return { x: idx % cols, y: Math.floor(idx / cols) }; };
  const getId = (x: number, y: number) => `sq-${y * cols + x}`;
  const originCoords = getCoords(originId);
  let centerX = originCoords.x + 0.5;
  let centerY = originCoords.y + 0.5;
  const square = squares.value.find(s => s.id === originId);
  if (square?.token) {
    const sizeMap: Record<TokenSize, number> = { 'Pequeno/Médio':1,'Grande':2,'Enorme':3,'Descomunal':4,'Colossal':5 } as const;
    const span = sizeMap[square.token.size as TokenSize] || 1;
    if (span > 1) {
      centerX = originCoords.x + (span / 2);
      centerY = originCoords.y + (span / 2);
    }
  }
  const minX = centerX - half - 0.001, maxX = centerX + half + 0.001; // tolerância
  const minY = centerY - half - 0.001, maxY = centerY + half + 0.001;
  const affected = new Set<string>([originId]);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) affected.add(getId(x, y));
    }
  }
  return Array.from(affected);
}

</script>

<template>
  <div class="table-view-layout">
    <div class="connection-indicator" :class="['status-' + connectionStatus, { degraded: isConnectionDegraded }]">
      <span class="dot"></span>
      <span>{{ connectionLabel }}</span>
    </div>

  <div v-if="!isDM && sessionStatus === 'LIVE' && activeScene?.type === 'battlemap'" class="player-initiative-wrapper">
      <InitiativePanel
        :initiativeList="initiativeList"
        :tokensOnMap="tokensOnMap"
        :metersPerSquare="metersPerSquare"
        :currentUser="currentUser ? { _id: currentUser.id, username: currentUser.username } : null"
        :isDM="false"
        :myActiveToken="myActiveToken"
        @undo-move="handleUndoMove"
        @next-turn="handleNextTurn"
        @open-character-sheet="(id: string) => id && openCharacterSheet(id)"
      />
    </div>


  <aside v-if="isDM" class="dm-panel" :class="{ collapsed: isDmPanelCollapsed }">
      <button @click="isDmPanelCollapsed = !isDmPanelCollapsed" class="toggle-button">
        <span>Painel do Mestre</span>
        <span class="chevron" :class="{ collapsed: isDmPanelCollapsed }">
          <Icon :name="isDmPanelCollapsed ? 'plus' : 'minus'" size="18" />
        </span>
      </button>
      
      <div v-show="!isDmPanelCollapsed" class="panel-content">        
        <DMSessionControls
          :session-status="sessionStatus"
          :pause-input="pauseInput"
          :pause-remaining="pauseRemaining"
          :is-collapsed="isSessionCollapsed"
          @toggle="isSessionCollapsed = !isSessionCollapsed"
          @update:pauseInput="pauseInput = $event"
          @update-status="handleUpdateSessionStatus"
          @start-session="startSessionWithTransition"
        />
        
        <SceneManager
          :scenes="scenes"
          :active-scene-id="activeSceneId"
          :is-collapsed="isScenesCollapsed"
          :map-url-input="mapUrlInput"
          :new-scene-name="newSceneName"
          :new-scene-image-url="newSceneImageUrl"
          :new-scene-type="newSceneType"
          @toggle="isScenesCollapsed = !isScenesCollapsed"
          @set-active-scene="handleSetActiveScene"
          @edit-scene="handleEditScene"
          @delete-scene="handleDeleteScene"
          @reorder="onSceneReorder"
          @set-map="setMap"
          @create-scene="handleCreateScene"
          @update:mapUrlInput="mapUrlInput = $event"
          @update:newSceneName="newSceneName = $event"
          @update:newSceneImageUrl="newSceneImageUrl = $event"
          @update:newSceneType="newSceneType = $event"
        />

        <!-- Initiative table now after Scenes and before Grid controls -->
        <div class="panel-section" v-if="activeScene?.type === 'battlemap' && initiativeList.length > 0">
          <InitiativePanel
            :initiativeList="initiativeList"
            :tokensOnMap="tokensOnMap"
            :metersPerSquare="metersPerSquare"
            :currentUser="currentUser ? { _id: currentUser.id, username: currentUser.username } : null"
            :isDM="true"
            :myActiveToken="myActiveToken"
            @edit-token="(id:string)=>{ const tok=tokensOnMap.find(t=>t._id===id)||null; tokenBeingEdited=tok; showTokenEditForm=!!tok; }"
            @remove-entry="(entryId:string)=>handleRemoveFromInitiative(entryId)"
            @reorder="handleInitiativeReorder"
            @undo-move="handleUndoMove"
            @next-turn="handleNextTurn"
            @open-character-sheet="(id: string) => id && openCharacterSheet(id)"
          />
        </div>

        <div class="panel-section" v-if="activeScene?.type === 'battlemap'">
          <div class="subsection-toggle" @click="toggleDmRoller">
            <h4>Rolagens</h4>
            <span class="chevron"><Icon :name="dmRollerExpanded ? 'minus' : 'plus'" size="16" /></span>
          </div>
          <div v-show="dmRollerExpanded">
            <DiceRoller
              :tableId="tableId"
              :availableCharacters="charactersForTable"
              :currentTokenId="currentTurnTokenId"
              :activeCharacterId="activeCharacterId"
              mode="embedded"
            />
          </div>
        </div>

        <div v-if="activeScene?.type === 'battlemap'" class="panel-section">
          <button class="subsection-toggle" @click="isGridCollapsed = !isGridCollapsed">
            <h4>Controles do Grid</h4>
            <span class="chevron"><Icon :name="isGridCollapsed ? 'plus' : 'minus'" size="16" /></span>
          </button>
          <div class="grid-controls" v-show="!isGridCollapsed">
            <label for="grid-size">Tamanho (quadrados):</label>
            <div class="grid-dimensions">
              <label>L:</label>
              <input class="input-xs" style="width:62px" type="number" v-model.number="gridWidth" min="1" />
              <label>A:</label>
              <input class="input-xs" style="width:62px" type="number" v-model.number="gridHeight" min="1" />
            </div>
            <div class="scale-control">
              <label>Escala (m por quadrado):</label>
              <input class="input-xs" style="width:98px" type="number" step="0.1" min="0.1" v-model.number="metersPerSquare" />
              <small>{{ (metersPerSquare || 0).toFixed(2) }}m ≈ {{ Math.round(squareFeet) }}ft por quadrado</small>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <main class="battlemap-main">
      <MapViewport
        v-if="canUseMap"
        :is-measuring="isMeasuring"
        :view-transform="viewTransform"
        :current-map-url="currentMapUrl"
        :active-scene-type="activeScene?.type"
        :grid-width="gridWidth"
        :grid-height="gridHeight"
        :meters-per-square="metersPerSquare"
        :ruler-start-point="rulerStartPoint"
        :ruler-end-point="rulerEndPoint"
        :ruler-distance="rulerDistance"
        :preview-measurement="previewMeasurement"
        :shared-measurements="sharedMeasurementList"
        :persistent-measurements="persistentsForActiveScene"
        :auras="auras"
        :user-measurement-colors="userMeasurementColors"
        :cone-affected-squares="coneAffectedSquares"
        :measurement-color="measurementColor"
        :current-turn-token-id="currentTurnTokenId"
        :squares="squares"
        :image-rendered-width="imageRenderedWidth"
        :image-rendered-height="imageRenderedHeight"
        :selected-token-id="selectedTokenId"
        :is-dm="isDM"
        :current-user-id="currentUser?.id || null"
        :selected-persistent-id="selectedPersistentId"
        :pings="pings"
        :show-assign-menu="showAssignMenu"
        :assign-menu-position="assignMenuPosition"
        :assign-menu-target-token="assignMenuTargetToken"
        :players="currentTable?.players || []"
        :map-image-ref-setter="setMapImageEl"
        :viewport-ref-setter="setViewportEl"
        :grid-display-ref-setter="setGridDisplayInstance"
        :on-wheel="handleWheel"
        :on-pointer-down="handlePointerDown"
        :on-pointer-move="handlePointerMove"
        :on-pointer-up="handlePointerUp"
        :on-middle-click="handleMiddleClickFree"
        :on-square-right-click="handleRightClick"
        :on-square-left-click="handleLeftClickOnSquare"
        :on-token-move-request="handleTokenMoveRequest"
        :on-remove-persistent="handleRemovePersistent"
        :on-select-persistent="handleSelectPersistent"
        :on-viewport-contextmenu="handleViewportContextMenu"
        :on-shape-contextmenu="handleShapeContextMenu"
        :on-image-load="updateImageDimensions"
        :on-assign-token="handleAssignToken"
        :on-close-assign-menu="closeAssignMenu"
        :on-open-character-from-token="handleOpenCharacterFromToken"
      />
      <div v-else-if="!isDM && (sessionStatus === 'PREPARING' || sessionStatus === 'PAUSED' || sessionStatus === 'ENDED')" class="session-overlay" :class="`mode-${sessionStatus.toLowerCase()}`">
        <div class="overlay-card surface">
          <template v-if="sessionStatus === 'PREPARING'">
            <video class="overlay-media" autoplay loop muted playsinline src="/media/preparing.mp4"></video>
            <h2>O Mestre está preparando a sessão…</h2>
            <p>Afie suas lâminas e pegue seus dados — a aventura começa em instantes.</p>
          </template>
          <template v-else-if="sessionStatus === 'PAUSED'">
            <video class="overlay-media" autoplay loop muted playsinline src="/media/paused.mp4"></video>
            <h2>Pequena pausa, já voltamos!</h2>
            <p>Hora de hidratar, alongar e revisar estratégias.</p>
            <div v-if="pauseRemaining > 0" class="countdown">Retomando em {{ Math.floor(pauseRemaining/60) }}:{{ String(pauseRemaining%60).padStart(2,'0') }}</div>
          </template>
          <template v-else-if="sessionStatus === 'ENDED'">
            <video class="overlay-media" autoplay loop muted playsinline src="/media/ended.mp4"></video>
            <h2>E é aqui...</h2>
            <p>Obrigado por jogar — até a próxima sessão.</p>
          </template>
        </div>
      </div>

      <!-- Transição curta antes de entrar no LIVE (todos veem) -->
      <div v-if="showTransition" class="transition-overlay">
        <div class="overlay-card surface">
          <video ref="transitionVideoRef" class="overlay-media" autoplay muted playsinline src="/media/transition.mp4"></video>
          <h2>Vamos começar!</h2>
        </div>
      </div>
    </main>

    <button v-if="canUseMap" @click="resetView" class="reset-view-btn below">Recentralizar</button>

    <button
      class="log-toggle-btn surface"
      :class="{ open: showActionLog }"
      type="button"
      @click="toggleActionLog"
    >
      {{ showActionLog ? 'Fechar log' : 'Log' }}
      <span v-if="logCount" class="log-badge">{{ logCount }}</span>
    </button>

    <transition name="log-panel">
      <aside v-if="showActionLog" class="action-log-panel surface">
        <header class="log-panel__header">
          <div>
            <p class="log-panel__eyebrow">Timeline</p>
            <h3>Registro de ações</h3>
          </div>
          <button type="button" class="log-panel__close" @click="toggleActionLog">×</button>
        </header>
        <ActionLog :logs="logs" />
      </aside>
    </transition>

    <Toolbar 
      v-if="(sessionStatus === 'LIVE' || isDM) && activeScene?.type === 'battlemap'"
      :activeTool="activeTool"
      :canDelete="Boolean(selectedPersistentId && (isDM || persistentMeasurements.find(pm => pm.id === selectedPersistentId)?.userId === currentUser?.id))"
      :persistentMode="persistentMode"
      :isDM="isDM"
      :selectedColor="measurementColor"
      :canRemoveAura="canRemoveAura"
      :canAddAura="canAddAura"
      @tool-selected="handleToolSelected" 
      @toggle-persistent="handleTogglePersistent"
      @color-selected="handleColorSelected"
      @clear-all="handleClearAllMeasurements"
      @delete-selected="handleDeleteSelectedPersistent"
      @remove-aura="handleToolbarRemoveAura"
      @edit-aura="handleToolbarEditAura"
      @toggle-dice-roller="toggleDicePopup"
    />
    
    <TokenCreationForm
      v-if="showTokenForm && isDM"
      :players="currentTable?.players || []"
      :characters="charactersForTable"
      @create-token="createToken"
      @cancel="showTokenForm = false"
    />
    <TokenEditForm
      :open="showTokenEditForm"
      :token="tokenBeingEdited"
      :players="currentTable?.players || []"
      :characters="charactersForTable"
      @close="showTokenEditForm = false; tokenBeingEdited = null;"
      @save="handleSaveTokenEdit"
    />
    <AuraDialog
      :open="showAuraDialog"
      :tokenId="auraDialogTokenId"
      :defaultName="(auraDialogTokenId && auras.find(a => a.tokenId === auraDialogTokenId)?.name) || 'Aura'"
      :defaultColor="(auraDialogTokenId && auras.find(a => a.tokenId === auraDialogTokenId)?.color) || measurementColor"
  :defaultRadiusMeters="(auraDialogTokenId && auras.find(a => a.tokenId === auraDialogTokenId)?.radiusMeters) ?? 0"
      :isDM="isDM"
      :isOwner="Boolean(tokensOnMap.find(t => t._id === auraDialogTokenId)?.ownerId?._id === currentUser?.id)"
      @save="handleAuraSave"
      @remove="handleAuraRemove"
      @close="showAuraDialog = false; auraDialogTokenId = null;"
    />
    <CharacterSheet
      :open="showCharacterSheet"
      :character="activeCharacter"
      :isDM="isDM"
      :isOwner="isActiveCharacterOwner"
      @close="closeCharacterSheet"
      @save="handleCharacterSave"
      @delete="handleCharacterDelete"
    />

    <transition name="dice-roller">
      <div v-if="showDicePopup" class="dice-popup-overlay" @click.self="toggleDicePopup">
        <DiceRoller
          :tableId="tableId"
          :availableCharacters="charactersForTable"
          :currentTokenId="currentTurnTokenId"
          :activeCharacterId="activeCharacterId"
          mode="popup"
          @close="toggleDicePopup"
        />
      </div>
    </transition>

    <DiceAnimation
      v-if="diceAnimationVisible && diceAnimationPayload"
      :key="diceAnimationId"
      :payload="diceAnimationPayload"
      @dismiss="dismissDiceAnimation()"
    />
  </div>
</template>

<style scoped>
main{
  font-family: sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 20px;
}
.table-view-container {
  display: flex;
  width: 100%;
  gap: 20px;
  padding: 20px;
}
.table-view-layout {
  gap: 20px;
  width: 100%;
  padding: 20px;
  box-sizing: border-box; /* Garante que o padding não aumente a largura total */
  position: relative;
}
.log-toggle-btn {
  position: fixed;
  bottom: 20px;
  right: 20px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 10px 16px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(180deg, var(--color-surface), var(--color-surface-alt));
  box-shadow: var(--elev-2);
  z-index: 70;
}
.log-toggle-btn.open {
  background: var(--color-accent);
  color: #0f0f15;
}
.log-badge {
  min-width: 26px;
  height: 26px;
  border-radius: 999px;
  background: var(--color-danger, #e53935);
  color: #fff;
  font-size: 0.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.action-log-panel {
  position: fixed;
  bottom: 84px;
  right: 20px;
  width: min(420px, calc(100vw - 40px));
  max-height: min(70vh, 540px);
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--color-border);
  box-shadow: var(--elev-3);
  background: linear-gradient(180deg, rgba(16, 12, 18, 0.95), rgba(11, 9, 14, 0.95));
  z-index: 65;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.log-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.log-panel__eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.68rem;
  color: var(--color-text-muted, #c9c5d4);
}
.log-panel__header h3 {
  margin: 4px 0 0;
  font-size: 1.1rem;
}
.log-panel__close {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  width: 32px;
  height: 32px;
  font-size: 1.2rem;
  background: var(--color-surface-alt);
  cursor: pointer;
}
.log-panel-enter-active,
.log-panel-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.log-panel-enter-from,
.log-panel-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
.dice-popup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 8, 12, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
}
.dice-roller-enter-active,
.dice-roller-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.dice-roller-enter-from,
.dice-roller-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
@media (max-width: 768px) {
  .action-log-panel {
    right: 10px;
    left: 10px;
    width: auto;
  }
  .log-toggle-btn {
    right: 10px;
    left: auto;
  }
}
.connection-indicator {
  position: absolute;
  top: 8px;
  left: 24px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  font-size: 0.85rem;
  color: var(--color-text);
  box-shadow: var(--elev-1);
}
.connection-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success, #2ecc71);
  display: inline-block;
}
.connection-indicator.status-reconnecting .dot,
.connection-indicator.status-connecting .dot {
  background: var(--color-warning, #f5a524);
}
.connection-indicator.status-disconnected .dot,
.connection-indicator.status-error .dot {
  background: var(--color-danger, #e53935);
}
.connection-indicator.degraded {
  border-color: var(--color-danger, #e53935);
  color: var(--color-danger, #e53935);
}
.battlemap-main {
  flex-grow: 1; /* Faz o battlemap ocupar o espaço principal */
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
.battlemap-main h1 {
  margin-top: 0;
}
.dm-panel {
  transition: width 0.3s ease, padding 0.3s ease;
  position: absolute;
  top: 20px; 
  right: 20px;
  z-index: 50; 
  width: 375px;
  max-width: clamp(340px, 28vw, 460px);
  flex-shrink: 0;
  background: linear-gradient(180deg, var(--color-surface), var(--color-surface-alt));
  padding: 18px;
  border-radius: var(--radius-md);
  height: fit-content;
  max-height: calc(100dvh - 40px); 
  overflow-y: auto;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  box-shadow: var(--elev-2);
  backdrop-filter: blur(4px);
  font-family: var(--font-sans);
}
.toggle-button {
  background: var(--color-surface-alt);
  color: var(--color-accent);
  border: 1px solid var(--color-border);
  width: 100%;
  padding: 10px;
  font-size: 0.95em;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: var(--radius-sm);
  letter-spacing:.5px;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.toggle-button:hover { background: var(--color-surface); }
/* Subsection toggles */
.subsection-toggle {
  width: 100%;
  background: transparent;
  border: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0;
  margin: 0 0 10px 0; /* igual aos h4 padrões */
  cursor: pointer;
  font: inherit; /* mantém a mesma família/tamanho base */
  color: inherit; /* mantém a cor de texto */
}
.subsection-toggle .chevron { color: var(--color-text-muted); display:flex; align-items:center; }
panel h2 {
  margin-top: 0;
  text-align: center;
  color: var(--color-accent);
  font-family: var(--font-display);
  letter-spacing:.5px;
}
.grid-controls {
    display: flex;
    flex-direction: column;
    gap: 5px;
    align-items: stretch;
}
/* Player initiative panel always visible bottom-right (below master panel layer) */
/* Player initiative panel placement */
.player-initiative-wrapper {
  position: fixed;
  bottom: 18px;
  right: 16px;
  z-index: 42; /* below dm-panel (50), above grid */
  pointer-events: none; /* allow map interactions except panel itself */
}
.player-initiative-wrapper .initiative-panel { pointer-events: auto; }
@media (max-width: 900px) {
  /* On mobile: dock above the map stage area for better panning */
  .player-initiative-wrapper { position: static; margin: 8px 8px 6px; }
}
.grid-controls label {
    font-size: 0.9em;
    text-align: left;
}
.grid-controls input {
    width: 100%;
}
.scale-control {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  font-size: 0.85em;
}
.scale-control input {
  width: 120px;
}
.session-overlay {
  display:flex; align-items:center; justify-content:center; height:70vh; width:100%;
}
.session-overlay.mode-preparing { background: var(--overlay-preparing-bg, --color-bg); }
.session-overlay.mode-paused { background: var(--overlay-paused-bg, --color-bg); }
.session-overlay.mode-ended { background: var(--overlay-ended-bg, --color-bg); }
.overlay-card { 
  width:min(780px, 92vw); padding:18px; border:1px solid var(--color-border); border-radius:16px; 
  background:linear-gradient(180deg,var(--color-surface),var(--color-surface-alt)); box-shadow:var(--elev-3);
  text-align:center; display:flex; flex-direction:column; gap:12px;
}
.overlay-media { width:100%; max-height:100%; object-fit:cover; border-radius:12px; border:1px solid var(--color-border); }
.countdown { font-weight:700; color:var(--color-accent-alt); font-family: var(--font-display); }
.session-btn.session-prepare { background: var(--color-surface-alt); color: var(--color-text); }
.session-btn.session-start { background: var(--color-success); color: var(--color-text); }
.session-btn.session-pause { background: var(--color-warning, #f5a524); color: var(--color-text); }
.session-btn.session-resume { margin-right: 20px; background: var(--color-accent); color: var(--color-text); }
.session-btn.session-end { margin-top: 15px; background: var(--color-danger); color: var(--color-text); }

.transition-overlay { position: fixed; inset:0; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,.6); z-index: 100; }
.reset-view-btn { padding: 8px 12px; background: var(--color-surface-alt); color: var(--color-text); border:1px solid var(--color-border); border-radius: var(--radius-sm); cursor:pointer; font: inherit; display:block; margin: 10px auto 0; }
.reset-view-btn.below { margin-top: 10px; }
.reset-view-btn:hover { background: var(--color-surface); }
@media (max-width: 900px) {
  /* Ensure there's space for the toolbar below the reset button */
  .reset-view-btn.below { margin-top: 6px; margin-bottom: 80px; }
}
 
.panel-section { margin-top: 25px; border-top: 1px solid var(--color-border); padding-top: 15px; }
.scene-list {
  list-style: none;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
}
.scene-list li { display:flex; justify-content:space-between; align-items:center; padding:8px; margin-bottom:5px; border-radius: var(--radius-sm); background: var(--color-surface-alt); border:1px solid var(--color-border); transition: background var(--transition-fast), border-color var(--transition-fast); }
.scene-list li:hover { background: var(--color-surface); border-color: var(--color-border-strong); }
.panel-section h3, .panel-section h4 {
  margin-top: 0;
  margin-bottom: 10px;
}
.scene-list li.active-scene { background: var(--color-accent); color: var(--color-text); font-weight:600; border-color: var(--color-border-strong); box-shadow:0 0 0 1px var(--color-border-strong), 0 0 6px rgba(var(--color-accent-rgb)/0.5); }
.create-scene-form {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.map-controls {
  margin-bottom: 20px;
  display: flex;
  gap: 10px;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
.map-controls input { padding:5px; min-width:300px; box-sizing:border-box; border:1px solid var(--color-border); background: var(--color-surface-alt); border-radius: var(--radius-sm); font-size:14px; color: var(--color-text); font-family: var(--font-sans); }
.map-controls input:focus { outline:2px solid var(--color-border-strong); outline-offset:2px; }
.map-controls button, .create-scene-form button {
  width: 100%;
  padding: 10px;
}
.inline-fields button, .inline-fields .btn { width:auto; padding: 6px 10px; }
.inline-fields .btn-xs { padding: 3px 10px; }
.dm-panel .btn-xs { font-weight:600; letter-spacing:.4px; }
.grid-controls .grid-dimensions input.input-xs,
.grid-controls .scale-control input.input-xs {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.dm-panel .input-sm, .dm-panel .input-xs { background: var(--color-surface-alt); border:1px solid var(--color-border); }
.initiative-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}
.initiative-controls button {
  flex-grow: 1;
}
.initiative-list { list-style:none; padding:0; margin:10px 0; max-height:250px; overflow-y:auto; background: var(--color-surface-alt); border-radius: var(--radius-sm); border:1px solid var(--color-border); }
.initiative-list li { padding:10px; border-bottom:1px solid var(--color-border); display:flex; justify-content:space-between; align-items:center; }
.initiative-list li:last-child {
  border-bottom: none;
}
.initiative-list li.active-turn { background: var(--color-success); font-weight:600; color: var(--color-text); }
.add-character-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.delete-btn-small {
    background: none;
    border: none;
    color: #ff6b6b;
    cursor: pointer;
    font-size: 1.1em;
}
.delete-btn-small:hover {
    color: #ff0000;
}
.draggable-item {
  cursor: grab;
}
.drag-handle { cursor:grab; margin-right:10px; color: var(--color-text-muted); }
.draggable-item:active {
  cursor: grabbing;
}
.empty-list-container { padding:20px; text-align:center; color: var(--color-text-muted); font-style:italic; }
.initiative-buttons {
  display: flex;
  gap: 8px;
}
.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1em;
}
.turn-status-panel { margin-top:20px; background: var(--color-surface); padding:15px; border-radius: var(--radius-md); border:1px solid var(--color-border); text-align:center; width:100%; max-width:400px; box-shadow: var(--elev-1); }
.turn-status-panel h3 { margin-top:0; color: var(--color-accent); font-family: var(--font-display); letter-spacing:.5px; }
.initiative-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    /* ... */
}
.entry-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
}
.character-name {
    font-weight: bold;
}
.movement-info { font-size:0.75em; color: var(--color-text-muted); opacity:0.85; }
.dm-initiative-float {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 60; /* above map, below toolbars if needed */
}

@media (max-width: 1024px) {
  .table-view-layout { padding: 12px; }
  .dm-panel { right: 12px; top: 12px; width: min(92vw, 420px); }
  /* maintain default viewport height rules */
}

@media (max-width: 900px) {
  .dm-panel { position: fixed; left: 10px; right: 10px; top: 10px; width: auto; max-height: calc(100dvh - 20px); }
  .battlemap-main { padding-bottom: 80px; } /* breathing room for docked toolbar */
}
</style>