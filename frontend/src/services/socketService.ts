import { io, Socket } from 'socket.io-client';
import { useTableStore } from '../stores/tableStore';
import { authToken } from './authService';
import type { TokenInfo, IScene, IInitiativeEntry, PlayerInfo, TokenSize } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private store = useTableStore();

  connect(tableId: string) {
    if (this.socket) return; // Já está conectado

    this.socket = io('ws://localhost:3001', {
      transports: ['websocket'],
      auth: { token: authToken.value }
    });

    this.socket.on('connect', () => {
      console.log('CONECTADO via SocketService! ID:', this.socket?.id);
      this.socket?.emit('joinTable', tableId);
    });

    // Handlers de eventos
    this.socket.on('initialSessionState', (data) => this.store.setInitialState(data));
    this.socket.on('sessionStateUpdated', (data) => this.store.updateSessionState(data));
    this.socket.on('tokenPlaced', (data: TokenInfo) => this.store.placeToken(data));
    this.socket.on('tokenMoved', (data: TokenInfo & { oldSquareId: string }) => this.store.moveToken(data));
    this.socket.on('tokenRemoved', (data: { tokenId: string }) => this.store.removeToken(data.tokenId));
    this.socket.on('tokenOwnerUpdated', (data: { tokenId: string, newOwner: PlayerInfo }) => this.store.updateTokenOwner(data.tokenId, data.newOwner));
  this.socket.on('tokenUpdated', (data: TokenInfo) => this.store.applyTokenUpdate(data));
    this.socket.on('tokensUpdated', (data: TokenInfo[]) => this.store.updateAllTokens(data));
    this.socket.on('initiativeUpdated', (data: IInitiativeEntry[]) => { this.store.initiativeList = data; });
    this.socket.on('sceneListUpdated', (data: IScene[]) => { this.store.scenes = data; });
    this.socket.on('sessionStatusUpdated', (data: { status: 'PREPARING' | 'LIVE' | 'ENDED' }) => { this.store.sessionStatus = data.status; });
    this.socket.on('mapUpdated', (data: { mapUrl: string }) => { this.store.currentMapUrl = data.mapUrl; });
  // Escala
  // sessionStateUpdated já atualiza metersPerSquare via store
  // Medições compartilhadas
  this.socket.on('measurementShared', (m) => this.store.upsertSharedMeasurement(m));
  this.socket.on('measurementRemoved', (data: { userId: string }) => this.store.removeSharedMeasurement(data.userId));
  this.socket.on('allMeasurementsCleared', () => this.store.clearSharedMeasurements());

    // Handlers de erro
    this.socket.on('connect_error', (error) => console.error('SocketService - Erro de conexão:', error.message));
    this.socket.on('tokenPlacementError', (error) => alert(`Erro ao colocar token: ${error.message}`));
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    console.log('SocketService - Desconectado.');
  }

  // Emissores de eventos
  setActiveScene(tableId: string, sceneId: string) {
    this.socket?.emit('requestSetActiveScene', { tableId, sceneId });
  }

  updateSessionStatus(tableId: string, newStatus: 'LIVE' | 'ENDED') {
    this.socket?.emit('requestUpdateSessionStatus', { tableId, newStatus });
  }

  setMap(tableId: string, mapUrl: string) {
    this.socket?.emit('requestSetMap', { tableId, mapUrl });
  }

  reorderScenes(tableId: string, orderedSceneIds: string[]) {
    this.socket?.emit('requestReorderScenes', { tableId, orderedSceneIds });
  }

  updateGridDimensions(tableId: string, sceneId: string, newGridWidth: number, newGridHeight: number) {
  this.socket?.emit('requestUpdateGridDimensions', { tableId, sceneId, newGridWidth, newGridHeight });
  }

  updateSceneScale(tableId: string, sceneId: string, metersPerSquare: number) {
    this.socket?.emit('requestUpdateSceneScale', { tableId, sceneId, metersPerSquare });
  }

  // -- Tokens --
  placeToken(payload: { tableId: string; sceneId: string; squareId: string; name: string; imageUrl: string; movement: number; ownerId: string; size: TokenSize; }) {
    this.socket?.emit('requestPlaceToken', payload);
  }

  moveToken(payload: { tableId: string; tokenId: string; targetSquareId: string; }) {
    this.socket?.emit('requestMoveToken', payload);
  }

  assignToken(payload: { tableId: string; tokenId: string; newOwnerId: string; }) {
    this.socket?.emit('requestAssignToken', payload);
  }

  editToken(payload: { tableId: string; tokenId: string; name?: string; movement?: number; imageUrl?: string; ownerId?: string; size?: string; resetRemainingMovement?: boolean }) {
    this.socket?.emit('requestEditToken', payload);
  }

  undoMove(tableId: string, tokenId: string) {
    this.socket?.emit('requestUndoMove', { tableId, tokenId });
  }

  // -- Iniciativa --
  nextTurn(tableId: string, sceneId: string) {
    this.socket?.emit('requestNextTurn', { tableId, sceneId });
  }

  removeFromInitiative(payload: { tableId: string; sceneId: string; initiativeEntryId: string; }) {
    this.socket?.emit('requestRemoveFromInitiative', payload);
  }

  editInitiativeEntry(payload: { tableId: string; sceneId: string; initiativeEntryId: string; newName: string; }) {
    this.socket?.emit('requestEditInitiativeEntry', payload);
  }

  reorderInitiative(payload: { tableId: string; sceneId: string; newOrder: IInitiativeEntry[]; }) {
    this.socket?.emit('requestReorderInitiative', payload);
  }

  // --- Medições ---
  // Suporta régua, cone e (em breve) círculo/quadrado.
  shareMeasurement(payload: { tableId: string; sceneId: string; start: {x:number;y:number}; end:{x:number;y:number}; distance: string; type?: 'ruler' | 'cone' | 'circle' | 'square'; affectedSquares?: string[] }) {
    this.socket?.emit('requestShareMeasurement', payload);
  }
  removeMyMeasurement(payload: { tableId: string; sceneId: string }) {
    this.socket?.emit('requestRemoveMeasurement', payload);
  }
}

// Exportamos uma única instância
export const socketService = new SocketService();