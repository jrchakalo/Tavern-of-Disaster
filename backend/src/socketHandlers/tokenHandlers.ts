import { Server, Socket } from 'socket.io';
import {
  placeTokenForTable,
  PlaceTokenPayload,
  moveTokenForUser,
  assignTokenOwnerForTable,
  editTokenForTable,
  undoTokenMoveForUser,
} from '../services/tokenSocketService';
import { ServiceError } from '../services/serviceErrors';
import { IInitiativeEntry } from '../models/Scene.model';
import { createLogger } from '../logger';
import { recordTokenMove, recordTokenMoveError } from '../metrics';
import { validate } from '../validation/validate';
import {
  zPlaceTokenPayload,
  zMoveTokenPayload,
  zAssignTokenPayload,
  zEditTokenPayload,
  zUndoMovePayload,
} from '../validation/schemas';
import type {
  PlaceTokenPayloadInput,
  MoveTokenPayload,
  AssignTokenPayload,
  EditTokenPayload,
  UndoMovePayload,
} from '../validation/schemas';

function toInitiativeEntryDTO(entry: IInitiativeEntry) {
  return {
    _id: entry._id?.toString() || '',
    characterName: entry.characterName,
    tokenId: entry.tokenId ? entry.tokenId.toString() : undefined,
    characterId: entry.characterId ? entry.characterId.toString() : undefined,
    isCurrentTurn: !!entry.isCurrentTurn,
  };
}

function emitInitiativeNamePatch(io: Server, tableId: string, sceneId: string | undefined, entry: IInitiativeEntry | undefined) {
  if (!sceneId || !entry?._id) return;
  io.to(tableId).emit('initiativeEntryUpdated', {
    tableId,
    sceneId,
    entryId: entry._id.toString(),
    patch: { characterName: entry.characterName },
  });
}

export function registerTokenHandlers(io: Server, socket: Socket) {
  const log = createLogger({ scope: 'socket:token', socketId: socket.id, userId: socket.data.user?.id });

  const emitError = (event: string, error: unknown, fallback: string) => {
    const message = error instanceof ServiceError ? error.message : fallback;
    socket.emit(event, { message });
  };

  // Coloca um novo token no grid + adiciona entrada na iniciativa. Valida footprint e ocupação.
  const requestPlaceToken = async (payload: unknown) => {
    let data: PlaceTokenPayloadInput | undefined;
    try {
        const userId = socket.data.user?.id; 
        if (!userId) return;
        data = validate(zPlaceTokenPayload, payload);
        const { tableId } = data;
        const result = await placeTokenForTable(userId, data as PlaceTokenPayload);
        io.to(tableId).emit('tokenPlaced', result.token);
        if (result.initiative) {
          const createdEntry = result.initiative.find((entry) => entry.tokenId?.toString() === result.token._id.toString());
          if (createdEntry) {
            io.to(tableId).emit('initiativeEntryAdded', {
              tableId,
              sceneId: data.sceneId,
              entry: toInitiativeEntryDTO(createdEntry),
              order: result.initiative.map((entry) => entry._id?.toString()).filter(Boolean),
            });
          }
        }
    } catch (error: any) {
      log.error({ err: error, tableId: data?.tableId }, 'Erro ao processar requestPlaceToken');
      emitError('tokenPlacementError', error, 'Erro ao colocar o token.');
    }
  };

  // Move token validando turno (jogador só move no seu turno) + movimento restante + footprint.
  const requestMoveToken = async (payload: unknown) => {
    let data: MoveTokenPayload | undefined;
    try {
        const userId = socket.data.user?.id;
        if (!userId) return;
        data = validate(zMoveTokenPayload, payload);
        const { tableId } = data;
        const { updated, oldSquareId } = await moveTokenForUser(userId, data);
        if (!oldSquareId) return;
      recordTokenMove();
        io.to(tableId).emit('tokenMoved', {
          tableId,
          sceneId: updated.sceneId ? updated.sceneId.toString() : '',
          tokenId: updated._id.toString(),
          oldSquareId,
          squareId: updated.squareId,
          remainingMovement: updated.remainingMovement,
          movement: updated.movement,
        });
    } catch (error: any) {
        log.error({ err: error, tableId: data?.tableId }, 'Erro ao processar requestMoveToken');
      recordTokenMoveError();
      emitError('tokenMoveError', error, 'Erro interno ao mover o token.');
    }
  };

  // Atribui novo dono a um token (apenas Mestre) para permitir controle ao jogador.
  const requestAssignToken = async (payload: unknown) => {
    let data: AssignTokenPayload | undefined;
    try {
        const userId = socket.data.user?.id;
        if (!userId) return;
        data = validate(zAssignTokenPayload, payload);
        const { tableId } = data;
        const updatedToken = await assignTokenOwnerForTable(userId, data);

        if (updatedToken) {
          io.to(tableId).emit('tokenOwnerUpdated', { 
            tokenId: updatedToken._id.toString(), 
            newOwner: updatedToken.ownerId
          });
        }
    } catch (error) { 
      log.error({ err: error, tableId: data?.tableId }, 'Erro ao atribuir token'); 
    }
  };

  // Edita atributos do token (apenas Mestre). Se nome muda, reflete na iniciativa.
  const requestEditToken = async (payload: unknown) => {
    let data: EditTokenPayload | undefined;
    try {
      const userId = socket.data.user?.id;
      if (!userId) return;
      data = validate(zEditTokenPayload, payload);
      const { tableId, tokenId, patch } = data;
      const result = await editTokenForTable(userId, { tableId, tokenId, ...patch });
      if (!result?.updated) return;
      const { updated, initiative } = result;
      const patchPayload: Record<string, unknown> = {};
      if (typeof patch.name === 'string') patchPayload.name = updated.name;
      if (typeof patch.movement === 'number') {
        patchPayload.movement = updated.movement;
        patchPayload.remainingMovement = updated.remainingMovement;
      }
      if (typeof patch.imageUrl === 'string') patchPayload.imageUrl = updated.imageUrl;
      if (typeof patch.ownerId === 'string') patchPayload.ownerId = updated.ownerId;
      if (typeof patch.size === 'string') patchPayload.size = updated.size;
      if (typeof patch.canOverlap === 'boolean') patchPayload.canOverlap = updated.canOverlap;
      if (patch.characterId !== undefined) patchPayload.characterId = updated.characterId?.toString() || null;
      if (patch.resetRemainingMovement) patchPayload.remainingMovement = updated.remainingMovement;

      io.to(tableId).emit('tokenUpdated', {
        tableId,
        sceneId: updated.sceneId?.toString() || '',
        tokenId: updated._id.toString(),
        patch: patchPayload,
      });

      if (initiative) {
        const changedEntry = initiative.find((entry) => entry.tokenId?.toString() === updated._id.toString());
        emitInitiativeNamePatch(io, tableId, updated.sceneId?.toString(), changedEntry);
      }
    } catch (error) {
      log.error({ err: error, tableId: data?.tableId }, 'Erro ao editar token');
    }
  };

  // Desfaz último movimento restaurando custo de deslocamento. Permite apenas Mestre ou dono.
  const requestUndoMove = async (payload: unknown) => {
    let data: UndoMovePayload | undefined;
    try {
      const userId = socket.data.user?.id;
      if (!userId) return;
      data = validate(zUndoMovePayload, payload);
      const { tableId } = data;
      const result = await undoTokenMoveForUser(userId, data);
      if (!result) return;
      const { updated, previousSquare } = result;
      io.to(tableId).emit('tokenMoved', {
        tableId,
        sceneId: updated.sceneId ? updated.sceneId.toString() : '',
        tokenId: updated._id.toString(),
        oldSquareId: previousSquare,
        squareId: updated.squareId,
        remainingMovement: updated.remainingMovement,
        movement: updated.movement,
      });

      recordTokenMove();
    } catch (error) { 
      log.error({ err: error, tableId: data?.tableId }, 'Erro ao desfazer movimento'); 
    }
  };

  socket.on('requestPlaceToken', requestPlaceToken);
  socket.on('requestMoveToken', requestMoveToken);
  socket.on('requestAssignToken', requestAssignToken);
  socket.on('requestUndoMove', requestUndoMove);
  socket.on('requestEditToken', requestEditToken);
}