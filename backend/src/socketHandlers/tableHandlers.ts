import { Server, Socket } from 'socket.io';
import { listScenePersistents, listSceneAuras } from '../services/measurementService';
import { getTableById, assertUserIsDM, updateTableStatus } from '../services/tableService';
import {
    getSceneWithTokens,
    setActiveScene,
    updateSceneMap,
    reorderScenes,
    updateSceneGridDimensions,
    updateSceneScale,
} from '../services/sceneService';
import { buildSessionState as buildSessionStateDTO } from '../dto/sessionAssembler';
import { createLogger } from '../logger';
import { recordTableJoin } from '../metrics';

async function buildSessionState(tableId: string) {
    const table = await getTableById(tableId, [
        { path: 'activeScene' },
        { path: 'scenes' },
        { path: 'players', select: 'username _id' },
        { path: 'dm', select: 'username _id' },
    ]);
    if (!table) return null;
    const activeSceneId = table.activeScene?._id?.toString();
    const { activeScene, tokens } = activeSceneId
        ? await getSceneWithTokens(activeSceneId)
        : { activeScene: null, tokens: [] };
    const initiative = activeScene?.initiative ?? [];
    const measurements = activeSceneId ? listScenePersistents(tableId, activeSceneId) : [];
    const auras = activeSceneId ? listSceneAuras(tableId, activeSceneId) : [];
    const scenes = Array.isArray(table.scenes) ? (table.scenes as any) : [];
    return buildSessionStateDTO(table as any, activeScene as any, scenes, tokens as any, initiative as any, measurements, auras);
}

export function registerTableHandlers(io: Server, socket: Socket) {
    const log = createLogger({ eventType: 'socket:table', socketId: socket.id, userId: socket.data.user?.id });
    const logError = (message: string, error: unknown, context: Record<string, unknown> = {}) => {
        log.error({ ...context, err: error instanceof Error ? error : undefined }, message);
    };

    const joinTable = async (tableId: string) => {
        try {
            socket.join(tableId);
            recordTableJoin(socket.id, tableId);
            log.info({ tableId }, 'Socket entrou na mesa via canal realtime');
            const sessionState = await buildSessionState(tableId);
            if (!sessionState) return;
            socket.emit('initialSessionState', sessionState);
            const activeSceneId = sessionState.activeScene?._id ?? sessionState.table.activeSceneId ?? null;
            if (activeSceneId) {
                const persistents = listScenePersistents(tableId, activeSceneId);
                socket.emit('persistentsListed', { sceneId: activeSceneId, items: persistents });
                const auras = listSceneAuras(tableId, activeSceneId);
                socket.emit('aurasListed', { sceneId: activeSceneId, items: auras });
            }
        } catch (error) {
            logError('Erro joinTable', error, { tableId });
            socket.emit('error', { message: `Não foi possível entrar na mesa ${tableId}` });
        }
    };

    const requestSetActiveScene = async (data: { tableId: string, sceneId: string }) => {
        try {
            const { tableId, sceneId } = data;
            const userId = socket.data.user?.id;
            const table = await getTableById(tableId);
            if (!table) return;
            assertUserIsDM(userId, table);
            await setActiveScene(tableId, sceneId);

            const newState = await buildSessionState(tableId);

            if (newState) {
                io.to(data.tableId).emit('sessionStateUpdated', newState);
            }
            const persistents = listScenePersistents(tableId, sceneId);
            io.to(tableId).emit('persistentsListed', { sceneId, items: persistents });
            const auras = listSceneAuras(tableId, sceneId);
            io.to(tableId).emit('aurasListed', { sceneId, items: auras });
        } catch (error) {
            logError('Erro ao definir cena ativa', error, { tableId: data.tableId, sceneId: data.sceneId });
        }
    };

    const requestUpdateSessionStatus = async (data: { tableId: string, newStatus: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED', pauseSeconds?: number }) => {
        try {
            const { tableId, newStatus, pauseSeconds } = data;
            const userId = socket.data.user?.id;
            const table = await getTableById(tableId);
            if (!table) return;
            assertUserIsDM(userId, table);
            const updated = await updateTableStatus(table as any, newStatus, pauseSeconds);

            io.to(tableId).emit('sessionStatusUpdated', { status: newStatus, pauseUntil: (updated as any).pauseUntil || null, serverNowMs: Date.now() });
        } catch (error) {
            logError('Erro ao atualizar status da sessão', error, { tableId: data.tableId, newStatus: data.newStatus });
        }
    };

    const requestStartTransition = async (data: { tableId: string, durationMs?: number }) => {
        try {
            const { tableId, durationMs } = data;
            const userId = socket.data.user?.id;
            const table = await getTableById(tableId);
            if (!table) return;
            assertUserIsDM(userId, table);
            const dur = Math.max(500, Math.min(10000, Number(durationMs) || 3000));
            io.to(tableId).emit('sessionTransition', { durationMs: dur });
        } catch (error) {
            logError('Erro ao iniciar transição', error, { tableId: data.tableId });
        }
    };

    const requestSetMap = async (data: { mapUrl: string, tableId: string }) => {
        try {
            if (typeof data.mapUrl === 'string' && data.tableId) {
                const table = await getTableById(data.tableId);
                if (!table || !table.activeScene) return;
                assertUserIsDM(socket.data.user?.id, table);

                const updatedScene = await updateSceneMap(table.activeScene.toString(), data.mapUrl);

                if (updatedScene) io.to(data.tableId).emit('mapUpdated', { mapUrl: updatedScene.imageUrl });
            }
        } catch (error) {
            logError('Erro ao atualizar o mapa da mesa', error, { tableId: data.tableId });
        }
    };

    const requestReorderScenes = async (data: { tableId: string, orderedSceneIds: string[] }) => {
        try {
            const { tableId, orderedSceneIds } = data;
            const userId = socket.data.user?.id;
            const table = await getTableById(tableId);
            if (!table) return;
            assertUserIsDM(userId, table);

            const updatedTable = await reorderScenes(table as any, orderedSceneIds);
            if (updatedTable) {
                socket.to(tableId).emit('sceneListUpdated', updatedTable.scenes);
            }
        } catch (error) {
            logError('Erro ao reordenar cenas', error, { tableId: data.tableId });
        }
    };

    const requestUpdateGridDimensions = async (data: { tableId: string, sceneId: string, newGridWidth: number, newGridHeight: number }) => {
        try {
            const { tableId, sceneId, newGridWidth, newGridHeight } = data;
            const userId = socket.data.user?.id;
            const table = await getTableById(tableId, [{ path: 'scenes' }]);
            if (!table) return;

            assertUserIsDM(userId, table);

            await updateSceneGridDimensions(sceneId, newGridWidth, newGridHeight);
            const newState = await buildSessionState(tableId);
            if (newState) {
                io.to(tableId).emit('sessionStateUpdated', newState);
            }
        } catch (error) {
            logError('Erro ao atualizar o tamanho do grid', error, { tableId: data.tableId, sceneId: data.sceneId });
        }
    };

    const requestUpdateSceneScale = async (data: { tableId: string; sceneId: string; metersPerSquare: number }) => {
        try {
            const { tableId, sceneId, metersPerSquare } = data;
            const userId = socket.data.user?.id;
            const table = await getTableById(tableId);
            if (!table) return;
            assertUserIsDM(userId, table);
            await updateSceneScale(sceneId, metersPerSquare);
            const newState = await buildSessionState(tableId);
            if (newState) {
                io.to(tableId).emit('sessionStateUpdated', newState);
            }
        } catch (error) {
            logError('Erro ao atualizar escala da cena', error, { tableId: data.tableId, sceneId: data.sceneId });
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
