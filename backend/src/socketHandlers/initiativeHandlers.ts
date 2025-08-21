import { Server, Socket } from 'socket.io';
import { IInitiativeEntry } from '../models/Scene.model';
import Table from '../models/Table.model';
import Scene from '../models/Scene.model';
import Token from '../models/Token.model';

export function registerInitiativeHandlers(io: Server, socket: Socket) {

  const requestAddCharacterToInitiative = async (data: { tableId: string, sceneId: string, tokenId: string }) => {
    try {
        const { tableId, sceneId, tokenId } = data;
        const userId = socket.data.user?.id;

        const table = await Table.findById(tableId);
        if (!table) return;

        if (table.dm.toString() !== userId) {
        console.log(`[AUTH] Falha: Usuário ${userId} tentou adicionar personagem à iniciativa da mesa ${tableId}, mas não é o mestre.`);
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
        if (scene && scene.initiative.some(entry => entry.tokenId?.toString() === tokenId)) {
            socket.emit('error', { message: 'Este token já está na iniciativa.' });
            return;
        }

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

        if (updatedScene) {
        io.to(tableId).emit('initiativeUpdated', updatedScene.initiative);
        }
    } catch (error) { 
        console.error("Erro ao adicionar personagem à iniciativa:", error); 
    }
  };


  const requestNextTurn = async (data: { tableId: string, sceneId: string }) => {
    try {
        const { tableId, sceneId } = data;
        const userId = socket.data.user?.id; 
        
        const table = await Table.findById(tableId);
        if (!table) return;

        const isDM = table.dm.toString() === userId;
        const isOwner = table.players.some(player => player._id.toString() === userId);

        if (!isDM && !isOwner) { // Se o usuário não for NEM o mestre E NEM o dono
        console.log(`[AUTH] Falha: Usuário ${userId} tentou avançar o turno sem permissão.`);
        socket.emit('tokenMoveError', { message: 'Você não tem permissão para avançar o turno.' });
        return;
        }

        const scene = await Scene.findById(sceneId);
        if (!scene || scene.initiative.length === 0) return;

        const initiativeList = scene.initiative;
        const currentTurnIndex = initiativeList.findIndex(entry => entry.isCurrentTurn);

        // Desmarca o turno atual
        if (currentTurnIndex !== -1) {
            initiativeList[currentTurnIndex].isCurrentTurn = false;
        }

        // Encontra o próximo turno, voltando ao início se chegar ao fim
        const nextTurnIndex = (currentTurnIndex + 1) % initiativeList.length;
        if (nextTurnIndex === 0) {
        console.log(`Nova rodada iniciada na cena ${sceneId}. Resetando movimento de todos os tokens.`);
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
    } catch (error) { 
        console.error("Erro ao avançar o turno:", error); 
    }
  };

  const requestResetInitiative = async (data: { tableId: string, sceneId: string }) => {
    try {
        const { tableId, sceneId } = data;
        const userId = socket.data.user?.id;

        const table = await Table.findById(tableId);
        if (!table) return;
        
        if (table.dm.toString() !== userId) {
            console.log(`[AUTH] Falha: Usuário ${userId} tentou resetar a iniciativa da mesa ${tableId}, mas não é o mestre.`);
            return socket.emit('error', { message: 'Apenas o Mestre pode resetar a iniciativa.' });
        }

        const updatedScene = await Scene.findByIdAndUpdate(
            sceneId,
            { initiative: [] }, // Define o array de iniciativa como vazio
            { new: true }
        );

        io.to(tableId).emit('initiativeUpdated', updatedScene?.initiative);
    } catch (error) { 
        console.error("Erro ao resetar a iniciativa:", error); 
    }
  };

  const requestRemoveFromInitiative = async (data: { tableId: string; sceneId: string; initiativeEntryId: string }) => {
    try {
        const { tableId, sceneId, initiativeEntryId } = data;
        
        const userId = socket.data.user?.id;
        const table = await Table.findById(tableId);
        if (!table) return;
        if (table.dm.toString() !== userId) {
        console.log(`[AUTH] Falha: Usuário ${userId} tentou remover da iniciativa da mesa ${tableId}, mas não é o mestre.`);
        return socket.emit('error', { message: 'Apenas o Mestre pode remover personagens da iniciativa.' });
        }

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
        // Notifica sobre a lista de iniciativa atualizada
        io.to(tableId).emit('initiativeUpdated', updatedScene.initiative);

        // Notifica que um token foi removido
        if (entryToRemove?.tokenId) {
            io.to(tableId).emit('tokenRemoved', { tokenId: entryToRemove.tokenId.toString() });
        }
        }
    } catch (error) { 
        console.error("Erro ao remover da iniciativa:", error); 
    }
  };

  const requestReorderInitiative = async (data: { tableId: string; sceneId: string; newOrder: IInitiativeEntry[] }) => {
    try {
        const { tableId, sceneId, newOrder } = data;
        const userId = socket.data.user?.id;

        const table = await Table.findById(tableId);
        if (!table) return;
        if (table.dm.toString() !== userId) {
        console.log(`[AUTH] Falha: Usuário ${userId} tentou reordenar a iniciativa da mesa ${tableId}, mas não é o mestre.`);
        return socket.emit('error', { message: 'Apenas o Mestre pode reordenar a iniciativa.' });
        }

        // Atualiza todo o array 'initiative' da cena com a nova ordem recebida
        const updatedScene = await Scene.findByIdAndUpdate(
        sceneId,
        { initiative: newOrder },
        { new: true }
        );

        if (updatedScene) {
        // Em vez de io.to, usamos socket.to para manter a fluidez para o mestre
        socket.to(tableId).emit('initiativeUpdated', updatedScene.initiative);
        }
    } catch (error) { 
        console.error("Erro ao reordenar iniciativa:", error); 
    }
  };

  const requestEditInitiativeEntry = async (data: { tableId: string; sceneId: string; initiativeEntryId: string; newName: string }) => {
    try {
      const { tableId, sceneId, initiativeEntryId, newName } = data;
      const userId = socket.data.user?.id;

      const table = await Table.findById(tableId);
      if (!table) return;
      if (table.dm.toString() !== userId) {
        console.log(`[AUTH] Falha: Usuário ${userId} tentou editar entrada da iniciativa da mesa ${tableId}, mas não é o mestre.`);
        return socket.emit('error', { message: 'Apenas o Mestre pode editar entradas da iniciativa.' });
      }

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