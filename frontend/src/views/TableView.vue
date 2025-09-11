<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import draggable from 'vuedraggable';

import { storeToRefs } from 'pinia';
import { authToken, currentUser } from '../services/authService';
import { socketService } from '../services/socketService';
import { useTableStore } from '../stores/tableStore';

import GridDisplay from '../components/GridDisplay.vue';
import TokenCreationForm from '../components/TokenCreationForm.vue';
import TokenEditForm from '../components/TokenEditForm.vue';
import TurnOrderDisplay from '../components/TurnOrderDisplay.vue';
import PlayerTurnPanel from '../components/PlayerTurnPanel.vue';
import Toolbar from '../components/Toolbar.vue';

import type { GridSquare, TokenInfo, IScene, IInitiativeEntry, TokenSize } from '../types';

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
const mapUrlInput = ref(''); // Para o campo de input
const newSceneName = ref('');
const newSceneImageUrl = ref('');
const newSceneType = ref<'battlemap' | 'image'>('battlemap'); // Tipo da nova cena, padrão é 'battlemap
const isDmPanelCollapsed = ref(false);
const gridDisplayRef = ref<any>(null);
const mapImgRef = ref<HTMLImageElement | null>(null);
const imageRenderedWidth = ref<number | null>(null);
const imageRenderedHeight = ref<number | null>(null);
// Escala (usa valor vindo do store para refletir mudanças do Mestre nos jogadores)
// metersPerSquare virá do store (adicionado ao storeToRefs abaixo) e será controlado pelo Mestre via input
const squareFeet = computed(() => (metersPerSquare.value || 1.5) * 3.28084);
// Modo persistente (📌): quando ligado, próxima medição de área vira persistente
const persistentMode = ref<boolean>(false);

function updateImageDimensions() {
  if (mapImgRef.value) {
    imageRenderedWidth.value = mapImgRef.value.clientWidth;
    imageRenderedHeight.value = mapImgRef.value.clientHeight;
  }
}

const activeTool = ref<'select' | 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam' | 'none'>('none');
const rulerStartPoint = ref<{ x: number; y: number } | null>(null);
const rulerEndPoint = ref<{ x: number; y: number } | null>(null);
const rulerDistance = ref('0.0m');
const isMeasuring = computed(() => activeTool.value !== 'none' && activeTool.value !== 'select');
const coneOriginSquareId = ref<string | null>(null); // Quadrado onde a área começa (cone/círculo/quadrado)
const coneAffectedSquares = ref<string[]>([]); // Lista de IDs dos quadrados afetados (genérico)
const coneLength = ref(9); // Comprimento padrão do cone em metros (ex: Mãos Flamejantes)
const selectedPersistentId = ref<string | null>(null);
const previewMeasurement = ref<{
  type: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
  start: { x: number; y: number; };
  end: { x: number; y: number; };
  distance?: string;
  affectedSquares?: string[];
} | null>(null);

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
  // Getters
  isDM, 
  activeScene, 
  tokensOnMap, 
  currentTurnTokenId, 
  myActiveToken 
} = storeToRefs(tableStore);

// Cor de medição
const measurementColor = ref<string>('');
const PLAYER_COLORS = ['#ff8c00', '#12c2e9', '#ff4d4d', '#43a047', '#ffd166', '#ff66cc', '#00bcd4', '#8bc34a', '#e91e63', '#9c27b0', '#795548', '#cddc39'];

function loadOrInitUserColor() {
  // DM é sempre roxo
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

// Persistentes apenas da cena ativa
const persistentsForActiveScene = computed(() =>
  persistentMeasurements.value.filter(pm => pm.sceneId === activeSceneId.value)
);

function handleSetActiveScene(sceneId: string) {
  socketService.setActiveScene(tableId, sceneId);
}

function handleUpdateSessionStatus(newStatus: 'LIVE' | 'ENDED') {
  socketService.updateSessionStatus(tableId, newStatus);
}

// Toggle vindo da Toolbar para fixar medições
function handleTogglePersistent(on: boolean) { persistentMode.value = on; }

function handleColorSelected(color: string) {
  measurementColor.value = color;
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

function createToken(payload: { name: string, imageUrl: string, movement: number, ownerId: string, size: TokenSize }) {
  if (targetSquareIdForToken.value && activeSceneId.value) {
    socketService.placeToken({
      tableId: tableId,
      sceneId: activeSceneId.value,
      squareId: targetSquareIdForToken.value,
      ...payload
    });
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

// Remoção de medição persistente (DM ou autor), acionada pelo GridDisplay
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
  // Antes de avançar o turno, limpa medições locais e desseleciona ferramentas
  handleToolSelected('none');
  selectedPersistentId.value = null;
    socketService.nextTurn(tableId, activeSceneId.value);
  }
}

function handleRemoveFromInitiative(initiativeEntryId: string) {
  if (!confirm("Isso também irá deletar o token do mapa. Tem certeza?")) return;
  if (activeSceneId.value) {
    socketService.removeFromInitiative({
      tableId,
      sceneId: activeSceneId.value,
      initiativeEntryId
    });
  }
}


function openEditTokenByEntry(entry: IInitiativeEntry) {
  if (!entry.tokenId) return;
  const tok = tokensOnMap.value.find(t => t._id === entry.tokenId) || null;
  tokenBeingEdited.value = tok;
  showTokenEditForm.value = !!tok;
}

function handleSaveTokenEdit(payload: { name?: string; movement?: number; imageUrl?: string; ownerId?: string; size?: string; resetRemainingMovement?: boolean }) {
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

function handleLeftClickOnSquare(square: GridSquare, event: MouseEvent) {
  // Se a ferramenta de régua estiver ativa, o clique esquerdo define os pontos.
  if (activeTool.value === 'ruler') {
  // Origem já foi definida em pointerdown (posição real do mouse). Nada a fazer aqui.
  return; 
  } else if (activeTool.value === 'cone') {
  // O cone agora é controlado via pointer (click e segurar), então clique direto não faz nada extra
  return;
  }

  // Se nenhuma ferramenta estiver ativa, executa a lógica de seleção de token.
  if (square.token) {
    selectedTokenId.value = selectedTokenId.value === square.token._id ? null : square.token._id;
  } else {
    selectedTokenId.value = null;
  }
}

// Mestre altera escala -> envia ao servidor; jogadores apenas recebem via sessionStateUpdated
watch(metersPerSquare, (val, oldVal) => {
  if (!isDM.value) return; // somente Mestre emite
  if (val <= 0) { metersPerSquare.value = oldVal; return; }
  if (activeSceneId.value && val !== oldVal) {
    socketService.updateSceneScale(tableId, activeSceneId.value, val);
  }
});

function handleRightClick(square: GridSquare, event: MouseEvent) {
  event.preventDefault();

  // Com qualquer ferramenta ativa, o clique direito cancela
  if (isMeasuring.value) {
    // Se o PIN estiver ligado e usuário clicar com botão direito, desliga o PIN e a ferramenta
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

async function handleCreateScene() {
  if (!newSceneName.value.trim() || !tableId) return;

  try {
    const response = await fetch(`http://localhost:3001/api/tables/${tableId}/scenes`, {
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
      alert(`Erro: ${newScene.message}`);
    }
  } catch (error) { console.error("Erro ao criar cena", error); }
}

function handleEditScene(scene: IScene) {
  // Abre um prompt simples do navegador para pegar os novos valores
  const newName = prompt("Digite o novo nome para a cena:", scene.name);

  if (newName === null) return; // Usuário cancelou

  // Chama a nova API PUT para editar
  fetch(`http://localhost:3001/api/tables/${tableId}/scenes/${scene._id}`, {
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
      alert(`Erro: ${updatedScene.message}`);
    }
  })
  .catch(err => console.error("Erro ao editar cena:", err));
}

async function handleDeleteScene(sceneId: string) {
  // Pede confirmação antes de uma ação destrutiva
  if (!confirm("Tem certeza que deseja excluir esta cena? Esta ação não pode ser desfeita.")) {
    return;
  }

  try {
    const response = await fetch(`http://localhost:3001/api/tables/${tableId}/scenes/${sceneId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken.value}`,
      },
    });

    const data = await response.json();
    if (response.ok) {
      // Remove a cena da lista local para refletir a mudança imediatamente
      scenes.value = scenes.value.filter(s => s._id !== sceneId);
      alert(data.message);
    } else {
      alert(`Erro: ${data.message}`);
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
  previewMeasurement.value = { type: activeTool.value as any, start: originCenter, end: originCenter };
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
      // Cone: rótulo usa distância contínua do mouse quantizada a 0,5m.
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
      // Círculo: raio contínuo (m), pinta centros dentro do raio com pequena tolerância
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
      // Quadrado: lado contínuo (m), alinhado à grade, centrado na célula origem
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
    const isAreaTool = (activeTool.value === 'cone' || activeTool.value === 'circle' || activeTool.value === 'square');
    if (!canShareNow) {
      // Não é turno do jogador: limpa qualquer prévia de área
      coneAffectedSquares.value = [];
      coneOriginSquareId.value = null;
    } else {
      // Após finalizar a prévia, limpamos normalmente para régua, nenhuma ferramenta ou quando virou persistente
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
  // Centraliza sem depender de offsets anteriores
  viewTransform.value.x = 0;
  viewTransform.value.y = 0;
}

function handleToolSelected(tool: 'ruler' | 'cone' | 'circle' | 'square' | 'none') {
  activeTool.value = tool;

  // SEMPRE reseta o estado de TODAS as ferramentas de medição ao trocar de ferramenta.
  rulerStartPoint.value = null;
  rulerEndPoint.value = null;
  rulerDistance.value = '0.0m';
  coneOriginSquareId.value = null;
  coneAffectedSquares.value = [];
  previewMeasurement.value = null;

  // Se qualquer ferramenta for ATIVADA fazemos a limpeza da UI.
  if (tool !== 'none') {
    showTokenForm.value = false;
    selectedTokenId.value = null;
  }

  // Sempre limpa seleção ao trocar de ferramenta
  selectedPersistentId.value = null;

  // Ao desselecionar a ferramenta, remove também a medição compartilhada do servidor
  if (tool === 'none' && activeSceneId.value) {
    try {
      socketService.removeMyMeasurement({ tableId, sceneId: activeSceneId.value });
    } catch {}
  }
}


function calculateConeArea(originId: string, targetId: string, lengthInMeters: number): string[] {
  if (originId === targetId) return [];

  // Usa a escala dinâmica (m por quadrado) definida na cena
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

  // Vetores usando centros de célula
  const originCenter = { x: origin.x + 0.5, y: origin.y + 0.5 };
  const targetCenter = { x: target.x + 0.5, y: target.y + 0.5 };
  const dir = { x: targetCenter.x - originCenter.x, y: targetCenter.y - originCenter.y };
  const dirLen = Math.hypot(dir.x, dir.y) || 1;
  const nx = dir.x / dirLen;
  const ny = dir.y / dirLen;
  // Ângulo total fixo em 90° (meio-ângulo = 45°)
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

// Supercover line across grid cells between origin and target (by centers)
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

// Beam/Wall: oriented rectangle of widthSquares along the segment
function calculateBeamOrWallArea(originId: string, targetId: string, widthSquares = 1): string[] {
  const cols = gridWidth.value, rows = gridHeight.value;
  const getCoords = (id: string) => { const idx = parseInt(id.replace('sq-', '')); return { x: idx % cols, y: Math.floor(idx / cols) }; };
  const getId = (x: number, y: number) => `sq-${y * cols + x}`;
  const o = getCoords(originId);
  const t = getCoords(targetId);
  const ocx = o.x + 0.5, ocy = o.y + 0.5;
  const tcx = t.x + 0.5, tcy = t.y + 0.5;
  const vx = tcx - ocx, vy = tcy - ocy;
  const len = Math.hypot(vx, vy) || 1;
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

// Converte uma posição local (coordenadas do SVG do grid) para o id do quadrado correspondente
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

// Retorna o centro local (px) da célula dado o id (ex: 'sq-42'), respeitando pan/zoom
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

function getMousePositionOnMap(event: PointerEvent): { x: number; y: number } | null {
  if (!viewportRef.value) return null;

  const viewportRect = viewportRef.value.getBoundingClientRect();
  const viewportWidth = viewportRef.value.clientWidth;
  const viewportHeight = viewportRef.value.clientHeight;

  // Centro do viewport, que é a origem da transformação de escala
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;

  // Posição do mouse relativa ao viewport (a "mesa")
  const mouseX = event.clientX - viewportRect.left;
  const mouseY = event.clientY - viewportRect.top;

  // Extrai os valores de pan e zoom do estado
  const panX = viewTransform.value.x;
  const scale = viewTransform.value.scale;
  const panY = viewTransform.value.y;
  
  const worldX = (mouseX - centerX) / scale + centerX - (panX / scale);
  const worldY = (mouseY - centerY) / scale + centerY - (panY / scale);

  return { x: worldX, y: worldY };
}

// Arredonda metros para múltiplos de 'step' (ex.: 0.5m)
function quantizeMeters(meters: number, step = 0.5): number {
  if (!isFinite(meters) || meters < 0) return 0;
  const s = step > 0 ? step : 0.5;
  return Math.round(meters / s) * s;
}

// Formata distância: metros com 1 casa decimal e pés arredondado ao inteiro (1 ft)
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
});

watch(persistentMeasurements, () => {
  if (!selectedPersistentId.value) return;
  const stillExists = persistentMeasurements.value.some(pm => pm.id === selectedPersistentId.value);
  if (!stillExists) selectedPersistentId.value = null;
});

onMounted(() => {
  socketService.connect(tableId);
  // Observa resize da janela para recalcular dimensões da imagem
  window.addEventListener('resize', updateImageDimensions);
});

onUnmounted(() => {
  socketService.disconnect();
  window.removeEventListener('resize', updateImageDimensions);
});

watch(currentMapUrl, () => {
  // Recalcula quando muda o src
  setTimeout(updateImageDimensions, 50);
});

// Ao finalizar o turno (mudança do token em turno), limpamos medições locais e desselecionamos ferramentas
watch(currentTurnTokenId, (novo, antigo) => {
  if (novo === antigo) return;
  // Desseleciona qualquer ferramenta e remove medição compartilhada
  handleToolSelected('none');
  // Desliga o pin ao trocar de turno
  persistentMode.value = false;
  // Garante limpeza local imediata
  previewMeasurement.value = null;
  coneAffectedSquares.value = [];
  coneOriginSquareId.value = null;
});

// --- Áreas adicionais ---
// Círculo: inclui células cujos centros estão a uma distância <= raio + tolerância em quadrados
function calculateCircleArea(originId: string, radiusMeters: number): string[] {
  const mPerSq = metersPerSquare.value || 1.5;
  const radiusSq = Math.max(0, radiusMeters / mPerSq);
  const cols = gridWidth.value, rows = gridHeight.value;
  const getCoords = (id: string) => { const idx = parseInt(id.replace('sq-', '')); return { x: idx % cols, y: Math.floor(idx / cols) }; };
  const getId = (x: number, y: number) => `sq-${y * cols + x}`;
  const o = getCoords(originId);
  const ocx = o.x + 0.5, ocy = o.y + 0.5;
  const maxDist = radiusSq + 0.5; // tolerância na borda
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

// Quadrado: lado em metros; inclui células cujos centros caem dentro de um quadrado alinhado à grade e centrado na origem
function calculateSquareArea(originId: string, sideMeters: number): string[] {
  const mPerSq = metersPerSquare.value || 1.5;
  const sideSq = Math.max(0, sideMeters / mPerSq);
  const half = sideSq / 2;
  const cols = gridWidth.value, rows = gridHeight.value;
  const getCoords = (id: string) => { const idx = parseInt(id.replace('sq-', '')); return { x: idx % cols, y: Math.floor(idx / cols) }; };
  const getId = (x: number, y: number) => `sq-${y * cols + x}`;
  const o = getCoords(originId);
  const ocx = o.x + 0.5, ocy = o.y + 0.5;
  const minX = ocx - half - 0.001, maxX = ocx + half + 0.001; // pequena tolerância
  const minY = ocy - half - 0.001, maxY = ocy + half + 0.001;
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

    <div v-if="!isDM && sessionStatus === 'LIVE'">
  <TurnOrderDisplay :initiativeList="initiativeList" :tokens="tokensOnMap" :metersPerSquare="metersPerSquare" :showMovement="false" />
  <PlayerTurnPanel 
        :initiativeList="initiativeList"
        :myActiveToken="myActiveToken"
        :currentUser="currentUser ? { _id: currentUser.id, username: currentUser.username } : null"
        :tokensOnMap="tokensOnMap"
  :metersPerSquare="metersPerSquare"
        @undo-move="handleUndoMove"
        @end-turn="handleNextTurn"
      />
    </div>

    <Toolbar 
      v-if="sessionStatus === 'LIVE' || isDM"
      :activeTool="activeTool"
      :canDelete="Boolean(selectedPersistentId && (isDM || persistentMeasurements.find(pm => pm.id === selectedPersistentId)?.userId === currentUser?.id))"
  :persistentMode="persistentMode"
  :isDM="isDM"
  :selectedColor="measurementColor"
      @tool-selected="handleToolSelected" 
  @toggle-persistent="handleTogglePersistent"
  @color-selected="handleColorSelected"
  @clear-all="handleClearAllMeasurements"
      @delete-selected="handleDeleteSelectedPersistent"
    />

  <aside v-if="isDM" class="dm-panel" :class="{ collapsed: isDmPanelCollapsed }">
      <button @click="isDmPanelCollapsed = !isDmPanelCollapsed" class="toggle-button">
        <span>Painel do Mestre</span>
        <span v-if="isDmPanelCollapsed">▲</span>
        <span v-else>▼</span>
      </button>
      
      <div v-show="!isDmPanelCollapsed" class="panel-content">        
        <div class="panel-section">
          <h4>Sessão</h4>
          <div class="session-controls">
            <button 
              v-if="sessionStatus === 'PREPARING' || sessionStatus === 'ENDED'" 
              @click="handleUpdateSessionStatus('LIVE')"
              class="start-btn"
            >
              Iniciar Sessão
            </button>
            <button 
              v-if="sessionStatus === 'LIVE'" 
              @click="handleUpdateSessionStatus('ENDED')"
              class="end-btn"
            >
              Encerrar Sessão
            </button>
          </div>
        </div>
        
        <div class="panel-section scene-manager">
          <form @submit.prevent="handleCreateScene" class="create-scene-form">
            <h4>Criar Nova Cena</h4>
            <input v-model="newSceneName" placeholder="Nome da Cena" required />
            <input v-model="newSceneImageUrl" placeholder="URL da Imagem (Opcional)" />
            <select v-model="newSceneType">
              <option value="battlemap">Battlemap</option>
              <option value="image">Imagem</option>
            </select>
            <button type="submit">Adicionar Cena</button>
          </form>
        
          <div class="panel-section" v-if="activeScene?.type === 'battlemap' && initiativeList.length > 0">
            <h3>Iniciativa</h3>
            <div class="initiative-controls">
              <button @click="handleNextTurn">Próximo Turno</button>
              <button @click="handleUndoMove" :disabled="!currentTurnTokenId">Desfazer Movimento</button>
            </div>
            <draggable 
              v-if="activeScene.type === 'battlemap'"
              v-model="initiativeList"
              tag="ul"
              class="initiative-list"
              item-key="_id"
              @end="onInitiativeDragEnd"
            >
              <template #item="{ element: entry }">
                <li :class="{ 'active-turn': entry.isCurrentTurn, 'draggable-item': true }">
                  <span>{{ entry.characterName }}</span>
                  <div class="initiative-buttons"> 
                    <!-- Botão de renomear removido; edição completa via TokenEditForm -->
                    <button v-if="entry.tokenId" @click="openEditTokenByEntry(entry)" class="icon-btn" title="Editar Token">🛠️</button>
                    <button @click="handleRemoveFromInitiative(entry._id)" class="icon-btn delete-btn-small">🗑️</button>
                  </div>
                </li>
              </template>
            </draggable>
            <div v-if="initiativeList.length === 0" class="empty-list-container">
              <p class="empty-list">A iniciativa está vazia.</p>
            </div>
          </div>

          <ul class="scene-list">
            <h3>Cenas</h3>
            <draggable
              v-model="scenes"
              tag="ul"
              class="scene-list"
              item-key="_id"
              @end="onSceneDragEnd"
              handle=".drag-handle"
            >
              <template #item="{ element: scene }">
                <li :class="{ 'active-scene': scene._id === activeSceneId }">
                  <span class="drag-handle">⠿</span> <span>{{ scene.name }}</span>
                  <div class="scene-buttons">
                    <button @click="handleSetActiveScene(scene._id)" :disabled="scene._id === activeSceneId">Ativar</button>
                    <button @click="handleEditScene(scene)" class="icon-btn">✏️</button>
                    <button @click="handleDeleteScene(scene._id)" :disabled="scene._id === activeSceneId" class="icon-btn delete-btn-small">🗑️</button>
                  </div>
                </li>
              </template>
            </draggable>
          </ul>

          <div class="panel-section">
            <h4>Editar Imagem da Cena Ativa</h4>
            <div class="map-controls">
              <label for="map-url">URL da Imagem:</label>
              <input id="map-url" type="url" v-model="mapUrlInput" placeholder="URL da imagem da cena" />
              <button @click="setMap">Definir Imagem</button>
            </div>
          </div>
        </div>

        <div v-if="activeScene?.type === 'battlemap'" class="panel-section">
          <h4>Controles do Grid</h4>
          <div class="grid-controls">
            <label for="grid-size">Tamanho (quadrados):</label>
            <div class="grid-dimensions">
              <label>Largura:</label>
              <input type="number" v-model.number="gridWidth" min="1" />
              <label>Altura:</label>
              <input type="number" v-model.number="gridHeight" min="1" />
            </div>
            <div class="scale-control">
              <label>Escala (m por quadrado):</label>
              <input type="number" step="0.1" min="0.1" v-model.number="metersPerSquare" />
              <small>{{ (metersPerSquare || 0).toFixed(2) }}m ≈ {{ Math.round(squareFeet) }}ft por quadrado</small>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <main class="battlemap-main">
      <h1 v-if="currentTable && sessionStatus === 'LIVE' || isDM">{{ currentTable.name }}</h1>
      <h3 v-if="activeSceneId && sessionStatus === 'LIVE' || isDM" class="active-scene-name">Cena Ativa: {{ scenes.find(s => s._id === activeSceneId)?.name }}</h3>
      <button v-if="sessionStatus === 'LIVE' || isDM" @click="resetView" class="reset-view-btn">Resetar Visão</button>
      <div 
        v-if="sessionStatus === 'LIVE' || isDM"
  class="viewport" :class="{ measuring: isMeasuring }"
        ref="viewportRef"
        @wheel.prevent="handleWheel"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @mouseleave="handlePointerUp" style="touch-action: none;" >

        
        <template v-if="sessionStatus === 'LIVE' || isDM">
          <div 
            class="map-stage"
            :style="{ transform: `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.scale})` }"
          >
            <img 
              v-if="currentMapUrl" 
              :src="currentMapUrl" 
              alt="Mapa de Batalha" 
              class="map-image" 
              draggable="false" 
              @dragstart.prevent 
              ref="mapImgRef" 
              @load="updateImageDimensions" />
            <div v-else class="map-placeholder">
              <p>Nenhum mapa definido para esta cena.</p>
              <p v-if="isDM">Use o Painel do Mestre para definir uma imagem.</p>
            </div>

            <GridDisplay
              v-if="currentMapUrl && activeScene?.type === 'battlemap'"
              ref="gridDisplayRef"
              class="grid-overlay"
              :isMeasuring="isMeasuring"
              :metersPerSquare="metersPerSquare"
              :measureStartPoint="rulerStartPoint"
              :measureEndPoint="rulerEndPoint"
              :measuredDistance="rulerDistance"
              :previewMeasurement="previewMeasurement"
              :sharedMeasurements="Object.values(sharedMeasurements)"
              :persistentMeasurements="persistentsForActiveScene"
              :userColorMap="tableStore.userMeasurementColors"
              :areaAffectedSquares="coneAffectedSquares"
              :measurementColor="measurementColor"
              :currentTurnTokenId="currentTurnTokenId"
              :squares="squares"
              :gridWidth="gridWidth" 
              :gridHeight="gridHeight"
              :imageWidth="imageRenderedWidth || undefined"
              :imageHeight="imageRenderedHeight || undefined"
              :selectedTokenId="selectedTokenId"
              :isDM="isDM"
              :currentUserId="currentUser?.id || null"
              :selectedPersistentId="selectedPersistentId"
              @square-right-click="handleRightClick"
              @square-left-click="handleLeftClickOnSquare"
              @token-move-requested="handleTokenMoveRequest"
              @remove-persistent="handleRemovePersistent"
              @select-persistent="handleSelectPersistent"
              @viewport-contextmenu="handleViewportContextMenu"
              @shape-contextmenu="handleShapeContextMenu"
            />
          </div>
        </template>

        <div 
          v-if="showAssignMenu" 
          class="context-menu" 
          :style="{ top: `${assignMenuPosition.y}px`, left: `${assignMenuPosition.x}px` }"
          @click.stop 
          @contextmenu.prevent
          @pointerdown.stop
        >
          <h4>Atribuir "{{ assignMenuTargetToken?.name }}"</h4>
          <ul>
            <li v-for="player in currentTable?.players" :key="player._id" @click="handleAssignToken(player._id)">
              {{ player.username }}
            </li>
          </ul>
          <button @click="showAssignMenu = false">Fechar</button>
        </div>
      </div>
      <div v-else-if="!isDM && (sessionStatus === 'PREPARING' || sessionStatus === 'ENDED')" class="waiting-room">
        <p v-if="sessionStatus === 'PREPARING'">Nenhuma sessão em andamento, aguarde até o Mestre iniciar a sessão.</p>
        <p v-if="sessionStatus === 'ENDED'">A sessão foi encerrada.</p>
      </div>
    </main>

    <TokenCreationForm
      v-if="showTokenForm && isDM"
      :players="currentTable?.players || []" @create-token="createToken"
      @cancel="showTokenForm = false"
    />
    <TokenEditForm
      :open="showTokenEditForm"
      :token="tokenBeingEdited"
      :players="currentTable?.players || []"
      @close="showTokenEditForm = false; tokenBeingEdited = null;"
      @save="handleSaveTokenEdit"
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
  transition: width 0.3s ease, padding 0.3s ease; /* Transição suave */
  position: absolute;
  top: 20px; 
  right: 20px;
  z-index: 50; 

  width: 300px;
  flex-shrink: 0;
  background-color: #3a3a3a;
  padding: 15px;
  border-radius: 8px;
  height: fit-content;
  max-height: calc(100vh - 40px); 
  overflow-y: auto; /* Adiciona scroll se o conteúdo for muito grande */
}
.toggle-button {
  background-color: #3a3a3a;
  color: #ffc107;
  border: none;
  width: 100%;
  padding: 10px;
  font-size: 1em;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
panel h2 {
  margin-top: 0;
  text-align: center;
  color: #ffc107;
}
.grid-controls {
    display: flex;
    flex-direction: column;
    gap: 5px;
    align-items: stretch;
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
.viewport {
  width: 100%;
  height: 85vh;
  max-width: 1600px;
  background-color: #2c2c2c;
  border: 10px solid rgba(0, 0, 0, 0.5);
  border-radius: 8px;
  overflow: hidden; /* Esconde as partes do mapa que saem da tela */
  position: relative; 
  cursor: grab; /* Indica que a área pode ser arrastada */
}
.viewport:active {
  cursor: grabbing;
}
.viewport.measuring { cursor: crosshair; }
.map-stage {
  width: 100%;
  height: 100%;
  position: relative; /* Para que a imagem e o grid se alinhem a ele */
  transition: transform 0.1s ease-out; /* Transição suave para o zoom */
  overflow: hidden; /* Clipa tanto vertical quanto horizontal */
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
  user-select: none;
  pointer-events: none;
  display: block;
}

.map-placeholder {
  color: #888;
  grid-area: 1 / 1 / 2 / 2; 
}
.reset-view-btn {
  margin-bottom: 15px;
  padding: 8px 12px;
  background-color: rgba(44, 44, 44, 0.8);
  color: white;
  border: 1px solid #888;
  border-radius: 4px;
  cursor: pointer;
}
.reset-view-btn:hover {
  background-color: rgba(60, 60, 60, 0.9);
}
.panel-section {
  margin-top: 25px;
  border-top: 1px solid #555;
  padding-top: 15px;
}
.scene-list {
  list-style: none;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
}
.scene-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  margin-bottom: 5px;
  border-radius: 4px;
  background-color: #4f4f4f;
}
.panel-section h3, .panel-section h4 {
  margin-top: 0;
  margin-bottom: 10px;
}
.scene-list li.active-scene {
  background-color: #ffc107;
  color: #333;
  font-weight: bold;
}
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
.map-controls input {
  padding: 5px;
  min-width: 300px;
  box-sizing: border-box;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.3s ease;
}
.map-controls button, .create-scene-form button {
  width: 100%;
  padding: 10px;
}
.initiative-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}
.initiative-controls button {
  flex-grow: 1;
}
.initiative-list {
  list-style: none;
  padding: 0;
  margin: 10px 0;
  max-height: 250px; /* Limita a altura e adiciona scroll se necessário */
  overflow-y: auto;
  background-color: #2c2c2c;
  border-radius: 4px;
}
.initiative-list li {
  padding: 10px;
  border-bottom: 1px solid #4f4f4f;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.initiative-list li:last-child {
  border-bottom: none;
}
.initiative-list li.active-turn {
  background-color: #5a9c5a; /* Destaque verde para o turno ativo */
  font-weight: bold;
}
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
.drag-handle {
  cursor: grab;
  margin-right: 10px;
  color: #888;
}
.draggable-item:active {
  cursor: grabbing;
}
.empty-list-container {
  padding: 20px;
  text-align: center;
  color: #888;
  font-style: italic;
}
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
.context-menu {
  position: absolute;
  background: #4f4f4f;
  border: 1px solid #888;
  border-radius: 4px;
  padding: 5px 0;
  z-index: 1000;
  min-width: 150px;
}
.context-menu ul { list-style: none; padding: 0; margin: 0; }
.context-menu li { 
  padding: 8px 12px; 
  cursor: pointer;
  color: #fff;
}
.context-menu li:hover { background-color: #ffc107; color: #333; }
.context-menu button { /* Estilo para o botão "Fechar" */
  background: none;
  border: none;
  color: #ccc;
  width: 100%;
  padding: 8px;
  margin-top: 5px;
  border-top: 1px solid #666;
  cursor: pointer;
}
.turn-status-panel {
  margin-top: 20px;
  background-color: #3a3a3a;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #555;
  text-align: center;
  width: 100%;
  max-width: 400px;
}
.turn-status-panel h3 {
  margin-top: 0;
  color: #ffc107;
}
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
.movement-info {
    font-size: 0.8em;
    color: #ccc;
    opacity: 0.8;
}
</style>