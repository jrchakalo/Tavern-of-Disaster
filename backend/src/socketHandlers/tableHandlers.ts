import { Server, Socket } from 'socket.io';
import Table from '../models/Table.model';
import Token from '../models/Token.model';
import Scene from '../models/Scene.model';

async function getFullSessionState(tableId: string, sceneId: string) {
  const activeScene = await Scene.findById(sceneId);
  const tokens = await Token.find({ sceneId: sceneId }).populate('ownerId', '_id username');
  return { activeScene, tokens };
}

export function registerTableHandlers(io: Server, socket: Socket) {
    
    const joinTable = async (tableId: string) => {
        try {
        socket.join(tableId);
        console.log(`Socket ${socket.id} entrou na sala da mesa ${tableId}`);

        const table = await Table.findById(tableId)
            .populate('activeScene')
            .populate('scenes')
            .populate('players', 'username _id')
            .populate('dm', 'username _id');
        if (!table) return;

        const activeSceneId = table.activeScene?._id;
        const tokens = activeSceneId 
            ? await Token.find({ sceneId: activeSceneId }).populate('ownerId', '_id username') 
            : [];

        const initialState = {
            tableInfo: table,
            activeScene: table.activeScene,
            tokens: tokens,
            allScenes: table.scenes,
        };

        socket.emit('initialSessionState', initialState);
        } catch (error) {
        console.error(`Erro ao entrar na sala ${tableId}:`, error);
        socket.emit('error', { message: `Não foi possível entrar na mesa ${tableId}` });
        }
    };

    const requestSetActiveScene = async (data: { tableId: string, sceneId: string }) => {
        try {
            const { tableId, sceneId } = data;
            const userId = socket.data.user?.id; // Pega o usuário da conexão autenticada

            const table = await Table.findById(tableId);
            if (!table) return;

            if (table.dm.toString() !== userId) {
            console.log(`[AUTH] Falha: Usuário ${userId} tentou mudar cena da mesa ${tableId}, mas não é o mestre.`);
            return socket.emit('error', { message: 'Apenas o Mestre pode mudar a cena.' });
            }

            await Table.findByIdAndUpdate(tableId, { activeScene: sceneId });

            const newState = await getFullSessionState(data.tableId, data.sceneId);

            io.to(data.tableId).emit('sessionStateUpdated', newState);
            console.log(`Mesa ${tableId} teve sua cena ativa atualizada para ${sceneId}`);

        } catch (error) {
            console.error('Erro ao definir cena ativa:', error);
        }
    };

    const requestUpdateSessionStatus = async (data: { tableId: string, newStatus: 'LIVE' | 'ENDED' }) => {
        try {
            const { tableId, newStatus } = data;
            const userId = socket.data.user?.id;

            const table = await Table.findById(tableId);
            if (!table || table.dm.toString() !== userId) {
            return socket.emit('error', { message: 'Apenas o Mestre pode alterar o status da sessão.' });
            }

            table.status = newStatus;
            await table.save();

            console.log(`Status da mesa ${tableId} atualizado para ${newStatus}`);

            
            io.to(tableId).emit('sessionStatusUpdated', { status: newStatus });

        } catch (error) { 
            console.error("Erro ao atualizar status da sessão:", error); 
        }
    };

    const requestSetMap = async (data: { mapUrl: string, tableId: string }) => {
        try {
            if (typeof data.mapUrl === 'string' && data.tableId) {
            // Encontra a mesa para obter o ID da cena ativa
            const table = await Table.findById(data.tableId);
            if (!table || !table.activeScene) return;
    
            const updatedScene = await Scene.findByIdAndUpdate(
                table.activeScene,
                { imageUrl: data.mapUrl },
                { new: true }
            );
    
            if (updatedScene) {
                console.log(`Mapa da cena ${updatedScene._id} atualizado para: ${updatedScene.imageUrl}`);
                // Notifica a sala sobre o novo mapa
                io.to(data.tableId).emit('mapUpdated', { mapUrl: updatedScene.imageUrl });
            }
            }
        } catch (error) {
            console.error("Erro ao atualizar o mapa da mesa:", error);
        }
    };
    
    const requestReorderScenes = async (data: { tableId: string, orderedSceneIds: string[] }) => {
        try {
            const { tableId, orderedSceneIds } = data;
            const userId = socket.data.user?.id;
        
            const table = await Table.findById(tableId);
            if (!table) return;
            if (table.dm.toString() !== userId) {
                console.log(`[AUTH] Falha: Usuário ${userId} tentou reordenar cenas da mesa ${tableId}, mas não é o mestre.`);
                return socket.emit('error', { message: 'Apenas o Mestre pode reordenar as cenas.' });
            }
        
            // Atualiza o array 'scenes' no documento da mesa com a nova ordem de IDs
            const updatedTable = await Table.findByIdAndUpdate(
                tableId,
                { scenes: orderedSceneIds },
                { new: true }
            ).populate('scenes'); // Popula para enviar a lista completa de volta
        
            if (updatedTable) {
                // Notifica todos na sala (exceto o Mestre que arrastou) sobre a nova ordem
                socket.to(tableId).emit('sceneListUpdated', updatedTable.scenes);
            }
        } catch (error) { 
            console.error("Erro ao reordenar cenas:", error); 
        }
    };

    const requestUpdateGridDimensions = async (data: { tableId: string, sceneId: string, newGridWidth: number, newGridHeight: number }) => {
        try {
            const { tableId, sceneId, newGridWidth, newGridHeight } = data;
            const userId = socket.data.user?.id; // Pega o usuário da conexão autenticada
            const table = await Table.findById(tableId).populate('scenes');
            if (!table) return;

            if (table.dm.toString() !== userId) {
            console.log(`[AUTH] Falha: Usuário ${userId} tentou atualizar o tamanho do grid da mesa ${tableId}, mas não é o mestre.`);
            return socket.emit('error', { message: 'Apenas o Mestre pode atualizar o tamanho do grid.' });
            }

                        await Scene.findByIdAndUpdate(sceneId, { gridWidth: newGridWidth, gridHeight: newGridHeight });
            
            const activeScene = await Scene.findById(sceneId);
            const tokens = await Token.find({ sceneId: sceneId });

            const newState = {
            tableInfo: table,
            activeScene: activeScene,
            tokens: tokens,
            allScenes: table?.scenes || []
            };

            // Envia para TODOS (incluindo o mestre) para garantir reatividade local consistente
            io.to(tableId).emit('sessionStateUpdated', newState);
        } catch (error) {
            console.error('Erro ao atualizar o tamanho do grid:', error);
        }
    };

  socket.on('joinTable', joinTable);
  socket.on('requestSetActiveScene', requestSetActiveScene);
  socket.on('requestUpdateSessionStatus', requestUpdateSessionStatus);
  socket.on('requestSetMap', requestSetMap);
  socket.on('requestReorderScenes', requestReorderScenes);
    socket.on('requestUpdateGridDimensions', requestUpdateGridDimensions);
}
  