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
import { createLogger } from '../logger';
import { validate } from '../validation/validate';
import {
  zAddInitiativeEntryPayload,
  zRemoveInitiativeEntryPayload,
  zReorderInitiativePayload,
  zNextTurnPayload,
} from '../validation/schemas';
import type {
  AddInitiativeEntryPayload,
  RemoveInitiativeEntryPayload,
  ReorderInitiativePayload,
  NextTurnPayload,
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

function emitTurnState(io: Server, tableId: string, sceneId: string, initiative: IInitiativeEntry[], newRound = false) {
  const current = initiative.find((entry) => entry.isCurrentTurn);
  if (!current?._id) return;
  const currentIndex = initiative.findIndex((entry) => entry._id?.toString() === current._id?.toString());
  const previous = currentIndex === -1
    ? undefined
    : initiative[(currentIndex - 1 + initiative.length) % initiative.length];

  io.to(tableId).emit('initiativeTurnAdvanced', {
    tableId,
    sceneId,
    currentEntryId: current._id.toString(),
    previousEntryId: previous?._id?.toString(),
    currentTokenId: current.tokenId?.toString(),
    newRound,
  });
}

export function registerInitiativeHandlers(io: Server, socket: Socket) {
  const log = createLogger({ scope: 'socket:initiative', socketId: socket.id, userId: socket.data.user?.id });

  // Adiciona token à iniciativa (apenas Mestre). Evita duplicatas do mesmo token.
  const requestAddCharacterToInitiative = async (payload: unknown) => {
    let data: AddInitiativeEntryPayload | undefined;
    try {
        data = validate(zAddInitiativeEntryPayload, payload);
        const { tableId, sceneId, tokenId } = data;
        const userId = socket.data.user?.id;
        const table = await getTableById(tableId);
        if (!table) return;
        assertUserIsDM(userId, table);

        const token = await Token.findById(tokenId);
        if (!token) {
            socket.emit('error', { message: 'Token não encontrado.' });
            return;
        }

        const initiative = await addTokenToInitiative(sceneId, token);

        const createdEntry = initiative.find((entry) => entry.tokenId?.toString() === tokenId);
        if (createdEntry) {
          io.to(tableId).emit('initiativeEntryAdded', {
            tableId,
            sceneId,
            entry: serializeEntry(createdEntry),
            order: serializeOrder(initiative),
          });
        }
    } catch (error) { 
      log.error({ err: error, tableId: data?.tableId, sceneId: data?.sceneId }, 'Erro ao adicionar personagem à iniciativa'); 
    }
  };


  // Avança para o próximo turno. Se voltar ao início da lista: nova rodada -> reseta movimento.
  const requestNextTurn = async (payload: unknown) => {
    let data: NextTurnPayload | undefined;
    try {
        data = validate(zNextTurnPayload, payload);
        const { tableId, sceneId } = data;
        const userId = socket.data.user?.id; 
        
        const { table, scene } = await getSceneAndTable(tableId, sceneId);
        if (!scene || scene.initiative.length === 0) return;

        const result = await advanceTurn(table, scene, userId);

        emitTurnState(io, tableId, sceneId, result.initiative, result.newRound);

        if (result.newRound) {
          const updatedTokens = await Token.find({ sceneId });
          const resets = updatedTokens.map((token) => ({
            tokenId: token._id.toString(),
            remainingMovement: token.remainingMovement,
            movement: token.movement,
          }));
          io.to(tableId).emit('tokensMovementReset', {
            tableId,
            sceneId,
            updates: resets,
          });
        }
        clearEphemeralMeasurements(tableId);
        io.to(tableId).emit('allMeasurementsCleared', { sceneId });
    } catch (error) { 
      log.error({ err: error, tableId: data?.tableId, sceneId: data?.sceneId }, 'Erro ao avançar o turno'); 
    }
  };

  // Remove todas as entradas da iniciativa (apenas Mestre) e limpa medições.
  const requestResetInitiative = async (payload: unknown) => {
    let data: NextTurnPayload | undefined;
    try {
        data = validate(zNextTurnPayload, payload);
        const { tableId, sceneId } = data;
        const userId = socket.data.user?.id;
        const table = await getTableById(tableId);
        if (!table) return;
        
    assertUserIsDM(userId, table);

  const initiative = await resetInitiative(sceneId);

  io.to(tableId).emit('initiativeReset', { tableId, sceneId });
  io.to(tableId).emit('initiativeOrderUpdated', { tableId, sceneId, order: serializeOrder(initiative), currentTurnId: null });
  clearEphemeralMeasurements(tableId);
  io.to(tableId).emit('allMeasurementsCleared', { sceneId });
    } catch (error) { 
      log.error({ err: error, tableId: data?.tableId, sceneId: data?.sceneId }, 'Erro ao resetar a iniciativa'); 
    }
  };

  // Remove entrada específica e deleta token associado (se houver). Apenas Mestre.
  const requestRemoveFromInitiative = async (payload: unknown) => {
    let data: RemoveInitiativeEntryPayload | undefined;
    try {
        data = validate(zRemoveInitiativeEntryPayload, payload);
        const { tableId, sceneId, initiativeEntryId } = data;
        
        const userId = socket.data.user?.id;
        const table = await getTableById(tableId);
        if (!table) return;
  assertUserIsDM(userId, table);

        const { initiative, removedTokenId } = await removeInitiativeEntry(sceneId, initiativeEntryId, true);

        if (initiative) {
          io.to(tableId).emit('initiativeEntryRemoved', {
            tableId,
            sceneId,
            entryId: initiativeEntryId,
            order: serializeOrder(initiative),
          });
          if (removedTokenId) io.to(tableId).emit('tokenRemoved', { tokenId: removedTokenId });
        }
    } catch (error) { 
      log.error({ err: error, tableId: data?.tableId, sceneId: data?.sceneId }, 'Erro ao remover da iniciativa'); 
    }
  };

  // Reordena manualmente a lista (apenas Mestre). Mantém flags isCurrentTurn conforme recebido.
  const requestReorderInitiative = async (payload: unknown) => {
    let data: ReorderInitiativePayload | undefined;
    try {
        data = validate(zReorderInitiativePayload, payload);
        const { tableId, sceneId, newOrder } = data;
        const orderForService = newOrder as unknown as IInitiativeEntry[];
        const userId = socket.data.user?.id;

      const table = await getTableById(tableId);
      if (!table) return;
    assertUserIsDM(userId, table);

      const initiative = await reorderInitiative(sceneId, orderForService);

      if (initiative) {
        socket.to(tableId).emit('initiativeOrderUpdated', {
          tableId,
          sceneId,
          order: serializeOrder(initiative),
          currentTurnId: initiative.find((entry) => entry.isCurrentTurn)?._id?.toString() || null,
        });
      }
    } catch (error) { 
      log.error({ err: error, tableId: data?.tableId, sceneId: data?.sceneId }, 'Erro ao reordenar iniciativa'); 
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

      const updatedEntry = initiative.find((entry) => entry._id?.toString() === initiativeEntryId);
      if (updatedEntry) {
        io.to(tableId).emit('initiativeEntryUpdated', {
          tableId,
          sceneId,
          entryId: initiativeEntryId,
          patch: { characterName: updatedEntry.characterName },
        });
      }
    } catch (error) { 
      log.error({ err: error, tableId: data?.tableId, sceneId: data?.sceneId }, 'Erro ao editar entrada da iniciativa'); 
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