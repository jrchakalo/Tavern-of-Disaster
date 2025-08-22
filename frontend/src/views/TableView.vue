<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { io, Socket } from 'socket.io-client';
import { useTableStore } from '../stores/tableStore';
import { storeToRefs } from 'pinia';
import draggable from 'vuedraggable';
import GridDisplay from '../components/GridDisplay.vue';
import TokenCreationForm from '../components/TokenCreationForm.vue';
import TurnOrderDisplay from '../components/TurnOrderDisplay.vue';
import PlayerTurnPanel from '../components/PlayerTurnPanel.vue';
import type { GridSquare, TokenInfo, IScene, ITable, IInitiativeEntry, TokenSize } from '../types';
import { useRoute } from 'vue-router';
import { authToken, currentUser } from '../services/authService';
import { socketService } from '../services/socketService';

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
const targetSquareIdForToken = ref<string | null>(null);
const mapUrlInput = ref(''); // Para o campo de input
const newSceneName = ref('');
const newSceneImageUrl = ref('');
const newSceneType = ref<'battlemap' | 'image'>('battlemap'); // Tipo da nova cena, padrão é 'battlemap
const isDmPanelCollapsed = ref(false);

const tableStore = useTableStore();
const {
  //State
  currentTable, 
  scenes, 
  activeSceneId, 
  initiativeList, 
  squares, 
  gridSize, 
  sessionStatus,
  currentMapUrl,
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

function handleEditInitiativeEntry(entry: IInitiativeEntry) {
  const newName = prompt("Digite o novo nome:", entry.characterName);
  if (!newName || newName.trim() === '') return;
  if (activeSceneId.value) {
    socketService.editInitiativeEntry({
      tableId,
      sceneId: activeSceneId.value,
      initiativeEntryId: entry._id,
      newName
    });
  }
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

function handleLeftClickOnSquare(clickedSquare: GridSquare) {
  if (clickedSquare.token) {
    // Se o token clicado já estava selecionado, deseleciona. Senão, seleciona.
    if (selectedTokenId.value === clickedSquare.token._id) {
      selectedTokenId.value = null;
    } else {
      selectedTokenId.value = clickedSquare.token._id;
    }
  } else {
    // Clicar em um quadrado vazio deseleciona qualquer token
    selectedTokenId.value = null;
  }
}

function handleRightClick(square: GridSquare, event: MouseEvent) {
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
  } else if (!square.token) { // Se o quadrado estiver vazio (lógica existente)
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
  // Ignora se o clique começou em algo interativo como um botão ou um token
  if ((event.target as HTMLElement).closest('button, .token')) return;

  event.preventDefault();
  viewportRef.value?.setPointerCapture(event.pointerId);
  activePointers.value.push(event);
}

// Função para quando um ponteiro se move
function handlePointerMove(event: PointerEvent) {
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
  // Remove o ponteiro
  activePointers.value = activePointers.value.filter(
    p => p.pointerId !== event.pointerId
  );

  // Reseta a distância do pinch quando um dos dedos sai
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
  viewTransform.value = { scale: 1, x: 0, y: 0 };
}

watch(gridSize, (newSize, oldSize) => {
  if (isDM.value && newSize !== oldSize && activeSceneId.value) {
    socketService.updateGridSize(tableId, activeSceneId.value, newSize);
  }
});

onMounted(() => {
  socketService.connect(tableId);
});

onUnmounted(() => {
  socketService.disconnect();
});

</script>

<template>
  <div class="table-view-layout">

    <div v-if="!isDM && sessionStatus === 'LIVE'">
      <TurnOrderDisplay :initiativeList="initiativeList" />
      <PlayerTurnPanel 
        :initiativeList="initiativeList"
        :myActiveToken="myActiveToken"
        :currentUser="currentUser ? { _id: currentUser.id, username: currentUser.username } : null"
        :tokensOnMap="tokensOnMap"
        @undo-move="handleUndoMove"
        @end-turn="handleNextTurn"
      />
    </div>

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
                    <button @click="handleEditInitiativeEntry(entry)" class="icon-btn">✏️</button>
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
            <input id="grid-size" type="number" v-model="gridSize" min="1" />
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
        class="viewport"
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
            <img v-if="currentMapUrl" :src="currentMapUrl" alt="Mapa de Batalha" class="map-image" />
            <div v-else class="map-placeholder">
              <p>Nenhum mapa definido para esta cena.</p>
              <p v-if="isDM">Use o Painel do Mestre para definir uma imagem.</p>
            </div>

            <GridDisplay
              v-if="currentMapUrl && activeScene?.type === 'battlemap'"
              class="grid-overlay"
              :currentTurnTokenId="currentTurnTokenId"
              :squares="squares"
              :gridSize="gridSize"
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
.map-stage {
  width: 100%;
  height: 100%;
  position: relative; /* Para que a imagem e o grid se alinhem a ele */
  transition: transform 0.1s ease-out; /* Transição suave para o zoom */
}
.map-image,
.grid-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%); 
  max-width: 100%;
  max-height: 100%;
}
.map-image {
  object-fit: contain;
}
.grid-overlay {
  aspect-ratio: 1 / 1;
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