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
  const requestPlaceToken = async (data: { tableId: string, sceneId: string, squareId: string; name: string; imageUrl?: string; movement?: number; remainingMovement?: number; ownerId?: string; size: string; canOverlap?: boolean; characterId?: string | null }) => {
    try {
        const userId = socket.data.user?.id; 
        if (!userId) return;

        const { tableId } = data;
        if (!data.sceneId) return socket.emit('tokenPlacementError', { message: 'ID da cena não fornecido.' });

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
  const requestMoveToken = async (data: { tableId: string, tokenId: string; targetSquareId: string }) => {
    try {
        const userId = socket.data.user?.id;
        if (!userId) return;
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
  const requestAssignToken = async (data: { tableId: string; tokenId: string; newOwnerId: string }) => {
    try {
        const userId = socket.data.user?.id;
        if (!userId) return;
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
  const requestEditToken = async (data: { tableId: string; tokenId: string; name?: string; movement?: number; imageUrl?: string; ownerId?: string; size?: string; resetRemainingMovement?: boolean; canOverlap?: boolean; characterId?: string | null }) => {
    try {
      const userId = socket.data.user?.id;
      if (!userId) return;
      const { tableId } = data;
      const result = await editTokenForTable(userId, data);
      if (!result?.updated) return;
      const { updated, initiative } = result;
      const patch: Record<string, unknown> = {};
      if (typeof data.name === 'string') patch.name = updated.name;
      if (typeof data.movement === 'number') {
        patch.movement = updated.movement;
        patch.remainingMovement = updated.remainingMovement;
      }
      if (typeof data.imageUrl === 'string') patch.imageUrl = updated.imageUrl;
      if (typeof data.ownerId === 'string') patch.ownerId = updated.ownerId;
      if (typeof data.size === 'string') patch.size = updated.size;
      if (typeof data.canOverlap === 'boolean') patch.canOverlap = updated.canOverlap;
      if (data.characterId !== undefined) patch.characterId = updated.characterId?.toString() || null;
      if (data.resetRemainingMovement) patch.remainingMovement = updated.remainingMovement;

      io.to(tableId).emit('tokenUpdated', {
        tableId,
        sceneId: updated.sceneId?.toString() || '',
        tokenId: updated._id.toString(),
        patch,
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
  const requestUndoMove = async (data: { tableId: string, tokenId: string }) => {
    try {
      const userId = socket.data.user?.id;
      if (!userId) return;
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