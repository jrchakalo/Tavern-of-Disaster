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

function updateImageDimensions() {
  if (mapImgRef.value) {
    imageRenderedWidth.value = mapImgRef.value.clientWidth;
    imageRenderedHeight.value = mapImgRef.value.clientHeight;
  }
}

const activeTool = ref<'ruler' | 'cone' | 'none'>('none');
const rulerStartPoint = ref<{ x: number; y: number } | null>(null);
const rulerEndPoint = ref<{ x: number; y: number } | null>(null);
const rulerDistance = ref('0.0m');
const isMeasuring = computed(() => activeTool.value !== 'none');
const coneOriginSquareId = ref<string | null>(null); // Quadrado onde o cone começa
const coneAffectedSquares = ref<string[]>([]); // Lista de IDs dos quadrados afetados
const coneLength = ref(9); // Comprimento padrão do cone em metros (ex: Mãos Flamejantes)
const previewMeasurement = ref<{
  type: 'ruler' | 'cone';
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
  // Getters
  isDM, 
  activeScene, 
  tokensOnMap, 
  currentTurnTokenId, 
  myActiveToken 
} = storeToRefs(tableStore);

function handleSetActiveScene(sceneId: string) {
  socketService.setActiveScene(tableId, sceneId);
}

function handleUpdateSessionStatus(newStatus: 'LIVE' | 'ENDED') {
  socketService.updateSessionStatus(tableId, newStatus);
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

function handleUndoMove() {
  if (currentTurnTokenId.value) {
    socketService.undoMove(tableId, currentTurnTokenId.value);
  }
}

function handleNextTurn() {
  if (activeSceneId.value) {
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
    // Primeiro clique define a origem do cone
    coneOriginSquareId.value = square.id;
    // Calcula uma área inicial
    coneAffectedSquares.value = calculateConeArea(square.id, square.id, coneLength.value);
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
    if (activeSceneId.value && sharedMeasurements.value[currentUser?.value?.id || '']) {
      socketService.removeMyMeasurement({ tableId, sceneId: activeSceneId.value });
    } else {
      activeTool.value = 'none';
    }
    previewMeasurement.value = null;
    rulerStartPoint.value = null;
    coneOriginSquareId.value = null;
    coneAffectedSquares.value = [];
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
    }
    // (Futuramente: else if (activeTool.value === 'cone') { ... })

    // Captura o ponteiro para que o 'pointerup' funcione mesmo se o mouse sair da área
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    return;
  }

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
        socketService.shareMeasurement({
          tableId,
          sceneId: activeSceneId.value,
          start: previewMeasurement.value.start,
          end: previewMeasurement.value.end,
          distance: previewMeasurement.value.distance || '0m'
        });
      }
    }
    previewMeasurement.value = null; 

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

function handleToolSelected(tool: 'ruler' | 'cone' | 'none') {
  activeTool.value = tool;

  // SEMPRE reseta o estado de TODAS as ferramentas de medição ao trocar de ferramenta.
  rulerStartPoint.value = null;
  rulerEndPoint.value = null;
  rulerDistance.value = '0.0m';
  coneOriginSquareId.value = null;
  coneAffectedSquares.value = [];

  // Se qualquer ferramenta for ATIVADA fazemos a limpeza da UI.
  if (tool !== 'none') {
    showTokenForm.value = false;
    selectedTokenId.value = null;
  }
}

function calculateConeArea(originId: string, targetId: string, lengthInMeters: number): string[] {
  if (originId === targetId) return [];

  const lengthInSquares = Math.floor(lengthInMeters / 1.5);

  const cols = gridWidth.value;
  const rows = gridHeight.value;
  const getCoords = (id: string) => {
    const index = parseInt(id.replace('sq-', ''));
    return { x: index % cols, y: Math.floor(index / cols) };
  };
  const getId = (x: number, y: number) => `sq-${y * cols + x}`;

  const origin = getCoords(originId);
  const target = getCoords(targetId);

  const dx = target.x - origin.x;
  const dy = target.y - origin.y;

  const affected = new Set<string>([originId]);

  // Itera para cada "passo" de distância do cone
  for (let i = 1; i <= lengthInSquares; i++) {
    // A largura do cone na distância 'i' é 'i'
    const coneWidth = i;
    for (let j = -Math.floor(coneWidth / 2); j <= Math.floor(coneWidth / 2); j++) {
      let x: number, y: number;

      // Lógica simplificada para determinar a direção e expandir o cone
      if (Math.abs(dx) > Math.abs(dy)) { // Horizontalmente dominante
        x = origin.x + i * Math.sign(dx);
        y = origin.y + j;
      } else { // Verticalmente dominante ou diagonal
        x = origin.x + j;
        y = origin.y + i * Math.sign(dy);
      }

  if (x >= 0 && x < cols && y >= 0 && y < rows) {
        affected.add(getId(x, y));
      }
    }
  }
  return Array.from(affected);
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

// Atualização automática sempre que largura ou altura mudarem (DM apenas)
watch([gridWidth, gridHeight], ([w, h], [ow, oh]) => {
  if (!isDM.value || !activeSceneId.value) return;
  if (w === ow && h === oh) return;
  socketService.updateGridDimensions(tableId, activeSceneId.value, w, h);
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
      @tool-selected="handleToolSelected" 
    />

  <aside v-if="isDM" class="dm-panel" :class="{ collapsed: isDmPanelCollapsed }">
      <button @click="isDmPanelCollapsed = !isDmPanelCollapsed" class="toggle-button">
        <span>Painel do Mestre</span>
        <span v-if="isDmPanelCollapsed">▲</span>
        <span v-else>▼</span>
      </button>
      
      <div v-show="!isDmPanelCollapsed" class="panel-content">
        <div class="panel-section">
          <h4>Iniciativa (Movimento)</h4>
          <TurnOrderDisplay :initiativeList="initiativeList" :tokens="tokensOnMap" :metersPerSquare="metersPerSquare" :showMovement="true" />
        </div>
        
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
              :coneAffectedSquares="coneAffectedSquares"
              :currentTurnTokenId="currentTurnTokenId"
              :squares="squares"
              :gridWidth="gridWidth" 
              :gridHeight="gridHeight"
              :imageWidth="imageRenderedWidth || undefined"
              :imageHeight="imageRenderedHeight || undefined"
              :selectedTokenId="selectedTokenId"
              @square-right-click="handleRightClick"
              @square-left-click="handleLeftClickOnSquare"
              @token-move-requested="handleTokenMoveRequest"
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