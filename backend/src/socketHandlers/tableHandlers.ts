import { Server, Socket } from 'socket.io';
import Table from '../models/Table.model';
import Token from '../models/Token.model';
import Scene from '../models/Scene.model';
import { listPersistents, listAuras } from './measurementStore';

// Reúne estado completo (cena ativa + tokens) para sincronização.
async function getFullSessionState(tableId: string, sceneId: string) {
  const activeScene = await Scene.findById(sceneId);
  const tokens = await Token.find({ sceneId: sceneId }).populate('ownerId', '_id username');
  return { activeScene, tokens };
}

export function registerTableHandlers(io: Server, socket: Socket) {
    
    const joinTable = async (tableId: string) => {
        try {
        socket.join(tableId);
        // Entrada na sala da mesa

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
                // Envia medições/aura persistentes somente ao novo cliente
                        if (activeSceneId) {
                            const persistents = listPersistents(tableId, activeSceneId.toString());
                            // Envia apenas para o socket que entrou
                            socket.emit('persistentsListed', { sceneId: activeSceneId.toString(), items: persistents });
                            const auras = listAuras(tableId, activeSceneId.toString());
                            socket.emit('aurasListed', { sceneId: activeSceneId.toString(), items: auras });
                        }
        } catch (error) {
        console.error('Erro joinTable:', error);
        socket.emit('error', { message: `Não foi possível entrar na mesa ${tableId}` });
        }
    };

    const requestSetActiveScene = async (data: { tableId: string, sceneId: string }) => {
        try {
            const { tableId, sceneId } = data;
            const userId = socket.data.user?.id; // Pega o usuário da conexão autenticada

            const table = await Table.findById(tableId);
            if (!table) return;

            if (table.dm.toString() !== userId) return socket.emit('error', { message: 'Apenas o Mestre pode mudar a cena.' });

            await Table.findByIdAndUpdate(tableId, { activeScene: sceneId });

            const newState = await getFullSessionState(data.tableId, data.sceneId);

            io.to(data.tableId).emit('sessionStateUpdated', newState);
            // Após trocar de cena, publicar a lista de persistentes da nova cena
            const persistents = listPersistents(tableId, sceneId);
            io.to(tableId).emit('persistentsListed', { sceneId, items: persistents });
            const auras = listAuras(tableId, sceneId);
            io.to(tableId).emit('aurasListed', { sceneId, items: auras });
            // Broadcast nova cena ativa

        } catch (error) {
            console.error('Erro ao definir cena ativa:', error);
        }
    };

    const requestUpdateSessionStatus = async (data: { tableId: string, newStatus: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED', pauseSeconds?: number }) => {
        try {
            const { tableId, newStatus, pauseSeconds } = data;
            const userId = socket.data.user?.id;

            const table = await Table.findById(tableId);
            if (!table || table.dm.toString() !== userId) return socket.emit('error', { message: 'Apenas o Mestre pode alterar o status da sessão.' });

            table.status = newStatus;
            if (newStatus === 'PAUSED') {
                const sec = Math.max(0, Math.floor(Number(pauseSeconds) || 0));
                if (sec > 0) {
                    const until = new Date(Date.now() + sec * 1000);
                    (table as any).pauseUntil = until;
                } else {
                    (table as any).pauseUntil = null;
                }
            } else {
                (table as any).pauseUntil = null;
            }
            await table.save();

            // Broadcast novo status

            io.to(tableId).emit('sessionStatusUpdated', { status: newStatus, pauseUntil: (table as any).pauseUntil || null, serverNowMs: Date.now() });

        } catch (error) { 
            console.error("Erro ao atualizar status da sessão:", error); 
        }
    };

    // Sinaliza uma transição curta (ex.: 3s) antes do LIVE para todos os clientes
    const requestStartTransition = async (data: { tableId: string, durationMs?: number }) => {
        try {
            const { tableId, durationMs } = data;
            const userId = socket.data.user?.id;
            const table = await Table.findById(tableId);
            if (!table || table.dm.toString() !== userId) return;
            const dur = Math.max(500, Math.min(10000, Number(durationMs) || 3000));
            io.to(tableId).emit('sessionTransition', { durationMs: dur });
        } catch (error) {
            console.error('Erro ao iniciar transição:', error);
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
    
            if (updatedScene) io.to(data.tableId).emit('mapUpdated', { mapUrl: updatedScene.imageUrl });
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
            if (table.dm.toString() !== userId) return socket.emit('error', { message: 'Apenas o Mestre pode reordenar as cenas.' });
        
            // Atualiza o array 'scenes' no documento da mesa com a nova ordem de IDs
            const updatedTable = await Table.findByIdAndUpdate(
                tableId,
                { scenes: orderedSceneIds },
                { new: true }
            ).populate('scenes'); // Popula para enviar a lista completa de volta
        
            if (updatedTable) {
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

            if (table.dm.toString() !== userId) return socket.emit('error', { message: 'Apenas o Mestre pode atualizar o tamanho do grid.' });

                        await Scene.findByIdAndUpdate(sceneId, { gridWidth: newGridWidth, gridHeight: newGridHeight });
            
            const activeScene = await Scene.findById(sceneId);
            const tokens = await Token.find({ sceneId: sceneId });

            const newState = {
            tableInfo: table,
            activeScene: activeScene,
            tokens: tokens,
            allScenes: table?.scenes || []
            };

            // Envia para todos para garantir reatividade local consistente
            io.to(tableId).emit('sessionStateUpdated', newState);
        } catch (error) {
            console.error('Erro ao atualizar o tamanho do grid:', error);
        }
    };

    const requestUpdateSceneScale = async (data: { tableId: string; sceneId: string; metersPerSquare: number }) => {
        try {
            const { tableId, sceneId, metersPerSquare } = data;
            const userId = socket.data.user?.id;
            const table = await Table.findById(tableId);
            if (!table) return;
            if (table.dm.toString() !== userId) return socket.emit('error', { message: 'Apenas o Mestre pode alterar a escala.' });
            await Scene.findByIdAndUpdate(sceneId, { metersPerSquare });
            const newState = await getFullSessionState(tableId, sceneId);
            io.to(tableId).emit('sessionStateUpdated', newState);
        } catch (error) {
            console.error('Erro ao atualizar escala da cena:', error);
        }
    };

  socket.on('joinTable', joinTable);
  socket.on('requestSetActiveScene', requestSetActiveScene);
    socket.on('requestUpdateSessionStatus', requestUpdateSessionStatus);
    socket.on('requestStartTransition', requestStartTransition);
  socket.on('requestSetMap', requestSetMap);
  socket.on('requestReorderScenes', requestReorderScenes);
    socket.on('requestUpdateGridDimensions', requestUpdateGridDimensions);
    socket.on('requestUpdateSceneScale', requestUpdateSceneScale);
}
  