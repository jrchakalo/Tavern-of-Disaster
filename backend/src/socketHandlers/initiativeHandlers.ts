import { Server, Socket } from 'socket.io';
import Scene, { IInitiativeEntry } from '../models/Scene.model';
import Token from '../models/Token.model';
import {
  addTokenToInitiative,
  advanceTurn,
  resetInitiative,
  removeInitiativeEntry,
  reorderInitiative,
  editInitiativeEntry,
} from '../services/initiativeService';
import { assertUserInTable, assertUserIsDM } from '../services/tableService';
import { clearEphemeralMeasurements } from '../services/measurementService';
import { assertCondition } from '../services/serviceErrors';
import {
  assertEntityBelongsToTable,
  loadInitiativeContext,
  loadSceneContext,
} from '../services/authorizationService';
import { assertExpectedRevision, bumpRevision, getRevision } from '../services/revisionService';
import { mapInitiativeEntry } from '../dto/sessionAssembler';
import { getTokensForScene } from '../services/sessionService';
import { SessionPatchChanges } from '../dto/session.dto';
import { extractAck, runAction } from './ack';
import { createLogger } from '../logger';
import { validate } from '../validation/validate';
import {
  zAddInitiativeEntryPayload,
  zRemoveInitiativeEntryPayload,
  zReorderInitiativePayload,
  zNextTurnPayload,
  zEditInitiativeEntryPayload,
} from '../validation/schemas';

const serializeEntry = (entry: IInitiativeEntry) => ({
  _id: entry._id?.toString() || '',
  characterName: entry.characterName,
  tokenId: entry.tokenId ? entry.tokenId.toString() : undefined,
  characterId: entry.characterId ? entry.characterId.toString() : undefined,
  isCurrentTurn: !!entry.isCurrentTurn,
});

const serializeOrder = (initiative: IInitiativeEntry[]) =>
  initiative.map((entry) => entry._id?.toString()).filter((id): id is string => Boolean(id));

function emitTurnState(
  io: Server,
  tableId: string,
  sceneId: string,
  initiative: IInitiativeEntry[],
  newRound = false,
  revision = 0
) {
  const current = initiative.find((entry) => entry.isCurrentTurn);
  if (!current?._id) return;
  const currentIndex = initiative.findIndex((entry) => entry._id?.toString() === current._id?.toString());
  const previous = currentIndex === -1
    ? undefined
    : initiative[(currentIndex - 1 + initiative.length) % initiative.length];

  io.to(tableId).emit('initiativeTurnAdvanced', {
    tableId,
    sceneId,
    revision,
    currentEntryId: current._id.toString(),
    previousEntryId: previous?._id?.toString(),
    currentTokenId: current.tokenId?.toString(),
    newRound,
  });
}

function hintTableId(payload: unknown): string | undefined {
  const raw = payload as { tableId?: unknown } | undefined;
  return typeof raw?.tableId === 'string' ? raw.tableId : undefined;
}

export function registerInitiativeHandlers(io: Server, socket: Socket) {
  const log = createLogger({ scope: 'socket:initiative', socketId: socket.id, userId: socket.data.user?.id });

  // Adiciona token à iniciativa (apenas Mestre). Evita duplicatas do mesmo token.
  const requestAddCharacterToInitiative = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestAddCharacterToInitiative',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zAddInitiativeEntryPayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const { scene, table } = await loadSceneContext(data.sceneId);
        assertEntityBelongsToTable(table._id.toString(), data.tableId);
        assertUserIsDM(userId, table);

        const token = await Token.findById(data.tokenId);
        assertCondition(!!token, 'Token não encontrado.', 404);
        assertCondition(token!.tableId?.toString() === table._id.toString(), 'Token pertence a outra mesa.', 403);
        assertCondition(token!.sceneId?.toString() === scene._id.toString(), 'Token pertence a outra cena.', 403);

        const initiative = await addTokenToInitiative(scene._id.toString(), token as any);
        const revision = await bumpRevision(data.tableId);

        const createdEntry = initiative.find((entry) => entry.tokenId?.toString() === data.tokenId);
        if (createdEntry) {
          io.to(data.tableId).emit('initiativeEntryAdded', {
            tableId: data.tableId,
            sceneId: data.sceneId,
            revision,
            entry: serializeEntry(createdEntry),
            order: serializeOrder(initiative),
          });
        }
        return { tableId: data.tableId, revision, changes: { initiative: initiative.map(mapInitiativeEntry) } };
      },
    });
  };

  // Avança para o próximo turno. Se voltar ao início da lista: nova rodada -> reseta movimento.
  const requestNextTurn = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestNextTurn',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zNextTurnPayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const { scene, table } = await loadSceneContext(data.sceneId);
        assertEntityBelongsToTable(table._id.toString(), data.tableId);
        assertUserInTable(userId, table);
        await assertExpectedRevision(data.tableId, data.expectedRevision);

        const result = await advanceTurn(table, scene, userId);
        const revision = await bumpRevision(data.tableId);

        emitTurnState(io, data.tableId, data.sceneId, result.initiative, result.newRound, revision);

        const changes: SessionPatchChanges = {
          initiative: result.initiative.map(mapInitiativeEntry),
        };
        if (result.newRound) {
          const tokens = await getTokensForScene(data.sceneId);
          io.to(data.tableId).emit('tokensMovementReset', {
            tableId: data.tableId,
            sceneId: data.sceneId,
            revision,
            updates: tokens.map((token) => ({
              tokenId: token._id,
              remainingMovement: token.remainingMovement,
              movement: token.movement,
            })),
          });
          changes.tokens = tokens;
        }
        clearEphemeralMeasurements(data.tableId);
        io.to(data.tableId).emit('allMeasurementsCleared', { sceneId: data.sceneId, revision });
        changes.measurements = [];

        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  // Remove todas as entradas da iniciativa (apenas Mestre) e limpa medições.
  const requestResetInitiative = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestResetInitiative',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zNextTurnPayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const { scene, table } = await loadSceneContext(data.sceneId);
        assertEntityBelongsToTable(table._id.toString(), data.tableId);
        assertUserIsDM(userId, table);
        await assertExpectedRevision(data.tableId, data.expectedRevision);

        const initiative = await resetInitiative(scene._id.toString());
        const revision = await bumpRevision(data.tableId);

        io.to(data.tableId).emit('initiativeReset', { tableId: data.tableId, sceneId: data.sceneId, revision });
        io.to(data.tableId).emit('initiativeOrderUpdated', {
          tableId: data.tableId,
          sceneId: data.sceneId,
          revision,
          order: serializeOrder(initiative),
          currentTurnId: null,
        });
        clearEphemeralMeasurements(data.tableId);
        io.to(data.tableId).emit('allMeasurementsCleared', { sceneId: data.sceneId, revision });

        return {
          tableId: data.tableId,
          revision,
          changes: { initiative: [], measurements: [] },
        };
      },
    });
  };

  // Remove entrada específica e deleta token associado (se houver). Apenas Mestre.
  const requestRemoveFromInitiative = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestRemoveFromInitiative',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zRemoveInitiativeEntryPayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const { scene, table } = await loadInitiativeContext(data.sceneId, data.initiativeEntryId);
        assertEntityBelongsToTable(table._id.toString(), data.tableId);
        assertUserIsDM(userId, table);

        const { initiative, removedTokenId } = await removeInitiativeEntry(
          scene._id.toString(),
          data.initiativeEntryId,
          true
        );
        const revision = await bumpRevision(data.tableId);

        io.to(data.tableId).emit('initiativeEntryRemoved', {
          tableId: data.tableId,
          sceneId: data.sceneId,
          revision,
          entryId: data.initiativeEntryId,
          order: serializeOrder(initiative),
        });
        if (removedTokenId) {
          io.to(data.tableId).emit('tokenRemoved', { tokenId: removedTokenId, revision });
        }

        const changes: SessionPatchChanges = { initiative: initiative.map(mapInitiativeEntry) };
        if (removedTokenId) changes.tokensRemoved = [removedTokenId];
        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  // Reordena manualmente a lista (apenas Mestre). Mantém flags isCurrentTurn conforme recebido.
  const requestReorderInitiative = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestReorderInitiative',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zReorderInitiativePayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const { scene, table } = await loadSceneContext(data.sceneId);
        assertEntityBelongsToTable(table._id.toString(), data.tableId);
        assertUserIsDM(userId, table);

        const orderForService = data.newOrder as unknown as IInitiativeEntry[];
        const initiative = await reorderInitiative(scene._id.toString(), orderForService);
        const revision = await bumpRevision(data.tableId);

        io.to(data.tableId).emit('initiativeOrderUpdated', {
          tableId: data.tableId,
          sceneId: data.sceneId,
          revision,
          order: serializeOrder(initiative),
          currentTurnId: initiative.find((entry) => entry.isCurrentTurn)?._id?.toString() || null,
        });

        return { tableId: data.tableId, revision, changes: { initiative: initiative.map(mapInitiativeEntry) } };
      },
    });
  };

  // Renomeia uma entrada; reflete também no token (se vinculado). Apenas Mestre.
  const requestEditInitiativeEntry = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestEditInitiativeEntry',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zEditInitiativeEntryPayload, payload);
        const userId = socket.data.user?.id;
        assertCondition(!!userId, 'Usuário não autenticado.', 401);
        const { scene, table, entry } = await loadInitiativeContext(data.sceneId, data.initiativeEntryId);
        assertEntityBelongsToTable(table._id.toString(), data.tableId);
        assertUserIsDM(userId, table);

        const initiative = await editInitiativeEntry(scene._id.toString(), data.initiativeEntryId, data.newName);
        const revision = await bumpRevision(data.tableId);

        const updatedEntry = initiative.find((item) => item._id?.toString() === data.initiativeEntryId);
        io.to(data.tableId).emit('initiativeEntryUpdated', {
          tableId: data.tableId,
          sceneId: data.sceneId,
          revision,
          entryId: data.initiativeEntryId,
          patch: { characterName: updatedEntry?.characterName },
        });

        const changes: SessionPatchChanges = { initiative: initiative.map(mapInitiativeEntry) };
        if (entry.tokenId) {
          changes.tokenUpdates = [{ tokenId: entry.tokenId.toString(), patch: { name: data.newName } }];
        }
        return { tableId: data.tableId, revision, changes };
      },
    });
  };

  socket.on('requestAddCharacterToInitiative', requestAddCharacterToInitiative);
  socket.on('requestNextTurn', requestNextTurn);
  socket.on('requestResetInitiative', requestResetInitiative);
  socket.on('requestRemoveFromInitiative', requestRemoveFromInitiative);
  socket.on('requestReorderInitiative', requestReorderInitiative);
  socket.on('requestEditInitiativeEntry', requestEditInitiativeEntry);
}
