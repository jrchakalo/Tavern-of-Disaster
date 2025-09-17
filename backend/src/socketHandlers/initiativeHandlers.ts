import { Server, Socket } from 'socket.io';
import { IInitiativeEntry } from '../models/Scene.model';
import Table from '../models/Table.model';
import Scene from '../models/Scene.model';
import Token from '../models/Token.model';
import { clearMeasurementsForTable } from './measurementStore';

export function registerInitiativeHandlers(io: Server, socket: Socket) {

  // Adiciona token à iniciativa (apenas Mestre). Evita duplicatas do mesmo token.
  const requestAddCharacterToInitiative = async (data: { tableId: string, sceneId: string, tokenId: string }) => {
    try {
        const { tableId, sceneId, tokenId } = data;
        const userId = socket.data.user?.id;

        const table = await Table.findById(tableId);
        if (!table) return;

        if (table.dm.toString() !== userId) {
          return socket.emit('error', { message: 'Apenas o Mestre pode adicionar personagens à iniciativa.' });
        }

        if (!tokenId) {
        socket.emit('error', { message: 'Nenhum token foi selecionado.' });
        return;
        }

        const token = await Token.findById(tokenId);
        if (!token) {
            socket.emit('error', { message: 'Token não encontrado.' });
            return;
        }

        const scene = await Scene.findById(sceneId);
    if (scene && scene.initiative.some(entry => entry.tokenId?.toString() === tokenId)) return socket.emit('error', { message: 'Este token já está na iniciativa.' });

        const newEntry = { 
        characterName: token.name,
        tokenId: token._id, 
        isCurrentTurn: false
        };

        const updatedScene = await Scene.findByIdAndUpdate(
        sceneId,
        { $push: { initiative: newEntry } },
        { new: true }
        );

  if (updatedScene) io.to(tableId).emit('initiativeUpdated', updatedScene.initiative);
    } catch (error) { 
        console.error("Erro ao adicionar personagem à iniciativa:", error); 
    }
  };


  // Avança para o próximo turno. Se voltar ao início da lista: nova rodada -> reseta movimento.
  const requestNextTurn = async (data: { tableId: string, sceneId: string }) => {
    try {
        const { tableId, sceneId } = data;
        const userId = socket.data.user?.id; 
        
        const table = await Table.findById(tableId);
        if (!table) return;

        const isDM = table.dm.toString() === userId;

        const scene = await Scene.findById(sceneId);
        if (!scene || scene.initiative.length === 0) return;

        // Permissão: DM sempre; jogador só se for dono do token em turno
        if (!isDM) {
          const currentTurnEntry = scene.initiative.find(e => e.isCurrentTurn);
          if (!currentTurnEntry || !currentTurnEntry.tokenId) return socket.emit('initiativeError', { message: 'Apenas o Mestre pode iniciar a rodada.' });
          const currentToken = await Token.findById(currentTurnEntry.tokenId);
          const isOwnerOfCurrent = currentToken?.ownerId?.toString() === userId;
          if (!isOwnerOfCurrent) return socket.emit('initiativeError', { message: 'Você só pode encerrar o seu próprio turno.' });
        }

        const initiativeList = scene.initiative;
        const currentTurnIndex = initiativeList.findIndex(entry => entry.isCurrentTurn);

        // Desmarca o turno atual
        if (currentTurnIndex !== -1) {
            initiativeList[currentTurnIndex].isCurrentTurn = false;
        }

        // Encontra o próximo turno, voltando ao início se chegar ao fim
        const nextTurnIndex = (currentTurnIndex + 1) % initiativeList.length;
    if (nextTurnIndex === 0) {
    // Nova rodada: restaura movimento e registra casa atual como base do histórico
        await Token.updateMany(
        { sceneId: sceneId },
        [{ $set: { 
            remainingMovement: "$movement",
            moveHistory: ["$squareId"]
        }}]
        );

        const updatedTokens = await Token.find({ sceneId: sceneId }).populate('ownerId', '_id username');
        io.to(tableId).emit('tokensUpdated', updatedTokens);
    }

    initiativeList[nextTurnIndex].isCurrentTurn = true;

    scene.initiative = initiativeList;
    await scene.save();

  io.to(tableId).emit('initiativeUpdated', scene.initiative);
  // Limpa medições compartilhadas no servidor e notifica clientes
  clearMeasurementsForTable(tableId);
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

        const table = await Table.findById(tableId);
        if (!table) return;
        
    if (table.dm.toString() !== userId) return socket.emit('error', { message: 'Apenas o Mestre pode resetar a iniciativa.' });

  const updatedScene = await Scene.findByIdAndUpdate(
            sceneId,
            { initiative: [] }, // Define o array de iniciativa como vazio
            { new: true }
        );

  io.to(tableId).emit('initiativeUpdated', updatedScene?.initiative);
  // Limpa medições ao resetar iniciativa
  clearMeasurementsForTable(tableId);
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
        const table = await Table.findById(tableId);
        if (!table) return;
  if (table.dm.toString() !== userId) return socket.emit('error', { message: 'Apenas o Mestre pode remover personagens da iniciativa.' });

        // Encontra a cena
        const scene = await Scene.findById(sceneId);
        const entryToRemove = scene?.initiative.find(e => e._id.toString() === initiativeEntryId);

        if (entryToRemove && entryToRemove.tokenId) {
        // Deleta o token associado
        await Token.findByIdAndDelete(entryToRemove.tokenId);
        }

        // Remove a entrada do array de iniciativa no documento da cena
        const updatedScene = await Scene.findByIdAndUpdate(
        sceneId,
        { $pull: { initiative: { _id: initiativeEntryId } } },
        { new: true }
        );

        if (updatedScene) {
          io.to(tableId).emit('initiativeUpdated', updatedScene.initiative);
          if (entryToRemove?.tokenId) io.to(tableId).emit('tokenRemoved', { tokenId: entryToRemove.tokenId.toString() });
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

        const table = await Table.findById(tableId);
        if (!table) return;
  if (table.dm.toString() !== userId) return socket.emit('error', { message: 'Apenas o Mestre pode reordenar a iniciativa.' });

        // Atualiza todo o array 'initiative' da cena com a nova ordem recebida
        const updatedScene = await Scene.findByIdAndUpdate(
        sceneId,
        { initiative: newOrder },
        { new: true }
        );

  if (updatedScene) socket.to(tableId).emit('initiativeUpdated', updatedScene.initiative);
    } catch (error) { 
        console.error("Erro ao reordenar iniciativa:", error); 
    }
  };

  // Renomeia uma entrada; reflete também no token (se vinculado). Apenas Mestre.
  const requestEditInitiativeEntry = async (data: { tableId: string; sceneId: string; initiativeEntryId: string; newName: string }) => {
    try {
      const { tableId, sceneId, initiativeEntryId, newName } = data;
      const userId = socket.data.user?.id;

      const table = await Table.findById(tableId);
      if (!table) return;
      if (table.dm.toString() !== userId) return socket.emit('error', { message: 'Apenas o Mestre pode editar entradas da iniciativa.' });

      const scene = await Scene.findById(sceneId);
      if (!scene) return;

      // Encontra a entrada específica no array e atualiza seu nome
      const entry = scene.initiative.find(e => e._id?.toString() === initiativeEntryId);
      if (entry) {
        entry.characterName = newName;

        if (entry.tokenId) {
          await Token.findByIdAndUpdate(entry.tokenId, { name: newName });
        }
      }

      await scene.save();

      // Notifica todos na sala sobre a lista de iniciativa atualizada
      io.to(tableId).emit('initiativeUpdated', scene.initiative);
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