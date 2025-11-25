import { Server, Socket } from 'socket.io';
import { IInitiativeEntry } from '../models/Scene.model';
import Token from '../models/Token.model';
import {
  addTokenToInitiative,
  advanceTurn,
  resetInitiative,
  removeInitiativeEntry,
  reorderInitiative,
  editInitiativeEntry,
  getSceneAndTable,
} from '../services/initiativeService';
import { getTableById, assertUserIsDM } from '../services/tableService';
import { clearEphemeralMeasurements } from '../services/measurementService';

export function registerInitiativeHandlers(io: Server, socket: Socket) {

  // Adiciona token à iniciativa (apenas Mestre). Evita duplicatas do mesmo token.
  const requestAddCharacterToInitiative = async (data: { tableId: string, sceneId: string, tokenId: string }) => {
    try {
        const { tableId, sceneId, tokenId } = data;
        const userId = socket.data.user?.id;
        const table = await getTableById(tableId);
        if (!table) return;
        assertUserIsDM(userId, table);

        if (!tokenId) {
        socket.emit('error', { message: 'Nenhum token foi selecionado.' });
        return;
        }

        const token = await Token.findById(tokenId);
        if (!token) {
            socket.emit('error', { message: 'Token não encontrado.' });
            return;
        }

        const initiative = await addTokenToInitiative(sceneId, token);

  if (initiative) io.to(tableId).emit('initiativeUpdated', initiative);
    } catch (error) { 
        console.error("Erro ao adicionar personagem à iniciativa:", error); 
    }
  };


  // Avança para o próximo turno. Se voltar ao início da lista: nova rodada -> reseta movimento.
  const requestNextTurn = async (data: { tableId: string, sceneId: string }) => {
    try {
        const { tableId, sceneId } = data;
        const userId = socket.data.user?.id; 
        
        const { table, scene } = await getSceneAndTable(tableId, sceneId);
        if (!scene || scene.initiative.length === 0) return;

        const result = await advanceTurn(table, scene, userId);

        io.to(tableId).emit('initiativeUpdated', result.initiative);
        if (result.newRound) {
          const updatedTokens = await Token.find({ sceneId }).populate('ownerId', '_id username');
          io.to(tableId).emit('tokensUpdated', updatedTokens);
        }
  // Limpa medições compartilhadas no servidor e notifica clientes
  clearEphemeralMeasurements(tableId);
  io.to(tableId).emit('allMeasurementsCleared');
    } catch (error) { 
        console.error("Erro ao avançar o turno:", error); 
    }
  };

  // Remove todas as entradas da iniciativa (apenas Mestre) e limpa medições.
  const requestResetInitiative = async (data: { tableId: string, sceneId: string }) => {
    try {
        const { tableId, sceneId } = data;
        const userId = socket.data.user?.id;
        const table = await getTableById(tableId);
        if (!table) return;
        
    assertUserIsDM(userId, table);

  const initiative = await resetInitiative(sceneId);

  io.to(tableId).emit('initiativeUpdated', initiative);
  // Limpa medições ao resetar iniciativa
  clearEphemeralMeasurements(tableId);
  io.to(tableId).emit('allMeasurementsCleared');
    } catch (error) { 
        console.error("Erro ao resetar a iniciativa:", error); 
    }
  };

  // Remove entrada específica e deleta token associado (se houver). Apenas Mestre.
  const requestRemoveFromInitiative = async (data: { tableId: string; sceneId: string; initiativeEntryId: string }) => {
    try {
        const { tableId, sceneId, initiativeEntryId } = data;
        
        const userId = socket.data.user?.id;
        const table = await getTableById(tableId);
        if (!table) return;
  assertUserIsDM(userId, table);

        const { initiative, removedTokenId } = await removeInitiativeEntry(sceneId, initiativeEntryId, true);

        if (initiative) {
          io.to(tableId).emit('initiativeUpdated', initiative);
          if (removedTokenId) io.to(tableId).emit('tokenRemoved', { tokenId: removedTokenId });
        }
    } catch (error) { 
        console.error("Erro ao remover da iniciativa:", error); 
    }
  };

  // Reordena manualmente a lista (apenas Mestre). Mantém flags isCurrentTurn conforme recebido.
  const requestReorderInitiative = async (data: { tableId: string; sceneId: string; newOrder: IInitiativeEntry[] }) => {
    try {
        const { tableId, sceneId, newOrder } = data;
        const userId = socket.data.user?.id;

      const table = await getTableById(tableId);
      if (!table) return;
    assertUserIsDM(userId, table);

      const initiative = await reorderInitiative(sceneId, newOrder);

    if (initiative) socket.to(tableId).emit('initiativeUpdated', initiative);
    } catch (error) { 
        console.error("Erro ao reordenar iniciativa:", error); 
    }
  };

  // Renomeia uma entrada; reflete também no token (se vinculado). Apenas Mestre.
  const requestEditInitiativeEntry = async (data: { tableId: string; sceneId: string; initiativeEntryId: string; newName: string }) => {
    try {
      const { tableId, sceneId, initiativeEntryId, newName } = data;
      const userId = socket.data.user?.id;

      const table = await getTableById(tableId);
      if (!table) return;
      assertUserIsDM(userId, table);

      const initiative = await editInitiativeEntry(sceneId, initiativeEntryId, newName);

      // Notifica todos na sala sobre a lista de iniciativa atualizada
      io.to(tableId).emit('initiativeUpdated', initiative);
    } catch (error) { 
      console.error("Erro ao editar entrada da iniciativa:", error); 
    }
  };

  // Registro de todos os listeners de iniciativa no socket
  socket.on('requestAddCharacterToInitiative', requestAddCharacterToInitiative);
  socket.on('requestNextTurn', requestNextTurn);
  socket.on('requestResetInitiative', requestResetInitiative);
  socket.on('requestRemoveFromInitiative', requestRemoveFromInitiative);
  socket.on('requestReorderInitiative', requestReorderInitiative);
  socket.on('requestEditInitiativeEntry', requestEditInitiativeEntry);
}