import { Server, Socket } from 'socket.io';
import {
  shareEphemeralMeasurement,
  removeEphemeralMeasurement,
  cleanupUserMeasurements,
  addPersistentMeasurement,
  removePersistentMeasurement,
  clearAllMeasurements,
  upsertTokenAura,
  removeTokenAura,
} from '../services/measurementService';
import { assertUserInTable, assertUserIsDM } from '../services/tableService';
import { ServiceError, assertCondition } from '../services/serviceErrors';
import {
  assertEntityBelongsToTable,
  loadSceneContext,
  loadTokenContext,
} from '../services/authorizationService';
import { bumpRevision, getRevision } from '../services/revisionService';
import { getAurasDTO, getMeasurementsDTO } from '../services/sessionService';
import { randomId } from '../utils/id';
import { extractAck, runAction } from './ack';
import { createLogger } from '../logger';
import { validate } from '../validation/validate';
import {
  zShareMeasurementPayload,
  zAddPersistentMeasurementPayload,
  zRemovePersistentMeasurementPayload,
  zClearAllMeasurementsPayload,
  zRemoveMeasurementPayload,
  zUpsertAuraPayload,
  zRemoveAuraPayload,
  zPingPayload,
} from '../validation/schemas';

function hintTableId(payload: unknown): string | undefined {
  const raw = payload as { tableId?: unknown } | undefined;
  return typeof raw?.tableId === 'string' ? raw.tableId : undefined;
}

export function registerMeasurementHandlers(io: Server, socket: Socket) {
  const log = createLogger({ scope: 'socket:measurement', socketId: socket.id, userId: socket.data.user?.id });

  // Compartilha medição efêmera. Jogador só pode se for turno do seu token; Mestre sempre.
  const requestShareMeasurement = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestShareMeasurement',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const user = socket.data.user;
        assertCondition(!!user, 'Usuário não autenticado.', 401);
        const data = validate(zShareMeasurementPayload, payload);
        const { tableId, sceneId } = data;
        const { scene, table } = await loadSceneContext(sceneId);
        assertEntityBelongsToTable(table._id.toString(), tableId);
        assertUserInTable(user!.id, table);

        const measurement = await shareEphemeralMeasurement(user!, tableId, scene._id.toString(), {
          start: data.start,
          end: data.end,
          distance: data.distance,
          type: data.type,
          affectedSquares: data.affectedSquares,
          color: data.color || '#ff8c00',
          sceneId: scene._id.toString(),
        });
        if (!measurement) {
          throw new ServiceError('Você não pode compartilhar medição agora.', 403);
        }
        io.to(tableId).emit('measurementShared', measurement);
        return { tableId, revision: await getRevision(tableId) };
      },
    });
  };

  // Remove medição efêmera própria (não altera estado persistente).
  const requestRemoveMeasurement = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestRemoveMeasurement',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const user = socket.data.user;
        assertCondition(!!user, 'Usuário não autenticado.', 401);
        const data = validate(zRemoveMeasurementPayload, payload);
        const { scene, table } = await loadSceneContext(data.sceneId);
        assertEntityBelongsToTable(table._id.toString(), data.tableId);
        assertUserInTable(user!.id, table);

        removeEphemeralMeasurement(data.tableId, user!.id);
        io.to(data.tableId).emit('measurementRemoved', { userId: user!.id });
        return { tableId: data.tableId, revision: await getRevision(data.tableId) };
      },
    });
  };

  // Limpa medições efêmeras do usuário ao desconectar.
  const handleDisconnect = () => {
    const user = socket.data.user;
    if (!user) return;
    const tables = cleanupUserMeasurements(user.id);
    tables.forEach((tid) => io.to(tid).emit('measurementRemoved', { userId: user.id }));
  };

  socket.on('requestShareMeasurement', requestShareMeasurement);
  socket.on('requestRemoveMeasurement', requestRemoveMeasurement);
  socket.on('disconnect', handleDisconnect);

  // --- Persistentes ---
  // Cria/guarda medição persistente associada à cena. Mestre sempre; jogador apenas no seu turno.
  const requestAddPersistentMeasurement = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestAddPersistentMeasurement',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const user = socket.data.user;
        assertCondition(!!user, 'Usuário não autenticado.', 401);
        const data = validate(zAddPersistentMeasurementPayload, payload);
        const { tableId, sceneId } = data;
        const { scene, table } = await loadSceneContext(sceneId);
        assertEntityBelongsToTable(table._id.toString(), tableId);
        assertUserInTable(user!.id, table);

        const persistent = await addPersistentMeasurement(user!, tableId, scene._id.toString(), {
          ...data.payload,
          color: data.payload.color || '#ff8c00',
          sceneId: scene._id.toString(),
        });
        const revision = await bumpRevision(tableId);

        io.to(tableId).emit('persistentMeasurementAdded', {
          tableId,
          sceneId,
          revision,
          ownerId: user!.id,
          userId: persistent.userId,
          id: persistent.id,
          start: persistent.start,
          end: persistent.end,
          distance: persistent.distance,
          type: persistent.type,
          affectedSquares: persistent.affectedSquares,
          color: persistent.color,
          username: persistent.username,
        });

        return {
          tableId,
          revision,
          changes: { measurements: getMeasurementsDTO(tableId, scene._id.toString()) },
        };
      },
    });
  };

  // Remove medição persistente (Mestre ou autor).
  const requestRemovePersistentMeasurement = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestRemovePersistentMeasurement',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const user = socket.data.user;
        assertCondition(!!user, 'Usuário não autenticado.', 401);
        const data = validate(zRemovePersistentMeasurementPayload, payload);
        const { tableId, sceneId, id } = data;
        const { scene, table } = await loadSceneContext(sceneId);
        assertEntityBelongsToTable(table._id.toString(), tableId);
        assertUserInTable(user!.id, table);

        await removePersistentMeasurement(user!, tableId, scene._id.toString(), id);
        const revision = await bumpRevision(tableId);
        io.to(tableId).emit('persistentMeasurementRemoved', { sceneId, id, revision });

        return {
          tableId,
          revision,
          changes: { measurements: getMeasurementsDTO(tableId, scene._id.toString()) },
        };
      },
    });
  };

  // Limpa (Mestre) tudo: efêmeras + persistentes + auras da cena.
  const requestClearAllMeasurements = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestClearAllMeasurements',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const user = socket.data.user;
        assertCondition(!!user, 'Usuário não autenticado.', 401);
        const data = validate(zClearAllMeasurementsPayload, payload);
        const { tableId, sceneId } = data;
        const { scene, table } = await loadSceneContext(sceneId);
        assertEntityBelongsToTable(table._id.toString(), tableId);
        assertUserIsDM(user!.id, table);

        await clearAllMeasurements(tableId, scene._id.toString());
        const revision = await bumpRevision(tableId);
        io.to(tableId).emit('allMeasurementsCleared', { sceneId, revision });

        return {
          tableId,
          revision,
          changes: {
            measurements: getMeasurementsDTO(tableId, scene._id.toString()),
            auras: getAurasDTO(tableId, scene._id.toString()),
          },
        };
      },
    });
  };

  socket.on('requestAddPersistentMeasurement', requestAddPersistentMeasurement);
  socket.on('requestRemovePersistentMeasurement', requestRemovePersistentMeasurement);
  socket.on('requestClearAllMeasurements', requestClearAllMeasurements);

  // --- Auras ancoradas ao token ---
  // Inclui/atualiza aura ancorada a token. Permissão: Mestre, dono do token ou dono do token em turno.
  const requestUpsertAura = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestUpsertAura',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const user = socket.data.user;
        assertCondition(!!user, 'Usuário não autenticado.', 401);
        const data = validate(zUpsertAuraPayload, payload);
        const { token, scene, table } = await loadTokenContext(data.tokenId);
        assertEntityBelongsToTable(table._id.toString(), data.tableId);
        assertCondition(scene._id.toString() === data.sceneId, 'Token pertence a outra cena.', 403);
        assertUserInTable(user!.id, table);

        const aura = await upsertTokenAura(user!, data.tableId, scene._id.toString(), token._id.toString(), {
          name: data.name,
          color: data.color,
          radiusMeters: data.radiusMeters,
          difficultTerrain: data.difficultTerrain,
        });
        const revision = await bumpRevision(data.tableId);
        io.to(data.tableId).emit('auraUpserted', { ...aura, revision });

        return {
          tableId: data.tableId,
          revision,
          changes: { auras: getAurasDTO(data.tableId, scene._id.toString()) },
        };
      },
    });
  };

  // Remove aura (apenas Mestre).
  const requestRemoveAura = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestRemoveAura',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const user = socket.data.user;
        assertCondition(!!user, 'Usuário não autenticado.', 401);
        const data = validate(zRemoveAuraPayload, payload);
        const { scene, table } = await loadSceneContext(data.sceneId);
        assertEntityBelongsToTable(table._id.toString(), data.tableId);
        assertUserInTable(user!.id, table);

        await removeTokenAura(user!, data.tableId, scene._id.toString(), data.tokenId);
        const revision = await bumpRevision(data.tableId);
        io.to(data.tableId).emit('auraRemoved', { sceneId: data.sceneId, tokenId: data.tokenId, revision });

        return {
          tableId: data.tableId,
          revision,
          changes: { auras: getAurasDTO(data.tableId, scene._id.toString()) },
        };
      },
    });
  };

  socket.on('requestUpsertAura', requestUpsertAura);
  socket.on('requestRemoveAura', requestRemoveAura);

  // Ping visual curto (ripple). Efêmero: não incrementa revisão.
  const requestPing = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestPing',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const user = socket.data.user;
        assertCondition(!!user, 'Usuário não autenticado.', 401);
        const data = validate(zPingPayload, payload);
        // A mesa é resolvida pela cena, nunca pelo tableId enviado.
        const { scene, table } = await loadSceneContext(data.sceneId);
        const tableId = table._id.toString();
        assertEntityBelongsToTable(tableId, data.tableId);
        assertUserInTable(user!.id, table);
        assertCondition(
          !!table.activeScene && table.activeScene.toString() === scene._id.toString(),
          'Só é possível pingar na cena ativa.',
          400
        );

        const gridWidth = scene.gridWidth ?? 30;
        const gridHeight = scene.gridHeight ?? 30;
        assertCondition(
          data.x >= 0 && data.x <= gridWidth && data.y >= 0 && data.y <= gridHeight,
          'Ping fora dos limites da grade.',
          400
        );

        const revision = await getRevision(tableId);
        const ping = {
          id: randomId(6),
          userId: user!.id,
          username: user!.username,
          sceneId: scene._id.toString(),
          squareId: data.squareId,
          x: data.x,
          y: data.y,
          color: data.color,
          ts: Date.now(),
          revision,
        };
        io.to(tableId).emit('pingBroadcast', ping);
        return { tableId, revision };
      },
    });
  };

  socket.on('requestPing', requestPing);
}
