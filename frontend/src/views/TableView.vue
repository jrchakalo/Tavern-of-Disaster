<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';

import { storeToRefs } from 'pinia';
import { authToken, currentUser } from '../services/authService';
import { toast } from '../services/toast';
import { socketService } from '../services/socketService';
import { fetchAssetUsage, type AssetUsage } from '../services/storageService';
import { API_BASE_URL } from '../services/apiBase';
import { clampGridPoint, pixelToGrid } from '../services/gridGeometry';
import { useTableStore } from '../stores/tableStore';
import { useCharacterStore } from '../stores/characterStore';
import { useSystemStore } from '../stores/systemStore';
import { useUserStore } from '../stores/userStore';
import { useMediaStore } from '../stores/mediaStore';
import { useChatStore } from '../stores/chatStore';

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
import DMPanel, { type DmPanelTab } from '../components/table/DMPanel.vue';
import type { SceneCreatePayload } from '../components/SceneManager.vue';
import MediaDock from '../components/media/MediaDock.vue';
import ParticipantGrid from '../components/media/ParticipantGrid.vue';
import ChatPanel from '../components/chat/ChatPanel.vue';
import ChatToggle from '../components/chat/ChatToggle.vue';
import BaseDialog from '../components/ui/BaseDialog.vue';
import BaseSheet from '../components/ui/BaseSheet.vue';
import { readSessionExtras } from '../components/play/sessionMeta';
import { mergeCharacterSummary } from '../components/character/summary';

import type { GridSquare, TokenInfo, IScene, IInitiativeEntry, TokenSize, Character, DiceRolledPayload, SystemDTO } from '../types';

type MeasurementTool = 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
type ToolMode = MeasurementTool | 'select' | 'none';
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
// Auras dialog state
const showAuraDialog = ref(false);
const auraDialogTokenId = ref<string | null>(null);
const assetUsage = ref<AssetUsage | null>(null);
const sceneLoadError = ref('');
const isSceneImageLoading = ref(false);
const isDmPanelCollapsed = ref(false);
type GridSurfaceExpose = { $el: HTMLElement };
const gridSurfaceRef = ref<GridSurfaceExpose | null>(null);
const mapImgRef = ref<HTMLImageElement | null>(null);
const imageRenderedWidth = ref<number | null>(null);
const imageRenderedHeight = ref<number | null>(null);
const isMobileLayout = ref(false);
const isMobilePanelOpen = ref(false);
const isMobileToolsOpen = ref(false);
const activePanelTab = ref<DmPanelTab>('scene');
let panelTabInitialized = false;
let userChangedPanelTab = false;
const MOBILE_BREAKPOINT = 1023;
let layoutMediaQuery: MediaQueryList | null = null;
// Modo persistente: próxima medição vira persistente
const persistentMode = ref<boolean>(false);
// Colocação de token: toque/clique no quadrado e depois o formulário.
const placementMode = ref(false);
const roundNumber = ref(1);
const pendingSessionEnd = ref(false);
const sessionMenuRef = ref<HTMLDetailsElement | null>(null);
const railTabButtonRefs = ref<HTMLButtonElement[]>([]);

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

function setGridSurfaceInstance(instance: GridSurfaceExpose | null) {
  gridSurfaceRef.value = instance;
}

function updateLayoutFlags() {
  if (!layoutMediaQuery) {
    layoutMediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
  }
  const matches = layoutMediaQuery.matches;
  isMobileLayout.value = matches;
  if (!matches) {
    isMobilePanelOpen.value = false;
    isMobileToolsOpen.value = false;
  }
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
const systemStore = useSystemStore();
const characterStore = useCharacterStore();
const userStore = useUserStore();
const mediaStore = useMediaStore();
const chatStore = useChatStore();

const { profile } = storeToRefs(userStore);
const { selectedCharacterId: selectedCharacterStoreId } = storeToRefs(characterStore);
const {
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
  clockSkewMs,
  userMeasurementColors,
  isDM,
  activeScene,
  tokensOnMap,
  currentTurnTokenId,
  myActiveToken,
  logs,
  characters: characterSummaries,
} = storeToRefs(tableStore);

const characterFetchScope = ref<'player' | 'dm'>('player');
// O DM precisa de TODAS as fichas da mesa para abrir qualquer ficha pela
// iniciativa (§8.2); jogadores seguem com as próprias.
watch(
  isDM,
  (value) => {
    characterFetchScope.value = value ? 'dm' : 'player';
  },
  { immediate: true },
);
const activeCharacterId = ref<string | null>(null);
const showCharacterSheet = ref(false);
const showActionLog = ref(false);
const showDicePopup = ref(false);
const diceAnimationVisible = ref(false);
const diceAnimationPayload = ref<DiceRolledPayload | null>(null);
const diceAnimationId = ref(0);
const DICE_ANIMATION_DURATION = 4600;

const charactersForTable = computed(() => (tableId ? characterStore.charactersForTable(tableId) : []));

// Presença lida de forma defensiva (a store pode não expor `presence` em mocks).
const sessionExtras = computed(() => readSessionExtras(tableStore));
const displayConnected = computed(
  () => sessionExtras.value.presence?.some((entry) => entry.role === 'DISPLAY') ?? false,
);

const tableName = computed(() => currentTable.value?.name || 'Mesa');
const dmId = computed(() => currentTable.value?.dm?._id || '');
const ownerOptions = computed(() => {
  const dm = currentTable.value?.dm;
  const players = (currentTable.value?.players ?? []).filter((player) => player._id !== dm?._id);
  return [...(dm ? [dm] : []), ...players];
});

const presenceEntries = computed(() => {
  const seen = new Set<string>();
  return (sessionExtras.value.presence ?? []).filter((entry) => {
    if (entry.role === 'DISPLAY') return false;
    if (seen.has(entry.userId)) return false;
    seen.add(entry.userId);
    return true;
  });
});
const connectedPlayerCount = computed(
  () => presenceEntries.value.filter((entry) => entry.role === 'DM' || entry.role === 'PLAYER').length,
);
const presenceSummary = computed(() => {
  const count = connectedPlayerCount.value;
  const tv = displayConnected.value ? 'TV ligada' : 'TV desligada';
  return `${count} on-line · ${tv}`;
});

function presenceRoleLabel(role: string): string {
  if (role === 'DM') return 'Mestre';
  if (role === 'DISPLAY') return 'TV';
  if (role === 'SPECTATOR') return 'Espectador';
  return 'Jogador';
}

const statusLabel = computed(() => {
  switch (sessionStatus.value) {
    case 'LIVE':
      return 'Ao vivo';
    case 'PAUSED':
      return 'Pausado';
    case 'ENDED':
      return 'Encerrado';
    default:
      return 'Preparando';
  }
});
const statusTone = computed(() => sessionStatus.value.toLowerCase());

const sceneIndex = computed(
  () => scenes.value.findIndex((scene) => scene._id === activeSceneId.value),
);
const canGoPrevScene = computed(() => sceneIndex.value > 0);
const canGoNextScene = computed(
  () => sceneIndex.value >= 0 && sceneIndex.value < scenes.value.length - 1,
);
const isBattlemapScene = computed(() => activeScene.value?.type !== 'image');

const currentTurnEntry = computed(
  () => initiativeList.value.find((entry) => entry.isCurrentTurn) ?? null,
);
const currentTurnToken = computed(() => {
  const tokenId = currentTurnTokenId.value;
  if (!tokenId) return null;
  return tokensOnMap.value.find((token) => token._id === tokenId) ?? null;
});
const currentTurnMovement = computed(() => {
  const token = currentTurnToken.value;
  if (!token) return '';
  const mps = metersPerSquare.value || 1.5;
  const remaining = Math.max(0, token.remainingMovement);
  const total = Math.max(0, token.movement);
  return `${remaining.toFixed(1)} m de ${total.toFixed(1)} m (${Math.floor(remaining / mps)} de ${Math.floor(total / mps)} quad)`;
});
const editedTokenInTurn = computed(
  () => Boolean(tokenBeingEdited.value && initiativeList.value.some((entry) => entry.tokenId === tokenBeingEdited.value!._id)),
);

watch(
  () => [currentTable.value?._id, sessionStatus.value] as const,
  ([tableIdValue, status]) => {
    if (!tableIdValue || panelTabInitialized) return;
    activePanelTab.value = status === 'LIVE' || status === 'PAUSED' ? 'initiative' : 'scene';
    panelTabInitialized = true;
  },
  { immediate: true },
);

watch(sessionStatus, (status, previous) => {
  if (status === 'LIVE' && previous !== 'LIVE' && !userChangedPanelTab) {
    activePanelTab.value = 'initiative';
  }
});

// Rodada derivada: o protocolo ainda não envia o número da rodada; contamos
// quando o turno volta ao primeiro item da ordem. O rótulo é informativo.
watch(currentTurnTokenId, (nextId, previousId) => {
  if (!initiativeList.value.length) {
    roundNumber.value = 1;
    return;
  }
  const index = initiativeList.value.findIndex((entry) => entry.isCurrentTurn);
  if (!nextId) {
    roundNumber.value = 1;
    return;
  }
  if (previousId && previousId !== nextId && index === 0) {
    roundNumber.value += 1;
  }
});
watch(
  () => initiativeList.value.length,
  (length) => { if (!length) roundNumber.value = 1; },
);

// Mensagens de sistema locais do chat: presença e novas rolagens. O helper da
// store faz a linha de base e evita repetição em reconexão.
watch(
  () => sessionExtras.value.presence ?? [],
  (presence) => chatStore.trackPresence(presence, currentUser.value?.id ?? null),
  { immediate: true },
);
watch(
  () => tableStore.recentRolls ?? [],
  (rolls) => chatStore.trackRolls(rolls),
  { immediate: true },
);
const activeCharacter = computed(() => {
  let base: Character | null = null;
  if (activeCharacterId.value) {
    base = charactersForTable.value.find((char) => char._id === activeCharacterId.value) || null;
  } else if (tableId) {
    base = characterStore.selectedCharacter(tableId);
  }
  if (!base) return null;
  // PV/CA alterados por OUTRO cliente chegam só no resumo canônico
  // (sessionPatch.characterUpdates); mescla para a ficha aberta convergir.
  const summary = (characterSummaries?.value ?? []).find((entry) => entry._id === base!._id);
  return mergeCharacterSummary(base, summary);
});
const isActiveCharacterOwner = computed(() => {
  const character = activeCharacter.value;
  return Boolean(character && character.ownerId === currentUser.value?.id);
});
const currentSystem = computed(() => {
  const tableSystem = systemStore.currentSystemForTable(currentTable.value);
  if (tableSystem) return tableSystem;
  const preferredId = profile.value?.preferredSystemId;
  return preferredId ? systemStore.getById(preferredId) : null;
});

// Seleção de sistema da mesa (DM): lista do systemStore + PUT /tables/:id/system.
const systemOptions = computed(() => (systemStore.systems ?? []) as SystemDTO[]);
const selectedSystemId = computed(() => currentTable.value?.systemId ?? '');

async function handleSystemChange(value: string | Event) {
  if (!tableId) return;
  const systemId = (typeof value === 'string' ? value : (value.target as HTMLSelectElement | null)?.value) || null;
  try {
    const response = await fetch(`${API_BASE_URL}/api/tables/${tableId}/system`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken.value}`,
      },
      body: JSON.stringify({ systemId }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(data.message || 'Não foi possível atualizar o sistema da mesa.');
    }
    const system = systemOptions.value.find((entry) => entry._id === systemId) ?? null;
    if (currentTable.value) {
      // Aplicação local imediata; o snapshot canônico reafirma no próximo resync.
      currentTable.value = {
        ...currentTable.value,
        systemId: system?._id ?? null,
        systemKey: system?.key ?? null,
        systemName: system?.name ?? null,
      };
    }
    toast.success(system ? `Sistema da mesa: ${system.name}.` : 'Sistema removido da mesa.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar o sistema.';
    toast.error(message);
  }
}
const sharedMeasurementList = computed(() => Object.values(sharedMeasurements.value));
const logCount = computed(() => logs.value.length);

systemStore.fetchAll().catch((error) => {
  console.warn('[table] não foi possível carregar sistemas', error);
});

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

let intervalId: number | null = null;
let diceAnimationTimer: number | null = null;
let offChatMessage: (() => void) | null = null;
onMounted(() => {
  intervalId = window.setInterval(() => { nowTs.value = Date.now(); }, 500);
  tableStore.registerDiceAnimationHook(triggerDiceAnimation);
  // Chat: listener ativo mesmo com o painel fechado (badge de não lidas).
  offChatMessage = socketService.onChatEvent('chatMessage', (message) => chatStore.receive(message));
  if (typeof offChatMessage !== 'function') offChatMessage = null;
  void chatStore.loadHistory(tableId);
  if (!profile.value) {
    userStore.fetchProfile().catch((error) => {
      console.warn('[table] não foi possível carregar perfil', error);
    });
  }
});
onUnmounted(() => {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  tableStore.registerDiceAnimationHook(null);
  dismissDiceAnimation();
  offChatMessage?.();
  offChatMessage = null;
  chatStore.reset();
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

function normalizeHexColor(value?: string | null) {
  if (!value) return '';
  return value.startsWith('#') ? value : `#${value}`;
}

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
  const profileColor = profile.value?.measurementColor;
  if (profileColor) {
    const normalizedProfileColor = normalizeHexColor(profileColor);
    measurementColor.value = normalizedProfileColor;
    localStorage.setItem(key, normalizedProfileColor);
    return;
  }
  // Escolhe cor aleatória não-roxa
  const random = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)] || '#ff8c00';
  measurementColor.value = random;
  localStorage.setItem(key, random);
}

// Inicializa e atualiza quando papel/cena muda
watch([isDM, activeSceneId, () => profile.value?.measurementColor], () => {
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
    return await characterStore.fetchForTable(tableId, { scope: characterFetchScope.value });
  } catch (error) {
    console.error('[characters] falha ao carregar', error);
    const message = error instanceof Error ? error.message : 'Não foi possível carregar as fichas.';
    toast.error(message);
  }
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

watch(characterFetchScope, () => {
  fetchCharactersForTable();
}, { immediate: true });

watch(
  () => charactersForTable.value.map((char) => char._id).join(','),
  () => {
    if (activeCharacterId.value && !charactersForTable.value.some((char) => char._id === activeCharacterId.value)) {
      closeCharacterSheet();
    }
  }
);

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
  if (!sceneId) return;
  void handleActivateScene(sceneId).catch(() => undefined);
}

function goToPreviousScene() {
  if (!canGoPrevScene.value) return;
  const previous = scenes.value[sceneIndex.value - 1];
  if (previous) handleSetActiveScene(previous._id);
}

function goToNextScene() {
  if (!canGoNextScene.value) return;
  const next = scenes.value[sceneIndex.value + 1];
  if (next) handleSetActiveScene(next._id);
}

function applySessionStatus(newStatus: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED') {
  const options: { pauseSeconds?: number } = {};
  if (newStatus === 'PAUSED') options.pauseSeconds = Math.max(0, Math.floor((pauseInput.value * 60) || 0));
  void socketService.updateSessionStatus(tableId, newStatus, options).then((ack) => {
    if (!ack.ok) {
      toast.error(ack.error.message || 'Não foi possível mudar o estado da sessão.');
    }
  });
}

function handleUpdateSessionStatus(newStatus: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED') {
  // A confirmação de “Encerrar” vive no DMSessionControls; o menu da top bar
  // usa requestEndSession, que abre o diálogo compartilhado abaixo.
  applySessionStatus(newStatus);
}

function requestEndSession() {
  closeSessionMenu();
  pendingSessionEnd.value = true;
}

function confirmEndSession() {
  pendingSessionEnd.value = false;
  applySessionStatus('ENDED');
}

async function startSessionWithTransition() {
  closeSessionMenu();
  // dispara transição para todos por ~3s e muda status para LIVE após isso
  socketService.startTransition(tableId, 3000);
  showTransition.value = true;
  // tenta tocar o vídeo local também
  setTimeout(() => { transitionVideoRef.value?.play?.(); }, 0);
  await new Promise(res => setTimeout(res, 3000));
  showTransition.value = false;
  applySessionStatus('LIVE');
}

function closeSessionMenu() {
  if (sessionMenuRef.value) sessionMenuRef.value.open = false;
}

function selectPanelTab(tab: DmPanelTab) {
  userChangedPanelTab = true;
  activePanelTab.value = tab;
  isDmPanelCollapsed.value = false;
}

async function onRailTabKeydown(event: KeyboardEvent, index: number) {
  const tabs: DmPanelTab[] = ['scene', 'initiative', 'session', 'invite'];
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  let nextIndex = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  const tab = tabs[nextIndex];
  if (!tab) return;
  selectPanelTab(tab);
  await nextTick();
  railTabButtonRefs.value[nextIndex]?.focus();
}

function openInviteTab() {
  userChangedPanelTab = true;
  activePanelTab.value = 'invite';
  isDmPanelCollapsed.value = false;
  closeSessionMenu();
  showActionLog.value = false;
  chatStore.closePanel();
  if (isMobileLayout.value) isMobilePanelOpen.value = true;
}

function openMobilePanel(tab: DmPanelTab = activePanelTab.value) {
  activePanelTab.value = tab;
  isMobilePanelOpen.value = true;
  isMobileToolsOpen.value = false;
  showActionLog.value = false;
  chatStore.closePanel();
}

function openMobileTools() {
  isMobileToolsOpen.value = true;
  isMobilePanelOpen.value = false;
  showActionLog.value = false;
  chatStore.closePanel();
}

function handleToolSelectedFromSheet(tool: ToolMode) {
  handleToolSelected(tool);
  isMobileToolsOpen.value = false;
}

function handleDiceFromSheet() {
  toggleDicePopup();
  isMobileToolsOpen.value = false;
}

function startTokenPlacement() {
  if (!isDM.value) return;
  if (!activeSceneId.value) {
    toast.warning('Ative uma cena antes de colocar um token.');
    return;
  }
  if (!isBattlemapScene.value) {
    toast.warning('Troque para uma cena de batalha para colocar tokens.');
    return;
  }
  placementMode.value = true;
  selectedTokenId.value = null;
  isMobilePanelOpen.value = false;
  isMobileToolsOpen.value = false;
}

function cancelTokenPlacement() {
  placementMode.value = false;
}

function chooseFirstFreeSquare() {
  if (!activeSceneId.value) return;
  const free = squares.value.find((square) => !square.token);
  if (!free) {
    toast.warning('Não há quadrado livre na grade.');
    return;
  }
  targetSquareIdForToken.value = free.id;
  placementMode.value = false;
  showTokenForm.value = true;
}

// Toggle vindo da Toolbar para fixar medições
function handleTogglePersistent(on: boolean) { persistentMode.value = on; }

function handleColorSelected(color: string) {
  measurementColor.value = color;
}

function toggleActionLog() {
  const willOpen = !showActionLog.value;
  showActionLog.value = willOpen;
  if (willOpen) {
    chatStore.closePanel();
    isMobilePanelOpen.value = false;
    isMobileToolsOpen.value = false;
  }
}

function toggleChat() {
  if (chatStore.panelOpen) {
    chatStore.closePanel();
  } else {
    chatStore.openPanel();
    showActionLog.value = false;
    isMobilePanelOpen.value = false;
    isMobileToolsOpen.value = false;
  }
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

async function refreshAssetUsage() {
  if (!tableId || !isDM.value) return;
  try {
    assetUsage.value = await fetchAssetUsage(tableId);
  } catch (error) {
    // Uso é informativo: não bloqueia o painel, mas fica registrado no console.
    console.warn('[assets] não foi possível consultar o uso de armazenamento', error);
  }
}

// O uso é carregado quando a aba Cena fica visível (painel dockado ou folha
// mobile) e novamente depois de cada upload.
watch(
  [() => activePanelTab.value, () => isMobilePanelOpen.value, () => isDmPanelCollapsed.value, () => isMobileLayout.value, () => isDM.value],
  () => {
    if (!isDM.value) return;
    const tabVisible = activePanelTab.value === 'scene';
    const scenesVisible = isMobileLayout.value
      ? isMobilePanelOpen.value && tabVisible
      : !isDmPanelCollapsed.value && tabVisible;
    if (scenesVisible) {
      refreshAssetUsage();
    }
  },
  { immediate: true },
);

async function handleApplyGrid(value: { width: number; height: number; metersPerSquare: number }) {
  if (!activeSceneId.value) {
    toast.warning('Nenhuma cena ativa para aplicar a grade.');
    return;
  }
  const gridAck = await socketService.updateGridDimensions(
    tableId,
    activeSceneId.value,
    value.width,
    value.height,
  );
  if (!gridAck.ok) {
    toast.error(gridAck.error.message || 'Não foi possível aplicar a grade.');
    return;
  }
  const scaleAck = await socketService.updateSceneScale(
    tableId,
    activeSceneId.value,
    value.metersPerSquare,
  );
  if (!scaleAck.ok) {
    toast.error(scaleAck.error.message || 'A grade mudou, mas a escala não foi aplicada.');
    return;
  }
  toast.success('Grade aplicada.');
}

function handleMapImageLoad() {
  isSceneImageLoading.value = false;
  sceneLoadError.value = '';
  updateImageDimensions();
}

function handleMapImageError() {
  isSceneImageLoading.value = false;
  sceneLoadError.value = 'Não foi possível carregar a imagem da cena. Verifique a URL ou envie o arquivo novamente.';
}

function onSceneDragEnd() {
  const orderedSceneIds = scenes.value.map((scene) => scene._id);
  void socketService.reorderScenes(tableId, orderedSceneIds).then((ack) => {
    if (!ack.ok) {
      toast.error(ack.error.message || 'Não foi possível salvar a ordem das cenas.');
    }
  });
}

function onSceneReorder(updatedScenes: IScene[]) {
  scenes.value = [...updatedScenes];
  onSceneDragEnd();
}

function createToken(payload: { name: string; imageUrl?: string; movement: number; ownerId?: string; size: TokenSize; canOverlap?: boolean; characterId?: string | null }) {
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
    void socketService
      .placeToken({ tableId, sceneId: activeSceneId.value, squareId: targetSquareIdForToken.value, ...payload })
      .then((ack) => { if (ack.ok) toast.success('Token criado.'); });
  }
  // Fecha o formulário
  showTokenForm.value = false;
  targetSquareIdForToken.value = null;
  placementMode.value = false;
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
  if (!activeSceneId.value) return;
  void socketService
    .removeFromInitiative({ tableId, sceneId: activeSceneId.value, initiativeEntryId })
    .then((ack) => {
      if (ack.ok) toast.success('Removido do turno. O token continua no mapa.');
    });
}

function handleResetInitiative() {
  if (!activeSceneId.value) return;
  void socketService
    .resetInitiative(tableId, activeSceneId.value)
    .then((ack) => {
      if (ack.ok) toast.success('Combate resetado. Tokens permanecem no mapa.');
    });
}

async function handleSaveTokenEdit(payload: { name?: string; movement?: number; imageUrl?: string; ownerId?: string; size?: TokenSize; resetRemainingMovement?: boolean; canOverlap?: boolean; characterId?: string | null }) {
  if (!tokenBeingEdited.value) return;
  const ack = await socketService.editToken({ tableId, tokenId: tokenBeingEdited.value._id, ...payload });
  if (!ack.ok) return;
  toast.success('Token atualizado.');
  showTokenEditForm.value = false;
  tokenBeingEdited.value = null;
}

async function handleAddEditedTokenToTurn() {
  if (!tokenBeingEdited.value || !activeSceneId.value) return;
  const ack = await socketService.addTokenToInitiative({
    tableId,
    sceneId: activeSceneId.value,
    tokenId: tokenBeingEdited.value._id,
  });
  if (ack.ok) toast.success('Token adicionado ao turno.');
}

async function handleRemoveEditedTokenFromTurn() {
  if (!tokenBeingEdited.value || !activeSceneId.value) return;
  const entry = initiativeList.value.find((item) => item.tokenId === tokenBeingEdited.value!._id);
  if (!entry) return;
  const ack = await socketService.removeFromInitiative({
    tableId,
    sceneId: activeSceneId.value,
    initiativeEntryId: entry._id,
  });
  if (ack.ok) toast.success('Token removido do turno. Ele continua no mapa.');
}

async function handleDeleteEditedToken() {
  if (!tokenBeingEdited.value) return;
  const ack = await socketService.deleteToken({ tableId, tokenId: tokenBeingEdited.value._id });
  if (!ack.ok) return;
  toast.success('Token excluído.');
  showTokenEditForm.value = false;
  tokenBeingEdited.value = null;
}

function handleOpenTokenInspector(tokenId: string) {
  const token = tokensOnMap.value.find((entry) => entry._id === tokenId) ?? null;
  if (!token) return;
  selectedTokenId.value = token._id;
  tokenBeingEdited.value = token;
  showTokenEditForm.value = true;
  isMobilePanelOpen.value = false;
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

  if (isDM.value && placementMode.value) {
    if (square.token) {
      toast.warning('Este quadrado já tem um token. Escolha um livre.');
      return;
    }
    targetSquareIdForToken.value = square.id;
    placementMode.value = false;
    showTokenForm.value = true;
    return;
  }

  if (square.token) {
    const alreadySelected = selectedTokenId.value === square.token._id;
    selectedTokenId.value = alreadySelected ? null : square.token._id;
    if (isDM.value && !alreadySelected) {
      tokenBeingEdited.value = square.token;
      showTokenEditForm.value = true;
    }
  } else {
    selectedTokenId.value = null;
  }
}


const handleMiddleClickFree: MiddleClickHandler = (event) => {
  if (event.button !== 1 || !activeSceneId.value) return;
  // Rate limit ping
  if (handleMiddleClickFree.lastTriggerTs && Date.now() - handleMiddleClickFree.lastTriggerTs < 300) return;
  handleMiddleClickFree.lastTriggerTs = Date.now();
  // O payload do ping é sempre unidade de grade (Fase 2): o pixel local é
  // convertido com `gridGeometry` antes de sair daqui.
  const mapStage = event.currentTarget as HTMLElement;
  const gridEl =
    (mapStage.querySelector('.grid-overlay .grid-viewport') as HTMLElement | null) ||
    (mapStage.querySelector('.grid-overlay') as HTMLElement | null);
  if (!gridEl) return; // sem grade mensurável: não envia coordenada inválida
  const rect = gridEl.getBoundingClientRect();
  const scale = viewTransform.value.scale || 1;
  const cols = Math.max(1, gridWidth.value);
  const squareSize = rect.width / scale / cols;
  if (!Number.isFinite(squareSize) || squareSize <= 0) return;
  const local = { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  const gridPoint = clampGridPoint(pixelToGrid(local, squareSize), gridWidth.value, gridHeight.value);
  socketService.sendPing({ tableId, sceneId: activeSceneId.value, x: gridPoint.x, y: gridPoint.y, color: measurementColor.value || (isDM.value ? '#3c096c' : '#ff8c00') });
};

// Mestre altera escala; jogadores recebem
// A grade e a escala são aplicadas explicitamente em `handleApplyGrid` (aba Cena),
// evitando mutações destrutivas a cada tecla.

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

type SceneApiBody = Partial<IScene> & { message?: string };

async function readSceneResponse(response: Response): Promise<SceneApiBody | null> {
  try {
    return (await response.json()) as SceneApiBody;
  } catch {
    return null;
  }
}

async function handleCreateScene(payload: SceneCreatePayload): Promise<void> {
  if (!tableId) throw new Error('Mesa inválida para criar cena.');
  const response = await fetch(`${API_BASE_URL}/api/tables/${tableId}/scenes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken.value}`,
    },
    body: JSON.stringify({
      name: payload.name,
      imageUrl: payload.imageUrl,
      gridWidth: payload.gridWidth,
      gridHeight: payload.gridHeight,
      type: payload.type,
    }),
  });
  const data = await readSceneResponse(response);
  if (!response.ok) {
    throw new Error(data?.message || 'Não foi possível criar a cena.');
  }
  if (!data?._id) {
    throw new Error('O servidor não retornou a cena criada.');
  }

  const created = data as IScene;
  if (!scenes.value.some((scene) => scene._id === created._id)) {
    scenes.value = [...scenes.value, created];
  }

  // A rota REST de criação não aceita escala; aplicamos pelo socket, que
  // também transmite o estado canônico para os outros clientes.
  if (
    created.type !== 'image' &&
    Math.abs((created.metersPerSquare ?? 1.5) - payload.metersPerSquare) > 0.001
  ) {
    const scaleAck = await socketService.updateSceneScale(
      tableId,
      created._id,
      payload.metersPerSquare,
    );
    if (!scaleAck.ok) {
      toast.warning('Cena criada, mas a escala não foi aplicada. Ajuste em “Aplicar grade”.');
    }
  }

  let activationFailed = false;
  if (payload.activate) {
    const ack = await socketService.setActiveScene(tableId, created._id);
    if (!ack.ok) {
      activationFailed = true;
      toast.warning(
        ack.error.message ||
          'Cena criada, mas não foi possível ativá-la. Use “Ativar” na lista.',
      );
    }
  }

  await refreshAssetUsage();
  if (!activationFailed) {
    toast.success(
      payload.activate
        ? `Cena “${created.name}” criada e ativada.`
        : `Cena “${created.name}” criada.`,
    );
  }
}

async function handleActivateScene(sceneId: string): Promise<void> {
  if (!tableId) throw new Error('Mesa inválida para ativar cena.');
  const ack = await socketService.setActiveScene(tableId, sceneId);
  if (!ack.ok) {
    toast.error(ack.error.message || 'Não foi possível ativar a cena.');
    throw new Error(ack.error.message || 'Não foi possível ativar a cena.');
  }
}

async function handleRenameScene(sceneId: string, name: string): Promise<void> {
  if (!tableId) throw new Error('Mesa inválida para renomear cena.');
  const response = await fetch(`${API_BASE_URL}/api/tables/${tableId}/scenes/${sceneId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken.value}`,
    },
    body: JSON.stringify({ name }),
  });
  const data = await readSceneResponse(response);
  if (!response.ok || !data?._id) {
    throw new Error(data?.message || 'Não foi possível renomear a cena.');
  }
  const index = scenes.value.findIndex((scene) => scene._id === sceneId);
  if (index !== -1) {
    scenes.value[index] = { ...scenes.value[index]!, ...(data as IScene) };
  }
  toast.success('Cena renomeada.');
}

async function handleDeleteScene(sceneId: string): Promise<void> {
  if (!tableId) throw new Error('Mesa inválida para excluir cena.');
  const response = await fetch(`${API_BASE_URL}/api/tables/${tableId}/scenes/${sceneId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${authToken.value}`,
    },
  });
  const data = await readSceneResponse(response);
  if (!response.ok) {
    throw new Error(data?.message || 'Não foi possível excluir a cena.');
  }

  const wasActive = activeSceneId.value === sceneId;
  scenes.value = scenes.value.filter((scene) => scene._id !== sceneId);
  if (wasActive) {
    const next = scenes.value[0];
    if (next) {
      // O servidor já promoveu a próxima cena; se o ack de ativação falhar, o
      // toast do erro acima orienta o Mestre a usar “Ativar” na lista.
      try {
        await handleActivateScene(next._id);
      } catch {
        // feedback já exibido por handleActivateScene
      }
    } else {
      currentMapUrl.value = null;
    }
  }
  await refreshAssetUsage();
  toast.success(data?.message || 'Cena excluída.');
}

// Função para quando um ponteiro (dedo/mouse) toca a tela
function handlePointerDown(event: PointerEvent) {
  const isTouch = event.pointerType === 'touch';
  const isPrimaryButton = event.button === 0;
  const isMiddleButton = event.pointerType === 'mouse' && event.button === 1;
  if (!isTouch && !isPrimaryButton && !isMiddleButton) return;

  if (isMeasuring.value && (isPrimaryButton || isTouch)) {
    if (!gridSurfaceRef.value) return;
    const gridRect = gridSurfaceRef.value.$el.getBoundingClientRect();
    const scale = viewTransform.value.scale || 1;
    const local = {
      x: (event.clientX - gridRect.left) / scale,
      y: (event.clientY - gridRect.top) / scale
    };
    if (activeTool.value === 'ruler') {
      previewMeasurement.value = {
        type: 'ruler',
        start: local,
        end: local,
        distance: '0.0m (0ft)'
      };
    } else if (isMeasurementTool(activeTool.value as ToolMode)) {
      const originSquare = getSquareIdFromLocalPoint(local.x, local.y);
      coneOriginSquareId.value = originSquare;
      const originCenter = originSquare ? getSquareCenterLocalPointFromId(originSquare) : local;
      const measurementType = activeTool.value as MeasurementTool;
      previewMeasurement.value = { type: measurementType, start: originCenter ?? local, end: originCenter ?? local };
      coneAffectedSquares.value = [];
    }
    try { (event.target as HTMLElement).setPointerCapture(event.pointerId); } catch {}
    return;
  }

  if (isMeasuring.value) return;

  const shouldPan = isTouch || isMiddleButton || (isPrimaryButton && activeTool.value !== 'select');
  if (!shouldPan) return;
  if ((event.target as HTMLElement).closest('button, .token')) return;
  activePointers.value.push(event);
  try { viewportRef.value?.setPointerCapture(event.pointerId); } catch {}
  event.preventDefault();
}

// Função para quando um ponteiro se move
function handlePointerMove(event: PointerEvent) {
  // Se a régua estiver ativa e um ponto inicial tiver sido definido, atualiza a linha.
  if (previewMeasurement.value) {
    if (!gridSurfaceRef.value) return;
    const gridRect = gridSurfaceRef.value.$el.getBoundingClientRect();
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
  // Apenas rótulo; contorno é desenhado pelo GridLayer como quadrado centrado na origem
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
    const gridRect = gridSurfaceRef.value!.$el.getBoundingClientRect();
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
    const gridRect = gridSurfaceRef.value!.$el.getBoundingClientRect();
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
    const gridRect = gridSurfaceRef.value!.$el.getBoundingClientRect();
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
    const gridRect = gridSurfaceRef.value!.$el.getBoundingClientRect();
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
        const gridRect = gridSurfaceRef.value!.$el.getBoundingClientRect();
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
        const gridRect = gridSurfaceRef.value!.$el.getBoundingClientRect();
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

    try { (event.target as HTMLElement).releasePointerCapture(event.pointerId); } catch {}
    return;
  }

  // Lógica original de pan & zoom
  activePointers.value = activePointers.value.filter(p => p.pointerId !== event.pointerId);
  if (activePointers.value.length < 2) {
    initialPinchDistance.value = 0;
  }
  try { viewportRef.value?.releasePointerCapture(event.pointerId); } catch {}
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

function handleToolSelected(tool: ToolMode) {
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
  if (!gridSurfaceRef.value) return null;
  const gridRect = gridSurfaceRef.value.$el.getBoundingClientRect();
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
  if (!gridSurfaceRef.value) return null;
  const gridRect = gridSurfaceRef.value.$el.getBoundingClientRect();
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

// A grade é aplicada explicitamente em `handleApplyGrid` (aba Cena).

// Limpa seleção ao trocar de cena ou quando o item selecionado some
watch(activeSceneId, () => {
  selectedPersistentId.value = null;
  // Reset seleção/ferramentas ao trocar cena
  selectedTokenId.value = null;
  showAuraDialog.value = false;
  auraDialogTokenId.value = null;
  persistentMode.value = false;
  placementMode.value = false;
  // Ensure no measuring tool remains active
  activeTool.value = 'none';
});

watch([selectedPersistentId, () => persistentMeasurements.value.length], ([id]) => {
  if (!id) return;
  const stillExists = persistentMeasurements.value.some(pm => pm.id === id);
  if (!stillExists) selectedPersistentId.value = null;
});

onMounted(() => {
  socketService.connect(tableId);
  mediaStore.init();
  // Resize janela -> recalcula dimensões imagem
  window.addEventListener('resize', updateImageDimensions);
  window.addEventListener('keydown', handleGlobalKeydown);
  updateLayoutFlags();
  if (layoutMediaQuery) {
    layoutMediaQuery.addEventListener('change', updateLayoutFlags);
  }
});

onUnmounted(() => {
  // Encerra tracks/PCs e avisa a sala antes de derrubar o socket.
  void mediaStore.leave();
  socketService.disconnect();
  window.removeEventListener('resize', updateImageDimensions);
  window.removeEventListener('keydown', handleGlobalKeydown);
  layoutMediaQuery?.removeEventListener('change', updateLayoutFlags);
  layoutMediaQuery = null;
});

function handleGlobalKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const isTextInput = target ? ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable : false;
  const key = e.key.toLowerCase();

  if (e.key === 'Escape') {
    if (placementMode.value) {
      placementMode.value = false;
      return;
    }
    if (isMobilePanelOpen.value) {
      isMobilePanelOpen.value = false;
      return;
    }
    if (isMobileToolsOpen.value) {
      isMobileToolsOpen.value = false;
      return;
    }
    previewMeasurement.value = null;
    rulerStartPoint.value = null;
    rulerEndPoint.value = null;
    coneOriginSquareId.value = null;
    coneAffectedSquares.value = [];
    if (isMeasuring.value) activeTool.value = 'none';
    return;
  }

  if (isTextInput) return;

  if (key === 'n' && isDM.value) {
    e.preventDefault();
    handleNextTurn();
    return;
  }

  if (key === 't' && isDM.value) {
    e.preventDefault();
    startTokenPlacement();
    return;
  }

  if (key === 'm') {
    e.preventDefault();
    handleToolSelected('ruler');
    return;
  }

  if (key === 'g') {
    e.preventDefault();
    resetView();
  }
}

watch(currentMapUrl, (url) => {
  // Cada troca de URL recomeça o ciclo de carregamento da imagem da cena.
  sceneLoadError.value = '';
  isSceneImageLoading.value = Boolean(url);
  // Recalcula ao trocar imagem
  setTimeout(updateImageDimensions, 50);
}, { immediate: true });

watch(activeSceneId, () => {
  // Trocar de cena sem mudar a URL ainda deve limpar o erro anterior.
  sceneLoadError.value = '';
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
  <div
    class="table-view-layout"
    :class="{
      'is-mobile': isMobileLayout,
      'is-dm': isDM,
      'is-player': !isDM,
      'panel-collapsed': isDmPanelCollapsed && isDM && !isMobileLayout,
    }"
  >
    <header class="cockpit-topbar">
      <RouterLink to="/tables" class="topbar-back" aria-label="Voltar para Mesas">
        <Icon name="exit" :size="18" aria-hidden="true" />
        <span class="topbar-back__label">Mesas</span>
      </RouterLink>

      <div class="topbar-identity">
        <h1 class="topbar-title" :title="tableName">{{ tableName }}</h1>
        <div v-if="isDM" class="scene-switch" aria-label="Cena ativa">
          <span class="scene-switch__label">Cena</span>
          <button
            type="button"
            class="scene-switch__button"
            aria-label="Cena anterior"
            :disabled="!canGoPrevScene"
            @click="goToPreviousScene"
          >
            <Icon name="chevronLeft" :size="16" aria-hidden="true" />
          </button>
          <strong class="scene-switch__name" :title="activeScene?.name || 'Nenhuma cena ativa'">
            {{ activeScene?.name || 'Nenhuma cena ativa' }}
          </strong>
          <button
            type="button"
            class="scene-switch__button"
            aria-label="Próxima cena"
            :disabled="!canGoNextScene"
            @click="goToNextScene"
          >
            <Icon name="chevronRight" :size="16" aria-hidden="true" />
          </button>
        </div>
        <p v-else class="topbar-scene" :title="activeScene?.name || 'Nenhuma cena ativa'">
          {{ activeScene?.name || 'Nenhuma cena ativa' }}
        </p>
      </div>

      <div class="topbar-status">
        <span class="status-chip" :class="`status-${statusTone}`" role="status">{{ statusLabel }}</span>

        <span
          class="connection-indicator"
          :class="['status-' + connectionStatus, { degraded: isConnectionDegraded }]"
          :title="connectionLabel"
        >
          <span class="dot" aria-hidden="true"></span>
          <span class="connection-label">{{ connectionLabel }}</span>
        </span>

        <details class="presence-menu">
          <summary class="presence-summary" :aria-label="`Presença: ${presenceSummary}`">
            <span class="presence-dot" :class="{ offline: !connectedPlayerCount && !displayConnected }" aria-hidden="true"></span>
            <span class="presence-text">{{ presenceSummary }}</span>
            <span class="presence-compact" aria-hidden="true">{{ connectedPlayerCount }} · {{ displayConnected ? 'TV on' : 'TV off' }}</span>
          </summary>
          <div class="presence-panel">
            <p v-if="!presenceEntries.length && !displayConnected" class="presence-empty">Ninguém conectado.</p>
            <ul v-else class="presence-list">
              <li v-for="entry in presenceEntries" :key="entry.userId">
                <span>{{ entry.username }}</span>
                <span class="presence-role">{{ presenceRoleLabel(entry.role) }}</span>
              </li>
              <li v-if="displayConnected">
                <span>TV</span>
                <span class="presence-role">Conectada</span>
              </li>
            </ul>
          </div>
        </details>
      </div>

      <div v-if="isDM" class="topbar-actions">
        <button type="button" class="btn btn-sm" @click="openInviteTab">
          <Icon name="copy" :size="16" aria-hidden="true" />
          <span class="topbar-action-label">Convidar</span>
        </button>

        <details ref="sessionMenuRef" class="session-menu">
          <summary class="btn btn-sm alt session-menu__summary">
            Sessão
            <span aria-hidden="true">▾</span>
          </summary>
          <div class="session-menu__panel" role="menu" aria-label="Ações da sessão">
            <button
              v-if="sessionStatus === 'ENDED'"
              type="button"
              role="menuitem"
              @click="closeSessionMenu(); applySessionStatus('PREPARING')"
            >Reabrir sessão</button>
            <button
              v-if="sessionStatus === 'PREPARING'"
              type="button"
              role="menuitem"
              @click="startSessionWithTransition"
            >Iniciar sessão</button>
            <button
              v-if="sessionStatus === 'LIVE'"
              type="button"
              role="menuitem"
              @click="closeSessionMenu(); applySessionStatus('PAUSED')"
            >Pausar sessão</button>
            <button
              v-if="sessionStatus === 'PAUSED'"
              type="button"
              role="menuitem"
              @click="closeSessionMenu(); applySessionStatus('LIVE')"
            >Retomar sessão</button>
            <hr />
            <button
              type="button"
              role="menuitem"
              @click="selectPanelTab('session'); closeSessionMenu()"
            >Abrir aba Sessão</button>
            <button
              v-if="sessionStatus === 'LIVE' || sessionStatus === 'PAUSED'"
              type="button"
              role="menuitem"
              class="danger-item"
              @click="requestEndSession"
            >Encerrar sessão…</button>
          </div>
        </details>
      </div>

      <button
        v-if="isDM && isMobileLayout"
        type="button"
        class="btn btn-sm topbar-panel-btn dm-drawer-toggle"
        aria-haspopup="dialog"
        @click="openMobilePanel()"
      >Painel</button>
    </header>

    <div class="cockpit-body">
      <nav v-if="isDM && !isMobileLayout" class="tool-rail" aria-label="Painéis e ferramentas do Mestre">
        <button type="button" class="rail-add" @click="startTokenPlacement">
          <Icon name="plus" :size="18" aria-hidden="true" />
          <span>＋ Token</span>
        </button>

        <div class="rail-tabs" role="tablist" aria-orientation="vertical" aria-label="Painéis do Mestre">
          <button
            v-for="(tab, index) in [
              { key: 'scene', label: 'Cena', icon: 'book' },
              { key: 'initiative', label: 'Iniciativa', icon: 'users' },
              { key: 'session', label: 'Sessão', icon: 'info' },
              { key: 'invite', label: 'Convidar', icon: 'copy' },
            ]"
            :key="tab.key"
            :ref="(el) => { if (el) railTabButtonRefs[index] = el as HTMLButtonElement; }"
            type="button"
            role="tab"
            class="rail-tab"
            :class="{ 'is-active': activePanelTab === tab.key }"
            :id="`rail-tab-${tab.key}`"
            :aria-selected="activePanelTab === tab.key"
            :aria-controls="isDmPanelCollapsed ? undefined : `dm-tabpanel-${tab.key}`"
            :tabindex="activePanelTab === tab.key ? 0 : -1"
            @click="selectPanelTab(tab.key as DmPanelTab)"
            @keydown="onRailTabKeydown($event, index)"
          >
            <Icon :name="tab.icon" :size="18" aria-hidden="true" />
            <span>{{ tab.label }}</span>
          </button>
        </div>

        <hr class="rail-divider" />

        <Toolbar
          variant="rail"
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
      </nav>

      <section class="board-zone" aria-label="Tabuleiro">
        <div v-if="canUseMap" class="turn-bar" role="status" aria-live="polite">
          <div class="turn-bar__scene">
            <span class="turn-bar__eyebrow">Cena</span>
            <strong :title="activeScene?.name || 'Nenhuma cena ativa'">{{ activeScene?.name || 'Nenhuma cena ativa' }}</strong>
          </div>
          <div class="turn-bar__actor" :class="{ 'is-empty': !currentTurnEntry }">
            <span v-if="currentTurnEntry" class="turn-dot" aria-hidden="true"></span>
            <template v-if="currentTurnEntry">
              <span class="turn-bar__label">Turno de</span>
              <strong :title="currentTurnEntry.characterName">{{ currentTurnEntry.characterName }}</strong>
              <span v-if="currentTurnMovement" class="turn-bar__movement">{{ currentTurnMovement }}</span>
            </template>
            <span v-else class="turn-bar__label">Nenhum turno ativo</span>
            <span v-if="roundNumber > 0 && initiativeList.length" class="turn-bar__round">Rodada {{ roundNumber }}</span>
          </div>
          <div v-if="isDM" class="turn-bar__actions">
            <button
              type="button"
              class="btn btn-xs btn-ghost"
              :disabled="!currentTurnTokenId"
              @click="handleUndoMove"
            >Desfazer</button>
            <button
              type="button"
              class="btn btn-xs"
              :disabled="!initiativeList.length"
              @click="handleNextTurn"
            >Passar turno</button>
          </div>
        </div>

        <div v-if="placementMode" class="placement-banner" role="status" aria-live="polite">
          <Icon name="plus" :size="18" aria-hidden="true" />
          <span>Toque ou clique em um quadrado livre para colocar o token.</span>
          <span class="placement-banner__actions">
            <button type="button" class="btn btn-xs alt" @click="chooseFirstFreeSquare">Usar primeiro livre</button>
            <button type="button" class="btn btn-xs btn-ghost" @click="cancelTokenPlacement">Cancelar</button>
          </span>
        </div>

        <div class="board-wrap">
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
            :players="ownerOptions"
            :map-image-ref-setter="setMapImageEl"
            :viewport-ref-setter="setViewportEl"
            :grid-surface-ref-setter="setGridSurfaceInstance"
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
            :on-image-load="handleMapImageLoad"
            :on-image-error="handleMapImageError"
            :on-assign-token="handleAssignToken"
            :on-close-assign-menu="closeAssignMenu"
            :on-open-character-from-token="handleOpenCharacterFromToken"
          />
          <div
            v-else-if="!isDM && (sessionStatus === 'PREPARING' || sessionStatus === 'PAUSED' || sessionStatus === 'ENDED')"
            class="session-overlay"
            :class="`mode-${sessionStatus.toLowerCase()}`"
          >
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

          <div
            v-if="canUseMap && currentMapUrl && isSceneImageLoading"
            class="scene-image-status scene-image-loading"
            role="status"
          >
            Carregando cena…
          </div>
          <div
            v-if="canUseMap && sceneLoadError"
            class="scene-image-status scene-image-error"
            role="alert"
          >
            {{ sceneLoadError }}
          </div>

          <button
            v-if="canUseMap"
            type="button"
            class="board-recenter"
            aria-label="Recentralizar mapa"
            @click="resetView"
          >
            <Icon name="collapse" :size="16" aria-hidden="true" />
            <span>Recentralizar</span>
          </button>

          <div v-if="showTransition" class="transition-overlay">
            <div class="overlay-card surface">
              <video ref="transitionVideoRef" class="overlay-media" autoplay muted playsinline src="/media/transition.mp4"></video>
              <h2>Vamos começar!</h2>
            </div>
          </div>
        </div>

        <Toolbar
          v-if="!isDM && (sessionStatus === 'LIVE' || isDM) && activeScene?.type === 'battlemap'"
          variant="floating"
          :activeTool="activeTool"
          :canDelete="Boolean(selectedPersistentId && persistentMeasurements.find(pm => pm.id === selectedPersistentId)?.userId === currentUser?.id)"
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
      </section>

      <aside
        v-if="isDM && !isMobileLayout"
        class="dm-panel"
        :class="{ collapsed: isDmPanelCollapsed }"
        aria-label="Painel do Mestre"
      >
        <div v-if="isDmPanelCollapsed" class="dm-panel__collapsed">
          <button
            type="button"
            class="toggle-button"
            aria-label="Expandir painel do Mestre"
            :aria-expanded="false"
            @click="isDmPanelCollapsed = false"
          >
            <Icon name="plus" :size="18" aria-hidden="true" />
            <span>Painel</span>
          </button>
        </div>
        <template v-else>
          <div class="dm-panel__collapsed">
            <button
              type="button"
              class="toggle-button"
              aria-label="Recolher painel do Mestre"
              :aria-expanded="true"
              @click="isDmPanelCollapsed = true"
            >
              <Icon name="minus" :size="18" aria-hidden="true" />
              <span>Recolher</span>
            </button>
          </div>
          <DMPanel
            :active-tab="activePanelTab"
            :table-id="tableId"
            :session-status="sessionStatus"
            :pause-input="pauseInput"
            :pause-remaining="pauseRemaining"
            :invite-code="currentTable?.inviteCode ?? ''"
            :display-connected="displayConnected"
            :scenes="scenes"
            :active-scene-id="activeSceneId"
            :asset-usage="assetUsage"
            :initiative-list="initiativeList"
            :tokens-on-map="tokensOnMap"
            :meters-per-square="metersPerSquare"
            :current-user="currentUser ? { _id: currentUser.id, username: currentUser.username } : null"
            :is-d-m="isDM"
            :my-active-token="myActiveToken"
            :current-turn-token-id="currentTurnTokenId"
            :grid-width="gridWidth"
            :grid-height="gridHeight"
            :system-options="systemOptions"
            :selected-system-id="selectedSystemId"
            :characters="charactersForTable"
            :current-system="currentSystem"
            :round="roundNumber"
            :create-scene="handleCreateScene"
            :delete-scene="handleDeleteScene"
            :rename-scene="handleRenameScene"
            :activate-scene="handleActivateScene"
            @update:active-tab="selectPanelTab($event)"
            @update:pause-input="pauseInput = $event"
            @update-status="handleUpdateSessionStatus"
            @start-session="startSessionWithTransition"
            @reorder-scenes="onSceneReorder"
            @apply-grid="handleApplyGrid"
            @system-change="handleSystemChange"
            @edit-token="handleOpenTokenInspector"
            @remove-entry="handleRemoveFromInitiative"
            @reorder-initiative="handleInitiativeReorder"
            @reset-initiative="handleResetInitiative"
            @undo-move="handleUndoMove"
            @next-turn="handleNextTurn"
            @open-character-sheet="(id: string) => id && openCharacterSheet(id)"
            @add-token="startTokenPlacement"
            @select-token="handleOpenTokenInspector"
          />
        </template>
      </aside>
    </div>

    <div
      v-if="!isDM && sessionStatus === 'LIVE' && activeScene?.type === 'battlemap'"
      class="player-initiative-wrapper"
      :class="{ 'bottom-sheet': isMobileLayout }"
    >
      <InitiativePanel
        :initiativeList="initiativeList"
        :tokensOnMap="tokensOnMap"
        :metersPerSquare="metersPerSquare"
        :currentUser="currentUser ? { _id: currentUser.id, username: currentUser.username } : null"
        :isDM="false"
        :myActiveToken="myActiveToken"
        :round="roundNumber"
        @undo-move="handleUndoMove"
        @next-turn="handleNextTurn"
        @open-character-sheet="(id: string) => id && openCharacterSheet(id)"
      />
    </div>

    <div v-if="!isMobileLayout" class="board-dock" :class="{ 'board-dock--player': !isDM }">
      <ChatToggle
        class="chat-toggle-btn"
        :unread="chatStore.unread"
        :open="chatStore.panelOpen"
        @toggle="toggleChat"
      />
      <button
        class="log-toggle-btn"
        :class="{ open: showActionLog }"
        type="button"
        aria-label="Alternar histórico"
        :aria-expanded="showActionLog"
        @click="toggleActionLog"
      >
        <Icon name="book" :size="16" aria-hidden="true" />
        <span>{{ showActionLog ? 'Fechar histórico' : 'Histórico' }}</span>
        <span v-if="logCount" class="log-badge">{{ logCount }}</span>
      </button>
    </div>

    <nav v-if="isMobileLayout" class="mobile-bar" aria-label="Ações da mesa">
      <button v-if="isDM" type="button" class="mobile-bar__item" @click="openMobilePanel()">
        <Icon name="menu" :size="20" aria-hidden="true" />
        <span>Painel</span>
      </button>
      <button v-if="isDM" type="button" class="mobile-bar__item" @click="openMobileTools">
        <Icon name="ruler" :size="20" aria-hidden="true" />
        <span>Ferramentas</span>
      </button>
      <ChatToggle
        class="chat-toggle-btn mobile-bar__chat"
        label="Chat"
        :unread="chatStore.unread"
        :open="chatStore.panelOpen"
        @toggle="toggleChat"
      />
      <button
        class="log-toggle-btn mobile-bar__item"
        :class="{ open: showActionLog }"
        type="button"
        aria-label="Alternar histórico"
        :aria-expanded="showActionLog"
        @click="toggleActionLog"
      >
        <Icon name="book" :size="20" aria-hidden="true" />
        <span>Histórico</span>
        <span v-if="logCount" class="log-badge">{{ logCount }}</span>
      </button>
    </nav>

    <button
      v-if="isDM && isMobileLayout"
      type="button"
      class="mobile-fab"
      aria-label="Adicionar token"
      @click="startTokenPlacement"
    >＋ Token</button>

    <BaseSheet
      v-if="isMobilePanelOpen && isDM"
      :open="true"
      title="Painel do Mestre"
      @update:open="isMobilePanelOpen = $event"
      @close="isMobilePanelOpen = false"
    >
      <DMPanel
        class="mobile-panel-content"
        :active-tab="activePanelTab"
        :table-id="tableId"
        :session-status="sessionStatus"
        :pause-input="pauseInput"
        :pause-remaining="pauseRemaining"
        :invite-code="currentTable?.inviteCode ?? ''"
        :display-connected="displayConnected"
        :scenes="scenes"
        :active-scene-id="activeSceneId"
        :asset-usage="assetUsage"
        :initiative-list="initiativeList"
        :tokens-on-map="tokensOnMap"
        :meters-per-square="metersPerSquare"
        :current-user="currentUser ? { _id: currentUser.id, username: currentUser.username } : null"
        :is-d-m="isDM"
        :my-active-token="myActiveToken"
        :current-turn-token-id="currentTurnTokenId"
        :grid-width="gridWidth"
        :grid-height="gridHeight"
        :system-options="systemOptions"
        :selected-system-id="selectedSystemId"
        :characters="charactersForTable"
        :current-system="currentSystem"
        :round="roundNumber"
        :create-scene="handleCreateScene"
        :delete-scene="handleDeleteScene"
        :rename-scene="handleRenameScene"
        :activate-scene="handleActivateScene"
        @update:active-tab="activePanelTab = $event"
        @update:pause-input="pauseInput = $event"
        @update-status="handleUpdateSessionStatus"
        @start-session="startSessionWithTransition"
        @reorder-scenes="onSceneReorder"
        @apply-grid="handleApplyGrid"
        @system-change="handleSystemChange"
        @edit-token="handleOpenTokenInspector"
        @remove-entry="handleRemoveFromInitiative"
        @reorder-initiative="handleInitiativeReorder"
        @reset-initiative="handleResetInitiative"
        @undo-move="handleUndoMove"
        @next-turn="handleNextTurn"
        @open-character-sheet="(id: string) => id && openCharacterSheet(id)"
        @add-token="startTokenPlacement"
        @select-token="handleOpenTokenInspector"
      />
    </BaseSheet>

    <BaseSheet
      v-if="isMobileToolsOpen && isDM"
      :open="true"
      title="Ferramentas"
      @update:open="isMobileToolsOpen = $event"
      @close="isMobileToolsOpen = false"
    >
      <Toolbar
        variant="sheet"
        :activeTool="activeTool"
        :canDelete="Boolean(selectedPersistentId && (isDM || persistentMeasurements.find(pm => pm.id === selectedPersistentId)?.userId === currentUser?.id))"
        :persistentMode="persistentMode"
        :isDM="isDM"
        :selectedColor="measurementColor"
        :canRemoveAura="canRemoveAura"
        :canAddAura="canAddAura"
        @tool-selected="handleToolSelectedFromSheet"
        @toggle-persistent="handleTogglePersistent"
        @color-selected="handleColorSelected"
        @clear-all="handleClearAllMeasurements"
        @delete-selected="handleDeleteSelectedPersistent"
        @remove-aura="handleToolbarRemoveAura"
        @edit-aura="handleToolbarEditAura"
        @toggle-dice-roller="handleDiceFromSheet"
      />
    </BaseSheet>

    <transition name="log-panel">
      <aside v-if="showActionLog" :class="['action-log-panel', 'surface', { 'mobile-sheet': isMobileLayout, 'has-dm-panel': isDM && !isMobileLayout }]">
        <header class="log-panel__header">
          <div>
            <p class="log-panel__eyebrow">Histórico</p>
            <h3>Registro de ações</h3>
          </div>
          <button type="button" class="log-panel__close" aria-label="Fechar histórico" @click="toggleActionLog">×</button>
        </header>
        <ActionLog :logs="logs" />
      </aside>
    </transition>

    <ChatPanel
      :table-id="tableId"
      :open="chatStore.panelOpen"
      :connection-status="connectionStatus"
      :mobile="isMobileLayout"
      :class="{ 'has-dm-panel': isDM && !isMobileLayout }"
      @close="chatStore.closePanel()"
    />

    <TokenCreationForm
      v-if="showTokenForm && isDM"
      :players="ownerOptions"
      :characters="charactersForTable"
      :table-id="tableId || ''"
      :dm-id="dmId"
      @create-token="createToken"
      @cancel="showTokenForm = false; targetSquareIdForToken = null;"
    />
    <TokenEditForm
      :open="showTokenEditForm"
      :token="tokenBeingEdited"
      :players="ownerOptions"
      :characters="charactersForTable"
      :table-id="tableId || ''"
      :dm-id="dmId"
      :in-turn="editedTokenInTurn"
      :can-manage-turn="isDM && isBattlemapScene"
      @close="showTokenEditForm = false; tokenBeingEdited = null;"
      @save="handleSaveTokenEdit"
      @add-to-turn="handleAddEditedTokenToTurn"
      @remove-from-turn="handleRemoveEditedTokenFromTurn"
      @delete="handleDeleteEditedToken"
    />
    <AuraDialog
      :open="showAuraDialog"
      :tokenId="auraDialogTokenId"
      :defaultName="(auraDialogTokenId && auras.find(a => a.tokenId === auraDialogTokenId)?.name) || 'Aura'"
      :defaultColor="(auraDialogTokenId && auras.find(a => a.tokenId === auraDialogTokenId)?.color) || measurementColor"
      :defaultRadiusMeters="Number((auraDialogTokenId && auras.find(a => a.tokenId === auraDialogTokenId)?.radiusMeters) ?? 0)"
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
      :system="currentSystem"
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
          :system="currentSystem"
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

    <BaseDialog
      :open="pendingSessionEnd"
      title="Encerrar sessão?"
      @update:open="pendingSessionEnd = $event"
      @close="pendingSessionEnd = false"
    >
      <p class="confirm-copy">
        Jogadores e TV verão a tela final imediatamente. A mesa pode preparar uma nova
        sessão depois, mas o estado atual da sessão será encerrado para todos.
      </p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-sm" @click="pendingSessionEnd = false">Cancelar</button>
        <button type="button" class="btn btn-sm danger" @click="confirmEndSession">Encerrar sessão</button>
      </div>
    </BaseDialog>

    <!-- Chamada (Fase 5): só DM/jogador; a TV nunca monta estes componentes. -->
    <ParticipantGrid floating />
    <MediaDock :table-id="tableId" />
  </div>
</template>

<style scoped>
/* --------------------------------------------------------------------------
   Cockpit DM — 3 zonas: rail, tabuleiro + turn bar, painel dockado.
   -------------------------------------------------------------------------- */

.table-view-layout {
  --dm-panel-w: clamp(380px, 26vw, 420px);
  --mobile-bar-h: 64px;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  background: var(--ink-0);
  color: var(--text);
  font-family: var(--font-sans);
}

.table-view-layout.panel-collapsed {
  --dm-panel-w: 48px;
}

/* Top bar ---------------------------------------------------------------- */
.cockpit-topbar {
  position: relative;
  z-index: 90;
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--s-3);
  min-height: 56px;
  padding: 0 var(--s-4);
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}

.topbar-back {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  min-width: 44px;
  min-height: 44px;
  padding: 0 var(--s-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: var(--text-sm);
  text-decoration: none;
}
.topbar-back:hover { background: var(--raised); color: var(--text); text-decoration: none; }
.topbar-back:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }

.topbar-identity {
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  gap: var(--s-3);
  min-width: 0;
}
.topbar-title {
  margin: 0;
  overflow: hidden;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: var(--leading-snug);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scene-switch {
  display: flex;
  align-items: center;
  gap: var(--s-1);
  min-width: 0;
  padding-left: var(--s-3);
  border-left: 1px solid var(--line);
}
.scene-switch__label {
  color: var(--text-faint);
  font-size: var(--text-2xs);
}
.scene-switch__button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--raised);
  color: var(--text);
  line-height: 1;
}
.scene-switch__button::after {
  content: '';
  position: absolute;
  inset: -8px;
}
.scene-switch__button:disabled { color: var(--text-faint); cursor: not-allowed; }
.scene-switch__button:not(:disabled):hover { border-color: var(--line-strong); }
.scene-switch__button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.scene-switch__name {
  max-width: 220px;
  overflow: hidden;
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topbar-scene {
  margin: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-status {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--s-2);
}

.status-chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--raised);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
}
.status-chip.status-live { border-color: rgb(92 155 133 / 0.5); background: rgb(92 155 133 / 0.14); color: var(--success-ink); }
.status-chip.status-paused { border-color: rgb(217 180 91 / 0.5); background: rgb(217 180 91 / 0.14); color: var(--manila); }
.status-chip.status-preparing { border-color: rgb(127 182 201 / 0.5); background: rgb(47 108 132 / 0.16); color: var(--accent-ink); }
.status-chip.status-ended { border-color: var(--line-strong); color: var(--text-muted); }

.connection-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 24px;
  padding: 2px var(--s-2);
  color: var(--text-muted);
  font-size: var(--text-xs);
  white-space: nowrap;
}
.connection-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
}
.connection-indicator.status-reconnecting .dot,
.connection-indicator.status-connecting .dot { background: var(--manila); }
.connection-indicator.status-disconnected .dot,
.connection-indicator.status-error .dot { background: var(--danger-ink); }
.connection-indicator.degraded { color: var(--danger-ink); }

.presence-menu { position: relative; }
.presence-summary {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 32px;
  padding: 0 var(--s-2);
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  font-size: var(--text-xs);
  white-space: nowrap;
  cursor: pointer;
  list-style: none;
}
.presence-summary::-webkit-details-marker { display: none; }
.presence-summary::marker { content: ''; }
.presence-summary:hover { border-color: var(--line); background: var(--raised); color: var(--text); }
.presence-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  flex: none;
}
.presence-dot.offline { background: var(--text-faint); }
.presence-compact { display: none; }
.presence-panel {
  position: absolute;
  top: calc(100% + var(--s-2));
  right: 0;
  z-index: 120;
  min-width: 224px;
  padding: var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  box-shadow: var(--shadow-overlay);
}
.presence-empty { margin: 0; color: var(--text-muted); font-size: var(--text-sm); }
.presence-list { display: flex; flex-direction: column; gap: var(--s-2); margin: 0; padding: 0; list-style: none; }
.presence-list li {
  display: flex;
  justify-content: space-between;
  gap: var(--s-4);
  font-size: var(--text-sm);
}
.presence-role { color: var(--text-muted); font-size: var(--text-xs); }

.topbar-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--s-2);
}
.topbar-actions .btn,
.session-menu__summary,
.topbar-panel-btn { min-height: 44px; }
.session-menu { position: relative; }
.session-menu__summary {
  list-style: none;
  cursor: pointer;
  min-height: 40px;
}
.session-menu__summary::-webkit-details-marker { display: none; }
.session-menu__summary::marker { content: ''; }
.session-menu__panel {
  position: absolute;
  top: calc(100% + var(--s-2));
  right: 0;
  z-index: 120;
  display: flex;
  flex-direction: column;
  min-width: 210px;
  padding: var(--s-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  box-shadow: var(--shadow-overlay);
}
.session-menu__panel button {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 0 var(--s-3);
  border-radius: var(--radius-xs);
  color: var(--text);
  font-size: var(--text-sm);
  text-align: left;
}
.session-menu__panel button:hover { background: var(--raised); }
.session-menu__panel button.danger-item { color: var(--danger-ink); }
.session-menu__panel hr { width: 100%; border: 0; border-top: 1px solid var(--line); margin: var(--s-2) 0; }

.topbar-panel-btn { flex: none; }

/* Corpo em 3 zonas ------------------------------------------------------- */
.cockpit-body {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: 104px minmax(0, 1fr) var(--dm-panel-w);
  min-height: 0;
}
.table-view-layout.is-player .cockpit-body {
  grid-template-columns: minmax(0, 1fr);
}

/* Rail esquerdo --------------------------------------------------------- */
.tool-rail {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-height: 0;
  padding: var(--s-2);
  overflow-y: auto;
  border-right: 1px solid var(--line);
  background: var(--panel);
  scrollbar-width: thin;
}
.rail-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-1);
  min-height: 44px;
  padding: 0 var(--s-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--on-accent);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}
.rail-add:hover { background: var(--accent-hover); }
.rail-add:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.rail-tabs { display: flex; flex-direction: column; gap: 1px; }
.rail-tab {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  justify-content: flex-start;
  width: 100%;
  min-height: 44px;
  padding: 0 var(--s-2);
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.rail-tab:hover { background: var(--raised); color: var(--text); }
.rail-tab:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.rail-tab.is-active {
  border-left-color: var(--accent-ink);
  background: var(--raised);
  color: var(--text);
}
.rail-divider { width: 100%; border: 0; border-top: 1px solid var(--line); margin: var(--s-1) 0; }
.tool-rail :deep(.tool-button) { min-height: 44px; }

/* Tabuleiro e turn bar --------------------------------------------------- */
.board-zone {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
  min-height: 0;
  padding: var(--s-2);
  position: relative;
}
.turn-bar {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--s-4);
  min-height: 48px;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
}
.turn-bar__scene {
  display: flex;
  flex: none;
  flex-direction: column;
  max-width: 190px;
  min-width: 0;
}
.turn-bar__eyebrow {
  color: var(--text-faint);
  font-size: var(--text-2xs);
  line-height: 1.2;
}
.turn-bar__scene strong {
  overflow: hidden;
  font-size: var(--text-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.turn-bar__actor {
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  gap: var(--s-2);
  min-width: 0;
  overflow: hidden;
}
.turn-bar__actor strong { font-size: var(--text-sm); }
.turn-bar__actor.is-empty { color: var(--text-muted); }
.turn-bar__label { color: var(--text-muted); font-size: var(--text-xs); }
.turn-bar__movement {
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.turn-bar__round {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}
.turn-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); flex: none; align-self: center; }
.turn-bar__actions { display: flex; flex: none; gap: var(--s-2); }

.placement-banner {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--s-2);
  min-height: 40px;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--accent-ink);
  border-radius: var(--radius-sm);
  background: rgb(47 108 132 / 0.18);
  color: var(--text);
  font-size: var(--text-sm);
}
.placement-banner__actions { display: flex; gap: var(--s-2); margin-left: auto; }

.board-wrap {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
.board-wrap :deep(.viewport) {
  width: 100%;
  height: 100%;
  max-width: none;
  border-width: 6px;
}
.board-recenter {
  position: absolute;
  top: var(--s-3);
  left: var(--s-3);
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 36px;
  padding: 0 var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: rgb(18 23 26 / 0.92);
  color: var(--text);
  font-size: var(--text-xs);
  cursor: pointer;
}
.board-recenter:hover { background: var(--raised); }
.board-recenter:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }

.scene-image-status {
  position: absolute;
  top: var(--s-3);
  left: 50%;
  transform: translateX(-50%);
  z-index: 65;
  pointer-events: none;
  max-width: min(90vw, 520px);
  padding: var(--s-2) var(--s-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--text-sm);
  text-align: center;
}
.scene-image-loading::before {
  content: '';
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: var(--s-2);
  border: 2px solid var(--accent-ink);
  border-top-color: transparent;
  border-radius: 50%;
  animation: scene-spin 0.8s linear infinite;
  vertical-align: -1px;
}
.scene-image-error { border-color: var(--danger); color: var(--danger-ink); background: rgb(178 58 50 / 0.14); }
@keyframes scene-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .scene-image-loading::before { animation: none; } }

/* Painel dockado -------------------------------------------------------- */
.dm-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--line);
  background: var(--panel);
}
.dm-panel__collapsed {
  display: flex;
  flex: none;
  justify-content: flex-end;
  padding: var(--s-1);
  border-bottom: 1px solid var(--line);
}
.toggle-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  min-height: 40px;
  padding: 0 var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text-muted);
  font-size: var(--text-xs);
  cursor: pointer;
}
.toggle-button:hover { color: var(--text); border-color: var(--line-strong); }
.toggle-button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.dm-panel :deep(.dm-panel-content) { flex: 1 1 auto; min-height: 0; }
.dm-panel.collapsed {
  align-items: center;
  justify-content: flex-start;
}
.dm-panel.collapsed .dm-panel__collapsed { padding: var(--s-1); border-bottom: 0; }
.dm-panel.collapsed .toggle-button { width: 44px; padding: 0; }
.dm-panel.collapsed .toggle-button span { display: none; }

/* Dock de chat/histórico no desktop ------------------------------------ */
.board-dock {
  position: fixed;
  right: calc(var(--dm-panel-w) + var(--s-4));
  bottom: var(--s-4);
  z-index: 70;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--s-2);
}
.table-view-layout.is-player .board-dock {
  right: var(--s-4);
  top: calc(56px + var(--s-4));
  bottom: auto;
}
.board-dock :deep(.chat-toggle) {
  min-height: 40px;
  padding: 0 var(--s-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  box-shadow: none;
  color: var(--text);
  font-size: var(--text-xs);
  font-weight: 500;
}
.board-dock :deep(.chat-toggle:hover) { background: var(--raised); }
.board-dock :deep(.chat-toggle.is-open) { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.board-dock :deep(.chat-toggle__badge) { min-width: 18px; height: 18px; background: var(--danger); font-size: var(--text-2xs); }
.log-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 40px;
  padding: 0 var(--s-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
}
.log-toggle-btn:hover { background: var(--raised); }
.log-toggle-btn.open { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.log-toggle-btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.log-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--danger);
  color: var(--on-danger);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
}

/* Drawer de histórico --------------------------------------------------- */
.action-log-panel {
  position: fixed;
  right: calc(var(--dm-panel-w) + var(--s-4));
  bottom: calc(56px + var(--s-6));
  z-index: 74;
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  width: min(420px, calc(100vw - var(--dm-panel-w) - var(--s-7)));
  max-height: min(60vh, 560px);
  padding: var(--s-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  color: var(--text);
}
.table-view-layout.is-player .action-log-panel { right: var(--s-4); width: min(420px, calc(100vw - var(--s-7))); }
.action-log-panel.mobile-sheet {
  right: var(--s-3);
  left: var(--s-3);
  bottom: calc(var(--mobile-bar-h) + var(--s-3) + env(safe-area-inset-bottom, 0px));
  width: auto;
  max-height: min(56dvh, 520px);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.log-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--s-3);
}
.log-panel__eyebrow {
  margin: 0;
  color: var(--text-faint);
  font-size: var(--text-2xs);
}
.log-panel__header h3 { margin: 2px 0 0; font-family: var(--font-display); font-size: var(--text-lg); }
.log-panel__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  font-size: var(--text-lg);
}
.log-panel-enter-active,
.log-panel-leave-active { transition: opacity var(--dur-pop) var(--ease-out), transform var(--dur-pop) var(--ease-out); }
.log-panel-enter-from,
.log-panel-leave-to { opacity: 0; transform: translateY(8px); }

/* Chat: usa o painel existente, mas sem gradiente e fora do painel DM. */
.table-view-layout :deep(.chat-panel) {
  background: var(--panel);
  border-color: var(--line-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-overlay);
}
.table-view-layout :deep(.chat-panel--desktop) {
  right: calc(var(--dm-panel-w) + var(--s-4));
}
.table-view-layout.is-player :deep(.chat-panel--desktop) { right: var(--s-4); }
.table-view-layout :deep(.chat-panel--mobile) {
  right: var(--s-2);
  left: var(--s-2);
  bottom: calc(var(--mobile-bar-h) + var(--s-3) + env(safe-area-inset-bottom, 0px));
  border-radius: var(--radius-lg);
}

/* Sobreposições de sessão ---------------------------------------------- */
.session-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.overlay-card {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  width: min(780px, 92vw);
  padding: var(--s-5);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel);
  text-align: center;
}
.overlay-media { width: 100%; max-height: 100%; object-fit: cover; border-radius: var(--radius-md); border: 1px solid var(--line); }
.countdown { color: var(--manila); font-family: var(--font-data); font-weight: 600; font-variant-numeric: tabular-nums; }
.transition-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(4 6 7 / 0.72);
}

/* Popup de dados ------------------------------------------------------- */
.dice-popup-overlay {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(4 6 7 / 0.72);
}
.dice-roller-enter-active,
.dice-roller-leave-active { transition: opacity var(--dur-pop) var(--ease-out), transform var(--dur-pop) var(--ease-out); }
.dice-roller-enter-from,
.dice-roller-leave-to { opacity: 0; transform: translateY(10px); }

/* Barra mobile e FAB --------------------------------------------------- */
.mobile-bar {
  display: flex;
  flex: none;
  align-items: stretch;
  min-height: var(--mobile-bar-h);
  padding: var(--s-1) var(--s-2) calc(var(--s-1) + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--line);
  background: var(--panel);
}
.mobile-bar__item {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 48px;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  font-size: var(--text-2xs);
  font-weight: 500;
  cursor: pointer;
}
.mobile-bar__item:hover { background: var(--raised); color: var(--text); }
.mobile-bar__item.open { color: var(--accent-ink); }
.mobile-bar :deep(.chat-toggle) {
  flex: 1 1 0;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  min-height: 48px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  box-shadow: none;
  color: var(--text-muted);
  font-size: var(--text-2xs);
  font-weight: 500;
}
.mobile-bar :deep(.chat-toggle:hover) { background: var(--raised); color: var(--text); }
.mobile-bar :deep(.chat-toggle.is-open) { background: transparent; color: var(--accent-ink); }
.mobile-bar :deep(.chat-toggle__badge) {
  position: absolute;
  margin-left: 20px;
  margin-top: -18px;
  min-width: 16px;
  height: 16px;
  font-size: 10px;
}
.mobile-bar .log-toggle-btn {
  flex: 1 1 0;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  min-height: 48px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-2xs);
}
.mobile-bar .log-toggle-btn:hover { background: var(--raised); color: var(--text); }
.mobile-bar .log-toggle-btn.open { background: transparent; color: var(--accent-ink); }
.mobile-bar .log-badge { position: absolute; margin-left: 20px; margin-top: -18px; min-width: 16px; height: 16px; font-size: 10px; }
.mobile-fab {
  position: fixed;
  right: var(--s-4);
  bottom: calc(var(--mobile-bar-h) + var(--s-4) + env(safe-area-inset-bottom, 0px));
  z-index: 60;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 var(--s-5);
  border: 1px solid var(--accent);
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--on-accent);
  font-size: var(--text-sm);
  font-weight: 600;
  box-shadow: 0 10px 24px -12px #000;
  cursor: pointer;
}
.mobile-fab:hover { background: var(--accent-hover); }
.mobile-fab:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

/* Painel mobile: folha alta o bastante para a aba Cena, com um único scroll. */
.mobile-panel-content { max-height: min(72dvh, 640px); }
.mobile-panel-content :deep(.dm-panel__add) { display: none; }

/* Mídia: o card flutuante não pode cobrir o rail nem o FAB. */
.table-view-layout :deep(.media-dock--floating) {
  left: calc(104px + var(--s-4));
  bottom: var(--s-4);
  z-index: 72;
  max-width: min(240px, calc(100vw - 104px - var(--dm-panel-w) - var(--s-8)));
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
}
.table-view-layout.is-player :deep(.media-dock--floating) { left: var(--s-4); }

/* Player: iniciativa flutuante ---------------------------------------- */
.player-initiative-wrapper {
  position: fixed;
  right: var(--s-4);
  bottom: var(--s-4);
  z-index: 42;
  pointer-events: none;
}
.player-initiative-wrapper .initiative-panel { pointer-events: auto; }

/* Diálogo de confirmação ------------------------------------------------ */
.confirm-copy { margin: 0 0 var(--s-5); color: var(--text-muted); line-height: var(--leading-body); }
.confirm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--s-3); }

/* Responsivo ----------------------------------------------------------- */
@media (max-width: 1279px) {
  .scene-switch__label { display: none; }
  .scene-switch__name { max-width: 150px; }
  .connection-label { display: none; }
}

@media (max-width: 1023px) {
  .cockpit-body { display: flex; flex-direction: column; min-height: 0; }
  .tool-rail, .dm-panel { display: none; }
  .topbar-actions { display: none; }
  .cockpit-topbar { gap: var(--s-2); padding: 0 var(--s-3); }
  .topbar-title { font-size: var(--text-base); }
  .topbar-identity { gap: var(--s-2); }
  .scene-switch { padding-left: var(--s-2); }
  .scene-switch__button { display: none; }
  .scene-switch__name { max-width: 110px; }
  .topbar-status { gap: var(--s-1); }
  .presence-text { display: none; }
  .presence-compact { display: inline; }
  .board-zone { flex: 1 1 auto; padding: var(--s-2); gap: var(--s-2); }
  .turn-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'scene actions'
      'actor actor';
    gap: var(--s-1) var(--s-3);
    min-height: 44px;
    padding: var(--s-2);
  }
  .turn-bar__scene {
    grid-area: scene;
    flex-direction: row;
    align-items: baseline;
    gap: var(--s-2);
    max-width: none;
  }
  .turn-bar__actor { grid-area: actor; gap: var(--s-1); }
  .turn-bar__actions { grid-area: actions; gap: var(--s-1); }
  .turn-bar__movement { display: none; }
  .turn-bar__round { font-size: 10px; }
  .board-wrap { min-height: 55dvh; }
  .board-wrap :deep(.viewport) { height: 100%; }
  .player-initiative-wrapper { right: var(--s-3); bottom: calc(var(--mobile-bar-h) + var(--s-3)); }
  .player-initiative-wrapper.bottom-sheet {
    right: var(--s-3);
    left: var(--s-3);
    bottom: calc(var(--mobile-bar-h) + var(--s-3) + env(safe-area-inset-bottom, 0px));
  }
  .placement-banner { flex-wrap: wrap; }
  .placement-banner__actions { margin-left: 0; }
  .board-recenter { min-height: 32px; top: var(--s-2); left: var(--s-2); }
  .board-recenter span { display: none; }
  .table-view-layout :deep(.media-dock--floating) {
    left: var(--s-3);
    right: auto;
    bottom: calc(var(--mobile-bar-h) + var(--s-4) + env(safe-area-inset-bottom, 0px));
    max-width: calc(100vw - 132px);
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }
  .table-view-layout :deep(.media-dock--floating .media-dock__status) { display: none; }
  .table-view-layout :deep(.media-dock--floating .media-btn--join) { flex: 0 0 auto; }
}

@media (max-width: 520px) {
  .topbar-back__label { display: none; }
  .topbar-title { font-size: var(--text-sm); }
  .scene-switch { display: none; }
  .topbar-scene { max-width: 120px; }
  .status-chip { padding-inline: var(--s-2); }
  .connection-indicator { display: none; }
  .topbar-panel-btn { padding: 0 var(--s-3); }
}

@media (max-width: 380px) {
  .presence-compact { font-size: 10px; }
  .turn-bar__scene { display: none; }
  .turn-bar__label { font-size: 11px; }
  .mobile-bar__item, .mobile-bar :deep(.chat-toggle), .mobile-bar .log-toggle-btn { font-size: 10px; }
}
</style>
