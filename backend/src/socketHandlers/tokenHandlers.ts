import { Server, Socket } from 'socket.io';
import Token from '../models/Token.model';
import Scene from '../models/Scene.model';
import {
  createToken,
  moveToken as moveTokenService,
  undoLastMove as undoLastMoveService,
  updateToken as updateTokenService,
  TokenUpdatePayload,
} from '../services/tokenService';
import { addTokenToInitiative, syncInitiativeNameWithToken } from '../services/initiativeService';
import { getTableById, assertUserIsDM } from '../services/tableService';
import { ServiceError } from '../services/serviceErrors';

export function registerTokenHandlers(io: Server, socket: Socket) {

  const emitError = (event: string, error: unknown, fallback: string) => {
    const message = error instanceof ServiceError ? error.message : fallback;
    socket.emit(event, { message });
  };

  // Coloca um novo token no grid + adiciona entrada na iniciativa. Valida footprint e ocupação.
  const requestPlaceToken = async (data: { tableId: string, sceneId: string, squareId: string; name: string; imageUrl?: string; movement: number; remainingMovement?: number; ownerId?: string; size: string; canOverlap?: boolean }) => {
    try {
        const userId = socket.data.user?.id; 
        if (!userId) return;

        const { tableId, sceneId, squareId, name, imageUrl, movement, remainingMovement, ownerId, size, canOverlap } = data;
        if (!sceneId) return socket.emit('tokenPlacementError', { message: 'ID da cena não fornecido.' });

        const createdToken = await createToken({
            tableId,
            sceneId,
            squareId,
            name,
            imageUrl,
            movement,
            remainingMovement,
            ownerId: ownerId || userId,
            size: size || 'Pequeno/Médio',
            canOverlap: !!canOverlap,
        });

        const updatedInitiative = await addTokenToInitiative(sceneId, createdToken as any);
        io.to(tableId).emit('tokenPlaced', createdToken);
        if (updatedInitiative) {
            io.to(tableId).emit('initiativeUpdated', updatedInitiative);
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

        const { tableId, tokenId, targetSquareId } = data;

  if (!tokenId || !targetSquareId) return socket.emit('tokenMoveError', { message: 'Dados inválidos para mover token.' });

        // Encontra o token a ser movido
        const tokenToMove = await Token.findById(tokenId);
  if (!tokenToMove) return socket.emit('tokenMoveError', { message: 'Token não encontrado.' });

          const table = await getTableById(tableId);
        if (!table) return;

        const isDM = table.dm.toString() === userId;
        const isOwner = tokenToMove.ownerId.toString() === userId;

  if (!isDM && !isOwner) return socket.emit('tokenMoveError', { message: 'Você não tem permissão para mover este token.' });

        const scene = await Scene.findById(tokenToMove.sceneId);
  if (!scene) return socket.emit('tokenMoveError', { message: 'Cena não encontrada.' });

  // Validação de limites destino
  const gridWidth = (scene as any).gridWidth ?? 30;
  const gridHeight = (scene as any).gridHeight ?? 30;
  const maxIndex = gridWidth * gridHeight - 1;
        const numericTarget = parseInt(targetSquareId.replace('sq-', ''));
        if (isNaN(numericTarget) || numericTarget < 0 || numericTarget > maxIndex) return socket.emit('tokenMoveError', { message: 'Destino fora dos limites do grid.' });

        if (scene) {
          const currentTurnEntry = scene.initiative.find(entry => entry.isCurrentTurn);
          if (!isDM && (!currentTurnEntry || currentTurnEntry.tokenId?.toString() !== tokenToMove._id.toString())) {
            return socket.emit('tokenMoveError', { message: 'Você só pode mover no seu turno.' });
          }
        }

        const oldSquareId = tokenToMove.squareId;
        if (oldSquareId === targetSquareId) return;

        const populatedToken = await moveTokenService(tokenToMove as any, targetSquareId, scene, tokenToMove.canOverlap);
        // Notifica todos os clientes sobre o movimento do token
        io.to(tableId).emit('tokenMoved', {
        _id: populatedToken._id.toString(), // Garante que é string
        oldSquareId: oldSquareId,
        squareId: populatedToken.squareId, // Novo squareId
        color: populatedToken.color,
        ownerId: populatedToken.ownerId,
        name: populatedToken.name,
        imageUrl: populatedToken.imageUrl,
        sceneId: populatedToken.sceneId ? populatedToken.sceneId.toString() : "",
        movement: tokenToMove.movement,
        remainingMovement: tokenToMove.remainingMovement,
        size: tokenToMove.size,
        });
    } catch (error: any) {
        console.error('Erro ao processar requestMoveToken:', error.message);
      emitError('tokenMoveError', error, 'Erro interno ao mover o token.');
    }
  };

  // Atribui novo dono a um token (apenas Mestre) para permitir controle ao jogador.
  const requestAssignToken = async (data: { tableId: string; tokenId: string; newOwnerId: string }) => {
    try {
        const { tableId, tokenId, newOwnerId } = data;

        const userId = socket.data.user?.id;
        const table = await getTableById(tableId);
        if (!table) return;
      assertUserIsDM(userId, table);

        const updatedToken = await updateTokenService(
          tokenId,
          { ownerId: newOwnerId } as TokenUpdatePayload
        );

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
  const requestEditToken = async (data: { tableId: string; tokenId: string; name?: string; movement?: number; imageUrl?: string; ownerId?: string; size?: string; resetRemainingMovement?: boolean; canOverlap?: boolean }) => {
    try {
      const { tableId, tokenId } = data;
      const userId = socket.data.user?.id;
      if (!userId) return;
      const table = await getTableById(tableId);
      if (!table) return;
      assertUserIsDM(userId, table);
      const token = await Token.findById(tokenId);
      if (!token) return;
      const updates: TokenUpdatePayload = {};
      if (typeof data.name === 'string' && data.name.trim()) updates.name = data.name.trim();
      if (typeof data.movement === 'number' && data.movement > 0) updates.movement = data.movement;
      if (typeof data.imageUrl === 'string') updates.imageUrl = data.imageUrl.trim();
      if (typeof data.ownerId === 'string' && data.ownerId) updates.ownerId = data.ownerId;
      if (typeof data.size === 'string' && data.size) updates.size = data.size;
      if (typeof data.canOverlap === 'boolean') updates.canOverlap = data.canOverlap;

      const updated = await updateTokenService(tokenId, updates, { resetRemainingMovement: !!data.resetRemainingMovement });

      if (updates.name && updated?.sceneId) {
        const initiative = await syncInitiativeNameWithToken(updated.sceneId.toString(), updated._id.toString(), updated.name);
        if (initiative) {
          io.to(tableId).emit('initiativeUpdated', initiative);
        }
      }

      io.to(tableId).emit('tokenUpdated', {
        _id: updated?._id.toString(),
        squareId: updated?.squareId,
        color: updated?.color,
        ownerId: updated?.ownerId,
        name: updated?.name,
        imageUrl: updated?.imageUrl,
        tableId: updated?.tableId?.toString(),
        sceneId: updated?.sceneId?.toString(),
        movement: updated?.movement,
        remainingMovement: updated?.remainingMovement,
        size: updated?.size,
      });
    } catch (error) {
      console.error('Erro ao editar token:', error);
    }
  };

  // Desfaz último movimento restaurando custo de deslocamento. Permite apenas Mestre ou dono.
  const requestUndoMove = async (data: { tableId: string, tokenId: string }) => {
    try {
      const { tableId, tokenId } = data;
      const userId = socket.data.user?.id;
      
      const table = await getTableById(tableId);
      if (!table) return;

      const tokenToUndo = await Token.findById(tokenId);
      if (!tokenToUndo || tokenToUndo.moveHistory.length === 0) return;

      // Validação de permissão
      const isDM = table.dm.toString() === userId;
      const isOwner = tokenToUndo.ownerId.toString() === userId;
  if (!isDM && !isOwner) return; // Silencioso: sem permissão

      const currentPosition = tokenToUndo.squareId;
      const previousPosition = tokenToUndo.moveHistory.pop()!; 

      // Recalcula o custo para restaurar o movimento
      const scene = await Scene.findById(tokenToUndo.sceneId);
      if (!scene) return;
      const populatedTokenToUndo = await undoLastMoveService(tokenToUndo as any, scene);
      io.to(tableId).emit('tokenMoved', {
        _id: populatedTokenToUndo._id.toString(),
        oldSquareId: currentPosition,
        squareId: populatedTokenToUndo.squareId,
        color: populatedTokenToUndo.color,
        ownerId: populatedTokenToUndo.ownerId,
        name: populatedTokenToUndo.name,
        imageUrl: populatedTokenToUndo.imageUrl,
        sceneId: populatedTokenToUndo.sceneId ? populatedTokenToUndo.sceneId.toString() : "",
        movement: populatedTokenToUndo.movement,
        remainingMovement: populatedTokenToUndo.remainingMovement,
        savedToken: populatedTokenToUndo,
        size: populatedTokenToUndo.size,
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