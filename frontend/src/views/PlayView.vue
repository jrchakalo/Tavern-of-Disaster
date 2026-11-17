<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';

import { authToken, currentUser } from '../services/authService';
import { API_BASE_URL } from '../services/apiBase';
import { toast } from '../services/toast';
import { socketService } from '../services/socketService';
import { joinTableByInvite } from '../services/tableAccessService';
import { getMyCharacters } from '../services/characterService';
import { distanceInSquares, squareIdToGrid } from '../services/gridGeometry';
import { useTableStore } from '../stores/tableStore';
import { useCharacterStore } from '../stores/characterStore';
import { useMediaStore } from '../stores/mediaStore';
import { useChatStore } from '../stores/chatStore';
import { mergeCharacterSummary } from '../components/character/summary';
import type { CharacterDTO, IInitiativeEntry, RollLogEntryDTO, TokenInfo } from '../types';

import PlayerBoard from '../components/play/PlayerBoard.vue';
import InitiativeStrip from '../components/play/InitiativeStrip.vue';
import TokenCard from '../components/play/TokenCard.vue';
import TokenDetailsSheet from '../components/play/TokenDetailsSheet.vue';
import ActionErrorBanner from '../components/play/ActionErrorBanner.vue';
import PlayerDicePanel from '../components/play/PlayerDicePanel.vue';
import CharacterSheet from '../components/CharacterSheet.vue';
import BaseDialog from '../components/ui/BaseDialog.vue';
import BaseSheet from '../components/ui/BaseSheet.vue';
import PlayerNav from '../components/player/PlayerNav.vue';
import PlayerTurnBar from '../components/player/PlayerTurnBar.vue';
import PlayerEmptyActions from '../components/player/PlayerEmptyActions.vue';
import PlayerChatSheet from '../components/player/PlayerChatSheet.vue';
import PlayerCallSheet from '../components/player/PlayerCallSheet.vue';
import { readSessionExtras } from '../components/play/sessionMeta';
import type { PlayerTab } from '../components/player/tabs';

const route = useRoute();
const router = useRouter();
const tableId = String(
  Array.isArray(route.params.tableId) ? route.params.tableId[0] : route.params.tableId ?? '',
);

const store = useTableStore();
const characterStore = useCharacterStore();
const mediaStore = useMediaStore();
const chatStore = useChatStore();
const {
  currentTable,
  activeScene,
  currentMapUrl,
  tokensOnMap,
  initiativeList,
  currentTurnTokenId,
  myActiveToken,
  connectionStatus,
  sessionStatus,
  squares,
  gridWidth,
  gridHeight,
  metersPerSquare,
  auras,
  pings,
  isDM,
  recentRolls,
  characters: characterSummaries,
} = storeToRefs(store);

const extras = computed(() => readSessionExtras(store));
const revision = computed(() => extras.value.revision ?? 0);
const you = computed(() => extras.value.you ?? null);
const presenceCount = computed(
  () => extras.value.presence?.length ?? currentTable.value?.players?.length ?? 0,
);
const round = computed(() => extras.value.round ?? null);

// Chat: presença e rolagens viram mensagens de sistema locais. A store faz a
// linha de base e não repete linhas em reconexão.
watch(
  () => extras.value.presence ?? [],
  (presence) => chatStore.trackPresence(presence, currentUser.value?.id ?? null),
  { immediate: true },
);
const liveRolls = computed<RollLogEntryDTO[]>(() => {
  const value = recentRolls as unknown;
  if (Array.isArray(value)) return value as RollLogEntryDTO[];
  if (value && typeof value === 'object' && Array.isArray((value as { value?: unknown }).value)) {
    return (value as { value: RollLogEntryDTO[] }).value;
  }
  return [];
});
watch(
  () => liveRolls.value,
  (rolls) => chatStore.trackRolls(rolls),
  { immediate: true },
);

// QR de convite: entra na mesa antes de conectar (Fase 2, §4.1).
const inviteCode = computed(() => {
  const raw = (route.query as Record<string, unknown> | undefined)?.invite;
  if (Array.isArray(raw)) return raw.length ? String(raw[0] ?? '') : '';
  return raw == null ? '' : String(raw);
});
const isMember = computed(() => you.value?.role === 'DM' || you.value?.role === 'PLAYER');
const canWrite = computed(() => you.value?.role === 'DM' || you.value?.role === 'PLAYER');
const roleLabel = computed(() => (you.value?.role === 'DM' ? 'Mestre' : 'Jogador'));

const joining = ref(false);
const inviteError = ref('');
const myCharacters = ref<CharacterDTO[]>([]);
const charactersLoading = ref(false);
const detailsToken = ref<TokenInfo | null>(null);
const creatingCharacter = ref(false);

function ownerIdOf(token: TokenInfo): string | null {
  const owner: unknown = token.ownerId;
  if (typeof owner === 'string') return owner;
  if (owner && typeof owner === 'object' && '_id' in owner) {
    const id = (owner as { _id?: unknown })._id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

/**
 * Token do jogador para exibição (ficha, avatar, destaque no tabuleiro).
 * `myActiveToken` só existe quando o turno atual é do jogador; fora do turno
 * a ficha continua visível buscando o token dono do usuário na mesa.
 * Permissão de movimento continua usando `myActiveToken` + `isMyTurn`.
 */
const myToken = computed<TokenInfo | null>(() => {
  if (myActiveToken.value) return myActiveToken.value;
  const userId = currentUser.value?.id;
  if (!userId) return null;
  return tokensOnMap.value.find((token) => ownerIdOf(token) === userId) ?? null;
});

const freeTokens = computed(() => tokensOnMap.value.filter((token) => !ownerIdOf(token)));

function characterFor(token: TokenInfo | null | undefined): CharacterDTO | null {
  if (!token?.characterId) return null;
  const base = myCharacters.value.find((character) => character._id === token.characterId) ?? null;
  if (!base) return null;
  // Resumo canônico (sessionPatch) cobre PV/CA alterados por OUTRO cliente.
  const summary = (characterSummaries?.value ?? []).find((entry) => entry._id === base._id);
  return mergeCharacterSummary(base, summary);
}

const myCharacter = computed(() => characterFor(myToken.value));

// ---------------------------------------------------------------------------
// Ficha completa no /play (dono/DM): QA abre pelo token card ou iniciativa.
// ---------------------------------------------------------------------------

const showCharacterSheet = ref(false);
const activeCharacterId = ref<string | null>(null);

const sheetCharacter = computed(() => {
  if (!activeCharacterId.value) return null;
  const base = myCharacters.value.find((character) => character._id === activeCharacterId.value) ?? null;
  if (!base) return null;
  const summary = (characterSummaries?.value ?? []).find((entry) => entry._id === base._id);
  return mergeCharacterSummary(base, summary);
});

const sheetIsOwner = computed(
  () => Boolean(sheetCharacter.value && sheetCharacter.value.ownerId === currentUser.value?.id),
);

const detailsCharacter = computed(() => characterFor(detailsToken.value));

const openableCharacterIds = computed(() => myCharacters.value.map((character) => character._id));

function openCharacterSheet(characterId: string) {
  if (!characterId) return;
  fichaSheetOpen.value = false;
  onboardingOpen.value = false;
  activeCharacterId.value = characterId;
  showCharacterSheet.value = true;
  activeTab.value = 'ficha';
}

function openSheetFromDetails() {
  if (!detailsCharacter.value) return;
  const id = detailsCharacter.value._id;
  detailsToken.value = null;
  openCharacterSheet(id);
}

function closeCharacterSheet() {
  showCharacterSheet.value = false;
  activeCharacterId.value = null;
  if (activeTab.value === 'ficha') activeTab.value = 'mesa';
}

async function handleCharacterSave(payload: Partial<CharacterDTO>) {
  if (!tableId || !activeCharacterId.value) return;
  try {
    const updated = await characterStore.updateCharacter(tableId, activeCharacterId.value, payload);
    if (updated) {
      myCharacters.value = myCharacters.value.map((character) =>
        character._id === updated._id ? updated : character,
      );
    }
    toast.success('Ficha atualizada.');
  } catch (error) {
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
    myCharacters.value = myCharacters.value.filter(
      (character) => character._id !== activeCharacterId.value,
    );
    toast.success('Ficha removida.');
    closeCharacterSheet();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível remover a ficha.';
    toast.error(message);
  }
}

const tableName = computed(() => currentTable.value?.name ?? 'Mesa');
const sceneName = computed(() => activeScene.value?.name ?? 'Nenhuma cena ativa');
const isLive = computed(() => sessionStatus.value === 'LIVE');
const isMyTurn = computed(() => isLive.value && Boolean(myActiveToken.value));
const isOffline = computed(() => connectionStatus.value !== 'connected');
const canMove = computed(() => isMyTurn.value && Boolean(activeScene.value) && !isOffline.value);
const canEndTurn = computed(() => isMyTurn.value && !isOffline.value);

const statusLabel = computed(() => {
  switch (sessionStatus.value) {
    case 'PREPARING':
      return 'Preparando';
    case 'PAUSED':
      return 'Pausado';
    case 'ENDED':
      return 'Encerrado';
    default:
      return 'Ao vivo';
  }
});
const statusTone = computed(() => `is-${sessionStatus.value.toLowerCase()}`);
const statusShortLabel = computed(() => {
  switch (sessionStatus.value) {
    case 'PREPARING':
      return 'Prep.';
    case 'PAUSED':
      return 'Pausa';
    case 'ENDED':
      return 'Fim';
    default:
      return 'Ao vivo';
  }
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
const connectionTone = computed(() => `is-${connectionStatus.value}`);
const showOfflineBanner = computed(() =>
  ['reconnecting', 'disconnected', 'error'].includes(connectionStatus.value),
);
const offlineBannerLabel = computed(() =>
  connectionStatus.value === 'reconnecting' ? 'Reconectando…' : 'Sem conexão — tentando de novo…',
);

const sessionOverlayTitle = computed(() => {
  switch (sessionStatus.value) {
    case 'PREPARING':
      return 'Aguardando o Mestre';
    case 'PAUSED':
      return 'Sessão pausada';
    case 'ENDED':
      return 'Sessão encerrada';
    default:
      return '';
  }
});

const sessionOverlayText = computed(() => {
  switch (sessionStatus.value) {
    case 'PREPARING':
      return 'O Mestre está preparando a mesa. O tabuleiro abre assim que a sessão começar.';
    case 'PAUSED':
      return 'Hora de respirar. A mesa retoma em breve.';
    case 'ENDED':
      return 'Por enquanto, as histórias ficam na memória.';
    default:
      return '';
  }
});

const currentEntry = computed<IInitiativeEntry | null>(
  () => initiativeList.value.find((entry) => entry.isCurrentTurn) ?? null,
);
function tokenForEntry(entry: IInitiativeEntry | null): TokenInfo | null {
  if (!entry?.tokenId) return null;
  return tokensOnMap.value.find((token) => token._id === entry.tokenId) ?? null;
}
const currentActorName = computed(
  () => currentEntry.value?.characterName || tokenForEntry(currentEntry.value)?.name || '',
);
const scale = computed(() => (metersPerSquare.value > 0 ? metersPerSquare.value : 1.5));
const remainingMeters = computed(() => myActiveToken.value?.remainingMovement ?? 0);
const remainingSquares = computed(() => Math.floor(remainingMeters.value / scale.value + 1e-6));

// ---------------------------------------------------------------------------
// Navegação do shell: abas inferiores viram sheets.
// ---------------------------------------------------------------------------

const activeTab = ref<PlayerTab>('mesa');
const initiativeOpen = ref(false);
const onboardingOpen = ref(false);
const fichaSheetOpen = ref(false);
const leaveOpen = ref(false);
const leaveError = ref('');
const leaving = ref(false);
const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);
const menuButtonRef = ref<HTMLButtonElement | null>(null);

watch(activeTab, (tab) => {
  if (tab === 'chat') chatStore.openPanel();
  else chatStore.closePanel();
  if (tab !== 'ficha') fichaSheetOpen.value = false;
});

watch(myCharacter, (character) => {
  if (character && fichaSheetOpen.value) openCharacterSheet(character._id);
});

function closeTab() {
  activeTab.value = 'mesa';
  fichaSheetOpen.value = false;
}

async function selectTab(tab: PlayerTab) {
  if (tab === activeTab.value && tab !== 'mesa') {
    closeTab();
    return;
  }
  activeTab.value = tab;
  if (tab === 'ficha') {
    if (myCharacter.value) openCharacterSheet(myCharacter.value._id);
    else {
      fichaSheetOpen.value = true;
      await loadMyCharacters();
    }
  }
}

// ---------------------------------------------------------------------------
// Movimento com confirmação + desfazer de 5 s.
// ---------------------------------------------------------------------------

const moveMode = ref(false);
const pendingMove = ref<{ squareId: string; squares: number; meters: number } | null>(null);
const undoTokenId = ref<string | null>(null);
let undoTimer: ReturnType<typeof setTimeout> | null = null;
const endingTurn = ref(false);
const errorMessage = ref('');
const liveMessage = ref('');
const boardRef = ref<{
  resetCamera: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  centerOnToken: (tokenId: string) => boolean;
  centerOnMe: () => void;
} | null>(null);

function formatMeters(value: number) {
  return `${value.toFixed(1).replace('.', ',')} m`;
}

const pendingMoveLabel = computed(() => {
  if (!pendingMove.value) return '';
  const squares = pendingMove.value.squares;
  return `${squares} quad · ${formatMeters(pendingMove.value.meters)}`;
});

watch(isMyTurn, (myTurn) => {
  if (!myTurn) {
    moveMode.value = false;
    pendingMove.value = null;
    clearUndo();
  }
});

watch(sessionStatus, (status) => {
  if (status !== 'LIVE') {
    moveMode.value = false;
    pendingMove.value = null;
    clearUndo();
  }
});

watch(
  isMyTurn,
  (myTurn, previous) => {
    if (myTurn) {
      liveMessage.value = `Sua vez. ${formatMeters(remainingMeters.value)} de movimento.`;
      if (previous === false && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
    } else {
      liveMessage.value = currentActorName.value ? `Turno de ${currentActorName.value}.` : '';
    }
  },
  { immediate: true },
);

watch(currentActorName, (name) => {
  if (!isMyTurn.value && name) liveMessage.value = `Turno de ${name}.`;
});

watch(connectionStatus, (status, previous) => {
  if (status === 'error') {
    toast.error('Erro de conexão. Tentando novamente…');
  } else if (status === 'reconnecting' && previous !== 'reconnecting') {
    toast.warning('Reconectando…');
  } else if (status === 'disconnected' && previous === 'connected') {
    toast.info('Desconectado.');
  }
});

function moveCost(fromSquareId: string, toSquareId: string) {
  const from = squareIdToGrid(fromSquareId, gridWidth.value);
  const to = squareIdToGrid(toSquareId, gridWidth.value);
  if (!from || !to) return { squares: 0, meters: 0 };
  const squares = distanceInSquares(
    { x: from.col + 0.5, y: from.row + 0.5 },
    { x: to.col + 0.5, y: to.row + 0.5 },
  );
  return { squares, meters: Math.round(squares * scale.value * 10) / 10 };
}

function handleRequestMove(squareId: string) {
  const token = myActiveToken.value;
  if (!token || !isMyTurn.value) {
    toast.error('Você só pode mover o seu token no seu turno.');
    return;
  }
  if (!canMove.value) {
    toast.error(isOffline.value ? 'Sem conexão — movimento indisponível.' : 'Movimento indisponível agora.');
    return;
  }
  const cost = moveCost(token.squareId, squareId);
  if (cost.squares < 1) {
    toast.info('Seu token já está nesse quadrado.');
    return;
  }
  pendingMove.value = { squareId, ...cost };
}

function cancelPendingMove() {
  pendingMove.value = null;
}

function clearUndo() {
  if (undoTimer) {
    clearTimeout(undoTimer);
    undoTimer = null;
  }
  undoTokenId.value = null;
}

function startUndo(tokenId: string) {
  clearUndo();
  undoTokenId.value = tokenId;
  undoTimer = setTimeout(() => {
    undoTimer = null;
    undoTokenId.value = null;
  }, 5000);
}

async function confirmMove() {
  const token = myActiveToken.value;
  const pending = pendingMove.value;
  if (!token || !pending) return;
  const ack = await socketService.moveToken({
    tableId,
    tokenId: token._id,
    targetSquareId: pending.squareId,
    expectedRevision: revision.value,
  });
  if (ack && ack.ok) {
    pendingMove.value = null;
    startUndo(token._id);
    toast.success(`Movimento: ${pending.squares} quad · ${formatMeters(pending.meters)}`, 2500);
  } else if (ack && ack.ok === false) {
    errorMessage.value = ack.error?.message || 'O movimento foi recusado pelo servidor.';
  } else {
    errorMessage.value = 'Sem resposta do servidor. O movimento não foi confirmado.';
  }
}

async function undoLastMove() {
  const tokenId = undoTokenId.value;
  if (!tokenId) return;
  const ack = await socketService.undoMove(tableId, tokenId);
  if (ack && ack.ok) {
    clearUndo();
    toast.success('Movimento desfeito.');
  } else if (ack && ack.ok === false) {
    errorMessage.value = ack.error?.message || 'Não foi possível desfazer o movimento.';
  } else {
    errorMessage.value = 'Sem resposta do servidor. O movimento não foi desfeito.';
  }
}

function handleMoveBlocked() {
  toast.warning('Fora do alcance do seu movimento.');
}

function toggleMove() {
  if (!isMyTurn.value) {
    toast.info('Mover fica disponível no seu turno.');
    return;
  }
  if (!canMove.value) {
    toast.info(isOffline.value ? 'Sem conexão — movimento indisponível.' : 'Movimento indisponível agora.');
    return;
  }
  moveMode.value = !moveMode.value;
  pendingMove.value = null;
}

async function handleNextTurn() {
  if (!activeScene.value || !isMyTurn.value) return;
  endingTurn.value = true;
  const ack = await socketService.nextTurn(tableId, activeScene.value._id, revision.value);
  endingTurn.value = false;
  if (ack && ack.ok) {
    moveMode.value = false;
    pendingMove.value = null;
    toast.success('Turno encerrado.');
  } else if (ack && ack.ok === false) {
    errorMessage.value = ack.error?.message || 'Não foi possível encerrar o turno.';
  } else {
    errorMessage.value = 'Sem resposta do servidor. O turno não foi encerrado.';
  }
}

function goBack() {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push({ name: 'tables' });
  }
}

// ---------------------------------------------------------------------------
// Onboarding: criar ficha, vincular token, pedir ao Mestre.
// ---------------------------------------------------------------------------

async function sendMasterRequest(message: string) {
  const ok = await chatStore.send(tableId, message);
  if (ok) {
    onboardingOpen.value = false;
    fichaSheetOpen.value = false;
    activeTab.value = 'chat';
    toast.success('Pedido enviado ao Mestre no chat.');
    return;
  }
  try {
    await navigator.clipboard.writeText(message);
    toast.info('Chat indisponível. A mensagem foi copiada para você enviar ao Mestre.');
  } catch {
    toast.info('Fale com o Mestre: ele precisa atribuir seu token pela mesa.');
  }
}

function askMaster() {
  const detail = myCharacter.value
    ? 'minha ficha ainda não tem token'
    : 'ainda não tenho ficha no tabuleiro';
  void sendMasterRequest(`@Mestre, ${detail}. Pode me ajudar a entrar no jogo?`);
}

function requestFreeToken(token: TokenInfo) {
  const character = myCharacter.value?.name ?? 'meu personagem';
  void sendMasterRequest(
    `@Mestre, posso usar o token “${token.name}” para ${character}? Ele está livre no tabuleiro.`,
  );
}

async function handleCreateCharacter() {
  if (!tableId || creatingCharacter.value) return;
  creatingCharacter.value = true;
  try {
    const defaultName = 'Novo personagem';
    const created = await characterStore.createCharacter(tableId, { name: defaultName });
    await loadMyCharacters();
    const targetId = created?._id ?? myCharacters.value[myCharacters.value.length - 1]?._id ?? null;
    onboardingOpen.value = false;
    fichaSheetOpen.value = false;
    if (targetId) {
      openCharacterSheet(targetId);
      toast.success('Ficha criada. Ajuste o nome, PV e os detalhes da ficha.');
    } else {
      toast.warning('A ficha foi criada, mas ainda não chegou ao seu cliente. Tente abrir a aba Ficha.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível criar a ficha.';
    toast.error(message);
  } finally {
    creatingCharacter.value = false;
  }
}

function openFicha() {
  if (myCharacter.value) openCharacterSheet(myCharacter.value._id);
  else fichaSheetOpen.value = true;
}

// ---------------------------------------------------------------------------
// Header: menu, perfil, reconectar e sair.
// ---------------------------------------------------------------------------

function closeMenu() {
  menuOpen.value = false;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!menuOpen.value) return;
  const target = event.target as Node | null;
  if (menuRef.value?.contains(target) || menuButtonRef.value?.contains(target)) return;
  closeMenu();
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
});

function openProfile() {
  closeMenu();
  router.push({ name: 'profile' });
}

function reconnect() {
  closeMenu();
  if (connectionStatus.value === 'connected') {
    socketService.requestResync({ tableId, sinceRevision: revision.value });
    toast.info('Sincronizando com a mesa…');
  } else {
    socketService.connect(tableId);
    toast.info('Reconectando…');
  }
}

function requestLeave() {
  closeMenu();
  leaveError.value = '';
  leaveOpen.value = true;
}

async function confirmLeave() {
  if (!tableId || leaving.value) return;
  if (isDM.value) {
    leaveError.value = 'O Mestre não pode sair da própria mesa. Exclua a mesa em “Minhas mesas”.';
    return;
  }
  leaving.value = true;
  try {
    const response = await fetch(`${API_BASE_URL}/api/tables/${encodeURIComponent(tableId)}/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {}),
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message || 'Não foi possível sair da mesa.');
    }
    leaveOpen.value = false;
    await mediaStore.leave();
    socketService.disconnect();
    toast.success('Você saiu da mesa.');
    await router.push({ name: 'tables' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível sair da mesa.';
    leaveError.value = message;
    toast.error(message);
  } finally {
    leaving.value = false;
  }
}

// ---------------------------------------------------------------------------
// Detalhes do token e centralização.
// ---------------------------------------------------------------------------

function openTokenDetails(token: TokenInfo) {
  detailsToken.value = token;
}

function centerDetailsToken() {
  if (!detailsToken.value) return;
  const centered = boardRef.value?.centerOnToken(detailsToken.value._id);
  if (!centered) toast.info('Não foi possível centralizar este token.');
  detailsToken.value = null;
}

function centerUnavailable() {
  toast.info('Seu token ainda não está no tabuleiro.');
}

function openCharacterFromInitiative(characterId: string) {
  initiativeOpen.value = false;
  nextTick(() => openCharacterSheet(characterId));
}

// ---------------------------------------------------------------------------
// Bootstrap (mantém o contrato de entrada por convite e o wiring de socket).
// ---------------------------------------------------------------------------

type SocketLike = {
  on: (event: string, listener: (payload: unknown) => void) => unknown;
  off: (event: string, listener: (payload: unknown) => void) => unknown;
};

let actionErrorListener: ((payload: unknown) => void) | null = null;
let offChatMessage: (() => void) | null = null;

function isSocketLike(value: unknown): value is SocketLike {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { on?: unknown; off?: unknown };
  return typeof candidate.on === 'function' && typeof candidate.off === 'function';
}

function readSocket(): SocketLike | null {
  const candidate = (socketService as unknown as { socket?: unknown }).socket;
  return isSocketLike(candidate) ? candidate : null;
}

function extractActionErrorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const error = record.error;
    if (error && typeof error === 'object') {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
  }
  return 'A ação não pôde ser concluída.';
}

function handleActionError(payload: unknown) {
  // O toast de erro é responsabilidade do socketService (fonte única). Aqui só
  // alimentamos o banner persistente da view.
  errorMessage.value = extractActionErrorMessage(payload);
}

async function loadMyCharacters() {
  if (!tableId) return;
  charactersLoading.value = true;
  try {
    myCharacters.value = await getMyCharacters(tableId);
  } catch {
    toast.error('Não foi possível carregar sua ficha.');
  } finally {
    charactersLoading.value = false;
  }
}

async function bootstrap() {
  const invite = inviteCode.value;
  if (invite && !isMember.value) {
    joining.value = true;
    try {
      const result = await joinTableByInvite(invite);
      if (result.tableId && result.tableId !== tableId) {
        throw new Error('Este convite é para outra mesa.');
      }
    } catch (error) {
      inviteError.value =
        error instanceof Error && error.message ? error.message : 'Não foi possível entrar na mesa.';
      joining.value = false;
      return;
    }
    joining.value = false;
  }

  // Chat: listener ativo desde o início (badge de não lidas) e histórico REST.
  offChatMessage = socketService.onChatEvent('chatMessage', (message) => chatStore.receive(message));
  if (typeof offChatMessage !== 'function') offChatMessage = null;
  void chatStore.loadHistory(tableId);

  socketService.connect(tableId);
  const socket = readSocket();
  if (socket && !actionErrorListener) {
    actionErrorListener = handleActionError;
    socket.on('actionError', actionErrorListener);
  }
  void loadMyCharacters();
}

onMounted(() => {
  mediaStore.init();
  void bootstrap();
});

onBeforeUnmount(() => {
  clearUndo();
  // Fecha a chamada antes de derrubar o socket (o emit de leave é síncrono).
  void mediaStore.leave();
  const socket = readSocket();
  if (socket && actionErrorListener) {
    socket.off('actionError', actionErrorListener);
  }
  actionErrorListener = null;
  offChatMessage?.();
  offChatMessage = null;
  socketService.disconnect();
  chatStore.closePanel();
  chatStore.reset();
});
</script>

<template>
  <div class="play-shell">
    <p class="sr-only" aria-live="assertive" aria-atomic="true">{{ liveMessage }}</p>

    <header class="play-header">
      <div class="play-header__identity">
        <h1 class="play-header__title">{{ tableName }}</h1>
        <p class="play-header__scene">{{ sceneName }}</p>
      </div>

      <span
        class="play-header__status"
        :class="statusTone"
        :aria-label="`Sessão: ${statusLabel}`"
      >
        <span class="play-header__status-text">{{ statusLabel }}</span>
        <span class="play-header__status-short" aria-hidden="true">{{ statusShortLabel }}</span>
      </span>

      <span
        class="play-header__connection"
        :class="connectionTone"
        role="status"
        :aria-label="`Conexão: ${connectionLabel}`"
      >
        <span class="play-header__connection-dot" aria-hidden="true"></span>
        <span class="play-header__connection-text">{{ connectionLabel }}</span>
      </span>

      <button
        v-if="mediaStore.joined"
        type="button"
        class="play-header__call"
        :aria-label="`Chamada ativa com ${mediaStore.participantCount} participantes. Abrir chamada.`"
        @click="selectTab('chamada')"
      >
        <span class="play-header__call-dot" aria-hidden="true"></span>
        <span>{{ mediaStore.participantCount }}</span>
      </button>

      <button
        ref="menuButtonRef"
        type="button"
        class="play-header__menu-btn"
        aria-label="Mais opções da mesa"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" fill="currentColor" />
          <circle cx="12" cy="12" r="1.8" fill="currentColor" />
          <circle cx="12" cy="19" r="1.8" fill="currentColor" />
        </svg>
      </button>

      <span class="play-header__revision sr-only" :title="`Revisão ${revision}`">rev {{ revision }}</span>
      <span class="play-header__role sr-only">{{ roleLabel }}</span>

      <div v-if="menuOpen" ref="menuRef" class="play-menu" role="menu" aria-label="Opções da mesa">
        <p class="play-menu__meta">{{ presenceCount }} na mesa · {{ sceneName }}</p>
        <button type="button" class="play-menu__item" role="menuitem" @click="openProfile">
          Perfil
        </button>
        <button type="button" class="play-menu__item" role="menuitem" @click="reconnect">
          Reconectar
        </button>
        <button
          type="button"
          class="play-menu__item play-menu__item--danger"
          role="menuitem"
          @click="requestLeave"
        >
          Sair da mesa
        </button>
        <p v-if="isDM" class="play-menu__hint">
          Como Mestre, você não sai pela mesa; exclua-a em “Minhas mesas”.
        </p>
      </div>
    </header>

    <div v-if="showOfflineBanner" class="play-offline" role="status">
      <span>{{ offlineBannerLabel }}</span>
      <button type="button" @click="reconnect">Reconectar</button>
    </div>

    <ActionErrorBanner
      v-if="errorMessage"
      class="play-header__error"
      :message="errorMessage"
      @dismiss="errorMessage = ''"
    />

    <div v-if="inviteError" class="invite-overlay" role="alert">
      <div class="invite-overlay__card">
        <h2>Não foi possível entrar</h2>
        <p>{{ inviteError }}</p>
        <button type="button" class="btn" @click="goBack">Voltar</button>
      </div>
    </div>

    <div v-else-if="joining" class="invite-overlay invite-overlay--calm" role="status">
      <div class="invite-overlay__card">
        <h2>Entrando na mesa…</h2>
        <p>Confirmando seu convite.</p>
      </div>
    </div>

    <section class="play-board" aria-label="Tabuleiro">
      <PlayerBoard
        ref="boardRef"
        :squares="squares"
        :grid-width="gridWidth"
        :grid-height="gridHeight"
        :map-url="currentMapUrl"
        :tokens="tokensOnMap"
        :current-turn-token-id="currentTurnTokenId"
        :active-token-id="myToken?._id ?? null"
        :move-mode="moveMode"
        :interactive="isMyTurn && canWrite"
        :meters-per-square="metersPerSquare"
        :auras="auras"
        :pings="pings"
        @request-move="handleRequestMove"
        @move-blocked="handleMoveBlocked"
        @token-details="openTokenDetails"
        @center-unavailable="centerUnavailable"
      />

      <div v-if="!isLive" class="session-overlay" role="region" aria-label="Estado da sessão">
        <div class="session-overlay__card">
          <p class="session-overlay__state" aria-live="polite">{{ statusLabel }}</p>
          <h2>{{ sessionOverlayTitle }}</h2>
          <p v-if="myToken || !canWrite">{{ sessionOverlayText }}</p>
          <PlayerEmptyActions
            v-if="!myToken && canWrite"
            class="session-overlay__empty"
            :has-character="Boolean(myCharacter)"
            :free-token-count="freeTokens.length"
            :creating="creatingCharacter"
            compact
            bare
            @create-character="handleCreateCharacter"
            @open-sheet="openFicha"
            @link-token="onboardingOpen = true"
            @ask-master="askMaster"
          />
        </div>
      </div>

      <div
        v-else-if="!myToken && canWrite"
        class="session-overlay session-overlay--empty"
        role="region"
        aria-label="Personagem no tabuleiro"
      >
        <PlayerEmptyActions
          :has-character="Boolean(myCharacter)"
          :free-token-count="freeTokens.length"
          :creating="creatingCharacter"
          @create-character="handleCreateCharacter"
          @open-sheet="openFicha"
          @link-token="onboardingOpen = true"
          @ask-master="askMaster"
        />
      </div>

      <div
        v-if="pendingMove"
        class="move-confirm"
        role="status"
        aria-live="polite"
        aria-label="Confirmar movimento"
      >
        <div class="move-confirm__copy">
          <span class="move-confirm__label">Mover para este quadrado?</span>
          <span class="move-confirm__cost">{{ pendingMoveLabel }}</span>
        </div>
        <div class="move-confirm__actions">
          <button type="button" class="btn secondary" @click="cancelPendingMove">Cancelar</button>
          <button type="button" class="btn" @click="confirmMove">Confirmar</button>
        </div>
      </div>
    </section>

    <section
      v-if="isLive && canWrite && myToken"
      class="play-initiative"
      aria-label="Seu personagem e iniciativa"
    >
      <TokenCard
        :token="myToken"
        :is-my-turn="isMyTurn"
        :character="myCharacter"
        :meters-per-square="metersPerSquare"
        :table-id="tableId"
        :can-edit="Boolean(myCharacter)"
        :openable="Boolean(myCharacter)"
        @open-sheet="openFicha"
      />

      <PlayerTurnBar
        v-if="isMyTurn"
        :remaining-meters="remainingMeters"
        :remaining-squares="remainingSquares"
        :move-mode="moveMode"
        :can-move="canMove"
        :can-end-turn="canEndTurn"
        :offline="isOffline"
        :has-scene="Boolean(activeScene)"
        :ending-turn="endingTurn"
        @toggle-move="toggleMove"
        @end-turn="handleNextTurn"
      />

      <InitiativeStrip
        v-else
        compact
        :entries="initiativeList"
        :tokens="tokensOnMap"
        :meters-per-square="metersPerSquare"
        :current-user-id="currentUser?.id ?? null"
        :openable-character-ids="openableCharacterIds"
        :round="round"
        @open-sheet="initiativeOpen = true"
      />
    </section>

    <button
      v-if="mediaStore.joined"
      type="button"
      class="call-strip"
      aria-label="Chamada ativa. Abrir painel da chamada."
      @click="selectTab('chamada')"
    >
      <span class="call-strip__dot" aria-hidden="true"></span>
      <span class="call-strip__label">Chamada · {{ mediaStore.participantCount }}</span>
      <span class="call-strip__state">{{ mediaStore.mic === 'muted' ? 'Microfone mudo' : 'Microfone ligado' }}</span>
      <span class="call-strip__action" aria-hidden="true">Abrir</span>
    </button>

    <div v-if="undoTokenId" class="undo-bar" role="status" aria-live="polite">
      <span>Movimento feito.</span>
      <button type="button" class="undo-bar__action" @click="undoLastMove">Desfazer</button>
      <button type="button" class="undo-bar__close" aria-label="Fechar aviso" @click="clearUndo">×</button>
    </div>

    <PlayerNav
      :active="activeTab"
      :unread="chatStore.unread"
      :call-active="mediaStore.joined"
      :call-count="mediaStore.participantCount"
      @select="selectTab"
    />

    <BaseSheet :open="initiativeOpen" title="Iniciativa" @close="initiativeOpen = false">
      <div class="initiative-sheet">
        <p v-if="round" class="initiative-sheet__round">Rodada {{ round }}</p>
        <InitiativeStrip
          :entries="initiativeList"
          :tokens="tokensOnMap"
          :meters-per-square="metersPerSquare"
          :current-user-id="currentUser?.id ?? null"
          :openable-character-ids="openableCharacterIds"
          :round="round"
          orientation="vertical"
          @open-character-sheet="openCharacterFromInitiative"
        />
      </div>
    </BaseSheet>

    <BaseSheet :open="onboardingOpen" title="Vincular token" @close="onboardingOpen = false">
      <div class="link-token">
        <p class="link-token__intro">
          O Mestre escolhe qual token é seu. Peça a atribuição e ele aparece no tabuleiro com o anel
          “Você”.
        </p>
        <ul v-if="freeTokens.length" class="link-token__list" aria-label="Tokens livres no tabuleiro">
          <li v-for="token in freeTokens" :key="token._id" class="link-token__item">
            <span class="link-token__dot" :style="{ background: token.color }" aria-hidden="true"></span>
            <span class="link-token__name">{{ token.name }}</span>
            <button type="button" class="btn secondary btn-sm" @click="requestFreeToken(token)">
              Pedir este
            </button>
          </li>
        </ul>
        <p v-else class="link-token__empty">
          Nenhum token livre no mapa agora. O Mestre pode criar um token e atribuir a você.
        </p>
        <button type="button" class="btn block" @click="askMaster">Pedir ao Mestre</button>
      </div>
    </BaseSheet>

    <BaseSheet :open="fichaSheetOpen" title="Ficha" @close="closeTab">
      <div class="ficha-empty">
        <TokenCard
          v-if="myToken"
          :token="myToken"
          :is-my-turn="isMyTurn"
          :character="myCharacter"
          :meters-per-square="metersPerSquare"
          :table-id="tableId"
        />
        <PlayerEmptyActions
          :has-character="Boolean(myCharacter)"
          :has-token="Boolean(myToken)"
          :free-token-count="freeTokens.length"
          :creating="creatingCharacter || charactersLoading"
          @create-character="handleCreateCharacter"
          @open-sheet="openFicha"
          @link-token="onboardingOpen = true"
          @ask-master="askMaster"
        />
      </div>
    </BaseSheet>

    <TokenDetailsSheet
      v-if="detailsToken"
      :token="detailsToken"
      :character="detailsCharacter"
      :meters-per-square="metersPerSquare"
      :is-my-token="detailsToken._id === myToken?._id"
      :can-open-sheet="Boolean(detailsCharacter)"
      @close="detailsToken = null"
      @open-character="openSheetFromDetails"
      @center="centerDetailsToken"
    />

    <PlayerDicePanel
      :open="activeTab === 'dados'"
      :table-id="tableId"
      :current-token-id="currentTurnTokenId"
      :recent-rolls="liveRolls"
      @close="closeTab"
    />

    <PlayerChatSheet
      :open="activeTab === 'chat'"
      :table-id="tableId"
      :connection-status="connectionStatus"
      @close="closeTab"
    />

    <PlayerCallSheet
      :open="activeTab === 'chamada'"
      :table-id="tableId"
      @close="closeTab"
    />

    <CharacterSheet
      :open="showCharacterSheet"
      :character="sheetCharacter"
      :isDM="isDM"
      :isOwner="sheetIsOwner"
      :system="null"
      @close="closeCharacterSheet"
      @save="handleCharacterSave"
      @delete="handleCharacterDelete"
    />

    <BaseDialog :open="leaveOpen" title="Sair da mesa" @close="leaveOpen = false">
      <div class="leave-dialog">
        <p>
          Sair de <strong>{{ tableName }}</strong>? Você deixa de ver este tabuleiro e pode voltar
          com o código de convite.
        </p>
        <p v-if="isDM" class="leave-dialog__warning">
          O Mestre não pode sair da própria mesa. Exclua a mesa em “Minhas mesas”.
        </p>
        <p v-if="leaveError" class="leave-dialog__error" role="alert">{{ leaveError }}</p>
      </div>
      <template #footer>
        <button type="button" class="btn ghost" @click="leaveOpen = false">Cancelar</button>
        <button
          type="button"
          class="btn danger"
          :disabled="isDM || leaving"
          @click="confirmLeave"
        >
          {{ leaving ? 'Saindo…' : 'Sair da mesa' }}
        </button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.play-shell {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100dvh;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  box-sizing: border-box;
  padding-top: env(safe-area-inset-top);
  padding-right: env(safe-area-inset-right);
  padding-left: env(safe-area-inset-left);
  background: var(--ink-0);
  color: var(--text);
}

.play-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--s-2);
  min-height: 48px;
  padding: var(--s-1) var(--s-3);
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}

.play-header__identity {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.play-header__title {
  margin: 0;
  overflow: hidden;
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: 600;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.play-header__scene {
  margin: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--text-2xs);
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.play-header__status {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  white-space: nowrap;
}

.play-header__status::before {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  content: '';
}

.play-header__status-short {
  display: none;
}

.play-header__status.is-live {
  border-color: rgb(92 155 133 / 0.5);
  color: var(--success-ink);
}

.play-header__status.is-paused {
  border-color: rgb(217 180 91 / 0.5);
  color: var(--manila);
}

.play-header__status.is-ended {
  border-color: rgb(178 58 50 / 0.5);
  color: var(--danger-ink);
}

.play-header__connection {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  color: var(--success-ink);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  white-space: nowrap;
}

.play-header__connection-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.play-header__connection.is-connecting,
.play-header__connection.is-reconnecting {
  color: var(--manila);
}

.play-header__connection.is-disconnected,
.play-header__connection.is-error {
  color: var(--danger-ink);
}

.play-header__call {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 0 6px;
  border: 1px solid rgb(92 155 133 / 0.5);
  border-radius: var(--radius-xs);
  color: var(--success-ink);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.play-header__call-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}

.play-header__menu-btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-right: -8px;
  color: var(--text);
}

.play-header__menu-btn:hover {
  background: var(--raised);
}

.play-menu {
  position: absolute;
  top: calc(100% + 2px);
  right: var(--s-2);
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: min(280px, calc(100vw - 16px));
  padding: var(--s-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  box-shadow: var(--shadow-overlay);
}

.play-menu__meta {
  margin: 0;
  padding: var(--s-1) var(--s-2);
  color: var(--text-faint);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.play-menu__item {
  min-height: 44px;
  padding: 0 var(--s-2);
  border-radius: var(--radius-xs);
  color: var(--text);
  font-size: var(--text-sm);
  text-align: left;
}

.play-menu__item:hover {
  background: var(--raised);
}

.play-menu__item--danger {
  color: var(--danger-ink);
}

.play-menu__hint {
  margin: var(--s-2) 0 0;
  padding: var(--s-2);
  border-top: 1px solid var(--line);
  color: var(--text-faint);
  font-size: var(--text-2xs);
}

.play-offline {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  min-height: 36px;
  padding: 0 var(--s-4);
  border-bottom: 1px solid rgb(217 180 91 / 0.4);
  background: rgb(217 180 91 / 0.1);
  color: var(--manila);
  font-size: var(--text-2xs);
}

.play-offline button {
  min-height: 32px;
  padding: 0 var(--s-2);
  border: 1px solid rgb(217 180 91 / 0.6);
  border-radius: var(--radius-xs);
  color: var(--manila);
  font-size: var(--text-2xs);
}

.play-header__error {
  flex: 0 0 auto;
}

.play-board {
  position: relative;
  display: flex;
  flex: 1 0 auto;
  min-height: 46vh;
  overflow: hidden;
}

.session-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--s-4);
  overflow-y: auto;
  background: rgb(11 13 15 / 0.82);
}

.session-overlay--empty {
  align-items: flex-end;
}

.session-overlay__card {
  width: min(420px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: var(--s-5);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  text-align: center;
}

.session-overlay__state {
  margin: 0;
  color: var(--manila);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.session-overlay__card h2 {
  margin: var(--s-2) 0 var(--s-2);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
}

.session-overlay__card > p:not(.session-overlay__state) {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.session-overlay__empty {
  margin-top: var(--s-4);
  text-align: left;
}

.invite-overlay {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--s-4);
  background: rgb(11 13 15 / 0.97);
}

.invite-overlay--calm {
  background: rgb(11 13 15 / 0.9);
}

.invite-overlay__card {
  width: min(360px, 100%);
  padding: var(--s-5);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  text-align: center;
}

.invite-overlay__card h2 {
  margin: 0 0 var(--s-3);
  font-family: var(--font-display);
  font-size: var(--text-lg);
}

.invite-overlay__card p {
  margin: 0 0 var(--s-4);
  overflow-wrap: anywhere;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.move-confirm {
  position: absolute;
  right: var(--s-2);
  bottom: var(--s-2);
  left: var(--s-2);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-height: 56px;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--accent-ink);
  border-radius: var(--radius-sm);
  background: var(--panel);
  box-shadow: var(--shadow-overlay);
}

.move-confirm__copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.move-confirm__label {
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--text-2xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.move-confirm__cost {
  color: var(--text);
  font-family: var(--font-data);
  font-size: var(--text-sm);
  font-weight: 500;
}

.move-confirm__actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--s-2);
}

.move-confirm__actions .btn {
  min-height: 44px;
  padding: 0 var(--s-3);
  font-size: var(--text-sm);
}

.play-initiative {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  border-top: 1px solid var(--line);
  background: var(--panel);
}

.call-strip {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--s-2);
  min-height: 44px;
  padding: 0 var(--s-4);
  border-top: 1px solid var(--line);
  background: var(--raised);
  color: var(--text);
  font-size: var(--text-2xs);
  text-align: left;
}

.call-strip__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}

.call-strip__label {
  font-family: var(--font-data);
  font-weight: 500;
}

.call-strip__state {
  flex: 1;
  overflow: hidden;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.call-strip__action {
  color: var(--accent-ink);
}

.undo-bar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--s-3);
  min-height: 44px;
  padding: 0 var(--s-4);
  border-top: 1px solid var(--line-strong);
  background: var(--raised-2);
  color: var(--text);
  font-size: var(--text-sm);
}

.undo-bar > span {
  flex: 1;
}

.undo-bar__action {
  min-height: 36px;
  padding: 0 var(--s-3);
  border: 1px solid var(--accent-ink);
  border-radius: var(--radius-xs);
  color: var(--accent-ink);
  font-size: var(--text-xs);
  font-weight: 600;
}

.undo-bar__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--text-muted);
  font-size: var(--text-lg);
}

.initiative-sheet {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 60dvh;
}

.initiative-sheet__round {
  margin: 0 0 var(--s-3);
  color: var(--manila);
  font-family: var(--font-data);
  font-size: var(--text-xs);
}

.initiative-sheet :deep(.initiative-strip.orientation-vertical) {
  max-height: 56dvh;
}

.link-token,
.ficha-empty,
.leave-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.link-token__intro {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.link-token__list {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.link-token__item {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 48px;
  padding: var(--s-1) var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--raised);
}

.link-token__dot {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.link-token__name {
  flex: 1;
  overflow: hidden;
  font-size: var(--text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-token__empty {
  margin: 0;
  padding: var(--s-3);
  border-left: 2px solid var(--manila);
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.leave-dialog p {
  margin: 0;
  font-size: var(--text-sm);
}

.leave-dialog__warning {
  padding: var(--s-2) var(--s-3);
  border-left: 2px solid var(--manila);
  color: var(--text-muted);
}

.leave-dialog__error {
  padding: var(--s-2) var(--s-3);
  border-left: 2px solid var(--danger);
  color: var(--danger-ink);
}

@media (max-height: 620px) and (orientation: landscape) {
  .play-header {
    min-height: 40px;
    padding-block: 2px;
  }

  .play-header__title {
    font-size: var(--text-sm);
  }

  .play-board {
    min-height: 40vh;
  }

  .play-initiative {
    display: none;
  }

  .session-overlay {
    padding: var(--s-2);
  }

  .session-overlay__card {
    padding: var(--s-3);
  }

  .session-overlay__card h2 {
    margin: var(--s-1) 0;
    font-size: var(--text-lg);
  }
}

@media (max-width: 480px) {
  .play-header__connection-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}

@media (max-width: 360px) {
  .play-header__status {
    min-width: 0;
    padding-inline: 4px;
  }

  .play-header__status-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .play-header__status-short {
    display: inline;
  }

  .play-header__scene {
    display: none;
  }

  .move-confirm {
    flex-wrap: wrap;
  }

  .move-confirm__actions {
    width: 100%;
  }

  .move-confirm__actions .btn {
    flex: 1;
  }
}
</style>
