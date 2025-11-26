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

export function registerTokenHandlers(io: Server, socket: Socket) {

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
            io.to(tableId).emit('initiativeUpdated', result.initiative);
        }
    } catch (error: any) {
        console.error('Erro ao processar requestPlaceToken:', error.message);
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
        io.to(tableId).emit('tokenMoved', {
          _id: updated._id.toString(),
          oldSquareId,
          squareId: updated.squareId,
          color: updated.color,
          ownerId: updated.ownerId,
          name: updated.name,
          imageUrl: updated.imageUrl,
          sceneId: updated.sceneId ? updated.sceneId.toString() : '',
          movement: updated.movement,
          remainingMovement: updated.remainingMovement,
          size: updated.size,
          characterId: updated.characterId?.toString() || null,
        });
    } catch (error: any) {
        console.error('Erro ao processar requestMoveToken:', error.message);
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
        console.error("Erro ao atribuir token:", error); 
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
      if (initiative) {
        io.to(tableId).emit('initiativeUpdated', initiative);
      }
      io.to(tableId).emit('tokenUpdated', {
        _id: updated._id.toString(),
        squareId: updated.squareId,
        color: updated.color,
        ownerId: updated.ownerId,
        name: updated.name,
        imageUrl: updated.imageUrl,
        tableId: updated.tableId?.toString(),
        sceneId: updated.sceneId?.toString(),
        movement: updated.movement,
        remainingMovement: updated.remainingMovement,
        size: updated.size,
        characterId: updated.characterId?.toString() || null,
      });
    } catch (error) {
      console.error('Erro ao editar token:', error);
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
        _id: updated._id.toString(),
        oldSquareId: previousSquare,
        squareId: updated.squareId,
        color: updated.color,
        ownerId: updated.ownerId,
        name: updated.name,
        imageUrl: updated.imageUrl,
        sceneId: updated.sceneId ? updated.sceneId.toString() : "",
        movement: updated.movement,
        remainingMovement: updated.remainingMovement,
        savedToken: updated,
        size: updated.size,
        characterId: updated.characterId?.toString() || null,
      });

    } catch (error) { 
      console.error("Erro ao desfazer movimento:", error); 
    }
  };

  socket.on('requestPlaceToken', requestPlaceToken);
  socket.on('requestMoveToken', requestMoveToken);
  socket.on('requestAssignToken', requestAssignToken);
  socket.on('requestUndoMove', requestUndoMove);
  socket.on('requestEditToken', requestEditToken);
}