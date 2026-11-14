import { Server, Socket } from 'socket.io';
import { getTableById, assertUserIsDM, assertUserInTable, updateTableStatus } from '../services/tableService';
import {
  setActiveScene,
  updateSceneMap,
  reorderScenes,
  updateSceneGridDimensions,
  updateSceneScale,
} from '../services/sceneService';
import {
  assertEntityBelongsToTable,
  loadClaimedTable,
  loadSceneContext,
} from '../services/authorizationService';
import { assertExpectedRevision, bumpRevision, getRevision } from '../services/revisionService';
import { buildSessionSnapshot, loadSessionState, sendPresenceUpdated } from '../services/sessionService';
import { joinPresence } from '../services/presenceService';
import { mapScene } from '../dto/sessionAssembler';
import { SessionPatchChanges } from '../dto/session.dto';
import { assertCondition, ServiceError } from '../services/serviceErrors';
import { extractAck, runAction } from './ack';
import { createLogger } from '../logger';
import { recordTableJoin } from '../metrics';
import { validate } from '../validation/validate';
import {
  zJoinTablePayload,
  zRequestResyncPayload,
  zSetActiveScenePayload,
  zUpdateSessionStatusPayload,
  zStartTransitionPayload,
  zSetMapPayload,
  zReorderScenesPayload,
  zUpdateGridDimensionsPayload,
  zUpdateSceneScalePayload,
} from '../validation/schemas';

const JOIN_ATTEMPT_WINDOW_MS = 60_000;
const JOIN_ATTEMPT_LIMIT = 10;

export function registerTableHandlers(io: Server, socket: Socket) {
  const log = createLogger({ eventType: 'socket:table', socketId: socket.id, userId: socket.data.user?.id });

  // Limite simples de tentativas de joinTable por socket para dificultar enumeração.
  const joinAttempts: number[] = [];
  const registerJoinAttempt = () => {
    const now = Date.now();
    while (joinAttempts.length && now - joinAttempts[0] > JOIN_ATTEMPT_WINDOW_MS) {
      joinAttempts.shift();
    }
    joinAttempts.push(now);
    assertCondition(
      joinAttempts.length <= JOIN_ATTEMPT_LIMIT,
      'Muitas tentativas de entrada. Aguarde um instante e tente novamente.',
      429
    );
  };

  const hintTableId = (payload: unknown): string | undefined => {
    if (typeof payload === 'string') return payload;
    const raw = payload as { tableId?: unknown } | undefined;
    return typeof raw?.tableId === 'string' ? raw.tableId : undefined;
  };

  const joinTable = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'joinTable',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        registerJoinAttempt();
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const { tableId } = validate(zJoinTablePayload, payload);

        // Autoriza ANTES de entrar na sala. A mesa é carregada sem populate
        // para que dm/players continuem como ObjectId na checagem de vínculo.
        const table = await getTableById(tableId);
        // Normaliza mesa inexistente para FORBIDDEN: não revela existência de
        // mesas para não membros (joinTable já é limitado por socket).
        if (!table) {
          throw new ServiceError('Usuário não faz parte desta mesa.', 403);
        }
        assertUserInTable(userId, table);

        if (!socket.rooms.has(tableId)) {
          await socket.join(tableId);
        }
        recordTableJoin(socket.id, tableId);
        if (!socket.data.joinedTables) {
          socket.data.joinedTables = new Set<string>();
        }
        socket.data.joinedTables.add(tableId);

        const username = socket.data.user?.username || '';
        joinPresence(tableId, userId, username, socket.id);

        const snapshot = await buildSessionSnapshot(tableId, userId, username);
        if (!snapshot) {
          throw new ServiceError('Mesa não encontrada.', 404);
        }

        socket.emit('sessionSnapshot', snapshot);

        // Compatibilidade temporária com o cliente antigo.
        socket.emit('initialSessionState', snapshot);
        const activeSceneId = snapshot.activeScene?._id ?? snapshot.table.activeSceneId ?? null;
        if (activeSceneId) {
          socket.emit('persistentsListed', {
            sceneId: activeSceneId,
            items: snapshot.measurements,
          });
          socket.emit('aurasListed', { sceneId: activeSceneId, items: snapshot.auras });
        }

        sendPresenceUpdated(io, tableId, snapshot.table, snapshot.revision);

        log.info({ tableId }, 'Socket entrou na mesa via canal realtime');
        return { tableId, revision: snapshot.revision };
      },
    });
  };

  // Resync idempotente: sempre devolve snapshot completo para membro.
  const requestResync = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestResync',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zRequestResyncPayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const table = await getTableById(data.tableId);
        assertCondition(!!table, 'Mesa não encontrada.', 404);
        assertUserInTable(userId, table!);

        if (!socket.rooms.has(data.tableId)) {
          await socket.join(data.tableId);
          if (!socket.data.joinedTables) {
            socket.data.joinedTables = new Set<string>();
          }
          socket.data.joinedTables.add(data.tableId);
          joinPresence(data.tableId, userId, socket.data.user?.username || '', socket.id);
        }

        const snapshot = await buildSessionSnapshot(data.tableId, userId, socket.data.user?.username || '');
        if (!snapshot) {
          throw new ServiceError('Mesa não encontrada.', 404);
        }
        socket.emit('sessionSnapshot', snapshot);
        return { tableId: data.tableId, revision: snapshot.revision };
      },
    });
  };

  const requestSetActiveScene = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestSetActiveScene',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zSetActiveScenePayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const { scene, table } = await loadSceneContext(data.sceneId);
        assertEntityBelongsToTable(table._id.toString(), data.tableId);
        assertUserIsDM(userId, table);
        await assertExpectedRevision(data.tableId, data.expectedRevision);

        await setActiveScene(table._id.toString(), scene._id.toString());
        const revision = await bumpRevision(data.tableId);

        const bundle = await loadSessionState(data.tableId);
        assertCondition(!!bundle, 'Mesa não encontrada.', 404);

        // Compatibilidade temporária com o cliente antigo.
        io.to(data.tableId).emit('sessionStateUpdated', bundle!.state);
        io.to(data.tableId).emit('persistentsListed', {
          sceneId: scene._id.toString(),
          items: bundle!.state.measurements,
        });
        io.to(data.tableId).emit('aurasListed', {
          sceneId: scene._id.toString(),
          items: bundle!.state.auras,
        });

        const changes: SessionPatchChanges = {
          table: bundle!.state.table,
          activeScene: bundle!.state.activeScene,
          scenes: bundle!.state.scenes,
          tokens: bundle!.state.tokens,
          initiative: bundle!.state.initiative,
          measurements: bundle!.state.measurements,
          auras: bundle!.state.auras,
        };
        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  const requestUpdateSessionStatus = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestUpdateSessionStatus',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zUpdateSessionStatusPayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const table = await loadClaimedTable(userId, data.tableId, { requireDM: true });

        const updated = await updateTableStatus(table as any, data.newStatus, data.pauseSeconds);
        const revision = await bumpRevision(data.tableId);
        const pauseUntil = (updated as any).pauseUntil ? new Date((updated as any).pauseUntil).toISOString() : null;
        const serverNowMs = Date.now();

        io.to(data.tableId).emit('sessionStatusUpdated', {
          status: data.newStatus,
          pauseUntil,
          serverNowMs,
          revision,
        });

        const changes: SessionPatchChanges = {
          table: { status: data.newStatus, pauseUntil },
          sessionStatus: { status: data.newStatus, pauseUntil, serverNowMs },
        };
        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  const requestStartTransition = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestStartTransition',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zStartTransitionPayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        await loadClaimedTable(userId, data.tableId, { requireDM: true });
        const durationMs = Math.max(500, Math.min(10000, Number(data.durationMs) || 3000));
        io.to(data.tableId).emit('sessionTransition', { durationMs });
        return { tableId: data.tableId, revision: await getRevision(data.tableId) };
      },
    });
  };

  const requestSetMap = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestSetMap',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zSetMapPayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const table = await loadClaimedTable(userId, data.tableId, { requireDM: true });
        assertCondition(!!table.activeScene, 'Nenhuma cena ativa para atualizar o mapa.', 400);

        const updatedScene = await updateSceneMap(table.activeScene!.toString(), data.mapUrl);
        assertCondition(!!updatedScene, 'Cena não encontrada.', 404);
        const revision = await bumpRevision(data.tableId);

        io.to(data.tableId).emit('mapUpdated', {
          mapUrl: updatedScene!.imageUrl,
          sceneId: updatedScene!._id.toString(),
          revision,
        });

        const bundle = await loadSessionState(data.tableId);
        const changes: SessionPatchChanges = {
          activeScene: updatedScene ? mapScene(updatedScene) : null,
          scenes: bundle?.state.scenes,
        };
        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  const requestReorderScenes = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestReorderScenes',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zReorderScenesPayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const table = await loadClaimedTable(userId, data.tableId, { requireDM: true });

        const updatedTable = await reorderScenes(table as any, data.orderedSceneIds);
        assertCondition(!!updatedTable, 'Não foi possível reordenar as cenas.', 400);
        const revision = await bumpRevision(data.tableId);

        const scenes = (updatedTable.scenes as any[]).map((scene) => mapScene(scene));
        io.to(data.tableId).emit('sceneListUpdated', scenes);

        return { tableId: data.tableId, revision, changes: { scenes } };
      },
    });
  };

  const requestUpdateGridDimensions = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestUpdateGridDimensions',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zUpdateGridDimensionsPayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const { scene, table } = await loadSceneContext(data.sceneId);
        assertEntityBelongsToTable(table._id.toString(), data.tableId);
        assertUserIsDM(userId, table);

        await updateSceneGridDimensions(scene._id.toString(), data.newGridWidth, data.newGridHeight);
        const revision = await bumpRevision(data.tableId);

        const bundle = await loadSessionState(data.tableId);
        assertCondition(!!bundle, 'Mesa não encontrada.', 404);
        io.to(data.tableId).emit('sessionStateUpdated', bundle!.state);

        const changes: SessionPatchChanges = {
          scenes: bundle!.state.scenes,
          activeScene: bundle!.state.activeScene,
        };
        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  const requestUpdateSceneScale = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestUpdateSceneScale',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zUpdateSceneScalePayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const { scene, table } = await loadSceneContext(data.sceneId);
        assertEntityBelongsToTable(table._id.toString(), data.tableId);
        assertUserIsDM(userId, table);

        await updateSceneScale(scene._id.toString(), data.metersPerSquare);
        const revision = await bumpRevision(data.tableId);

        const bundle = await loadSessionState(data.tableId);
        assertCondition(!!bundle, 'Mesa não encontrada.', 404);
        io.to(data.tableId).emit('sessionStateUpdated', bundle!.state);

        const changes: SessionPatchChanges = {
          scenes: bundle!.state.scenes,
          activeScene: bundle!.state.activeScene,
        };
        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  socket.on('joinTable', joinTable);
  socket.on('requestResync', requestResync);
  socket.on('requestSetActiveScene', requestSetActiveScene);
  socket.on('requestUpdateSessionStatus', requestUpdateSessionStatus);
  socket.on('requestStartTransition', requestStartTransition);
  socket.on('requestSetMap', requestSetMap);
  socket.on('requestReorderScenes', requestReorderScenes);
  socket.on('requestUpdateGridDimensions', requestUpdateGridDimensions);
  socket.on('requestUpdateSceneScale', requestUpdateSceneScale);
}
