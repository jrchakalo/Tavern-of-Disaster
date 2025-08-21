import { Server, Socket } from 'socket.io';
import Token from '../models/Token.model';
import Scene from '../models/Scene.model';
import Table from '../models/Table.model';
import User from '../models/User.model';

export function registerTokenHandlers(io: Server, socket: Socket) {

  const requestPlaceToken = async (data: { tableId: string, sceneId: string, squareId: string; name: string; imageUrl?: string; movement: number; remainingMovement?: number; ownerId?: string, size: string }) => {
    try {
        const userId = socket.data.user?.id; 
        if (!userId) return;

        const { tableId, sceneId, squareId, name, imageUrl, movement, remainingMovement, ownerId, size } = data;

        const requesterId = socket.data.user?.id; 
        if (!requesterId) return;

        if (!sceneId) {
        socket.emit('tokenPlacementError', { message: 'ID da cena não fornecido.' });
        return;
        }

        // Verifica se já existe um token nesse quadrado
        const existingToken = await Token.findOne({ sceneId: sceneId, squareId: squareId });
        if (existingToken) {
        socket.emit('tokenPlacementError', { message: 'Este quadrado já está ocupado nesta cena.' });
        return;
        }

        const tokenColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;

        const newToken = new Token({
        tableId,
        sceneId, 
        squareId,
        color: tokenColor,
        ownerId: ownerId || requesterId,
        name,
        imageUrl,
        movement: data.movement || 9, 
        remainingMovement: data.remainingMovement || 9,
        size: data.size || 'Pequeno/Médio',
        });

        await newToken.save();
        // Após salvar o token, também o adicionamos à iniciativa da cena
        const newEntry = { 
        characterName: newToken.name,
        tokenId: newToken._id,
        isCurrentTurn: false 
        };

        const updatedScene = await Scene.findByIdAndUpdate(
        data.sceneId,
        { $push: { initiative: newEntry } },
        { new: true }
        );

        const populatedToken = await newToken.populate('ownerId', '_id username');
        io.to(data.tableId).emit('tokenPlaced', populatedToken); 
        if (updatedScene) {
        io.to(data.tableId).emit('initiativeUpdated', updatedScene.initiative);
        }
    } catch (error: any) {
        console.error('Erro ao processar requestPlaceToken:', error.message);
        socket.emit('tokenPlacementError', { message: 'Erro ao colocar o token.' });
    }
  };

  const requestMoveToken = async (data: { tableId: string, tokenId: string; targetSquareId: string }) => {
    console.log(`Recebido 'requestMoveToken' de ${socket.id}:`, data);
    try {
        const userId = socket.data.user?.id;
        if (!userId) return;

        const { tableId, tokenId, targetSquareId } = data;

        if (!tokenId || !targetSquareId) {
        socket.emit('tokenMoveError', { message: 'Dados inválidos para mover token.' });
        return;
        }

        // Verifica se o quadrado de destino já está ocupado por OUTRO token
        const occupyingToken = await Token.findOne({ tableId: tableId, squareId: targetSquareId });
        if (occupyingToken && occupyingToken._id.toString() !== tokenId) {
        console.log(`Tentativa de mover token para quadrado ${targetSquareId} já ocupado por ${occupyingToken._id}`);
        socket.emit('tokenMoveError', { message: 'Quadrado de destino já está ocupado.' });
        return;
        }

        // Encontra o token a ser movido
        const tokenToMove = await Token.findById(tokenId);
        if (!tokenToMove) {
        console.log(`Token com ID ${tokenId} não encontrado para mover.`);
        socket.emit('tokenMoveError', { message: 'Token não encontrado.' });
        return;
        }

        const table = await Table.findById(tableId);
        if (!table) return;

        const isDM = table.dm.toString() === userId;
        const isOwner = tokenToMove.ownerId.toString() === userId;

        if (!isDM && !isOwner) { // Se o usuário não for NEM o mestre E NEM o dono
        console.log(`[AUTH] Falha: Usuário ${userId} tentou mover token ${tokenId} sem permissão.`);
        socket.emit('tokenMoveError', { message: 'Você não tem permissão para mover este token.' });
        return;
        }

        const scene = await Scene.findById(tokenToMove.sceneId);
        if (!scene){
        console.log(`Cena com ID ${tokenToMove.sceneId} não encontrada para mover o token.`);
        socket.emit('tokenMoveError', { message: 'Cena não encontrada.' });
        return;
        }

        if (scene) {
            const entryInInitiative = scene.initiative.find(entry => entry.tokenId?.toString() === tokenToMove._id.toString());
            if (entryInInitiative && !entryInInitiative.isCurrentTurn) {
                // Apenas Mestres podem mover fora do turno.
                const table = await Table.findById(tableId);
                if(table?.dm.toString() !== userId) { // Se quem está movendo não é o mestre
                    console.log(`Usuário ${userId} tentou mover token ${tokenId} fora do seu turno.`);
                    socket.emit('tokenMoveError', { message: 'Você só pode mover no seu turno.' });
                    return;
                }
            }
        }

        const oldSquareId = tokenToMove.squareId; // Guarda o squareId antigo
        if (oldSquareId === targetSquareId) return;

        const gridSize = scene.gridSize ?? 30; // Pega o tamanho do grid da cena, padrão 30x30 se indefinido

        const getCoords = (sqId: string) => {
        const index = parseInt(sqId.replace('sq-', ''));
        return { x: index % gridSize, y: Math.floor(index / gridSize) };
        };

        const oldCoords = getCoords(tokenToMove.squareId);
        const newCoords = getCoords(targetSquareId);

        // Calcula a distância em quadrados (método Chebyshev, comum em D&D 5e e outros jogos de tabuleiro)
        const distanceInSquares = Math.max(Math.abs(newCoords.x - oldCoords.x), Math.abs(newCoords.y - oldCoords.y));
        const movementCost = distanceInSquares * 1.5; // Custo em metros

        if (tokenToMove.remainingMovement < movementCost) {
        socket.emit('tokenMoveError', { message: 'Movimento insuficiente.' });
        return;
        }

        tokenToMove.moveHistory.push(tokenToMove.squareId);
        tokenToMove.squareId = data.targetSquareId;
        tokenToMove.remainingMovement -= movementCost;
        await tokenToMove.save();

        console.log(`Token ${tokenId} movido de ${oldSquareId} para ${targetSquareId}`);
        const populatedToken = await tokenToMove.populate('ownerId', '_id username');
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
        socket.emit('tokenMoveError', { message: 'Erro interno ao mover o token.' });
    }
  };

  const requestAssignToken = async (data: { tableId: string; tokenId: string; newOwnerId: string }) => {
    try {
        const { tableId, tokenId, newOwnerId } = data;

        const userId = socket.data.user?.id;
        const table = await Table.findById(tableId);
        if (!table) return;
        if (table.dm.toString() !== userId) {
            console.log(`[AUTH] Falha: Usuário ${userId} tentou atribuir token da mesa ${tableId}, mas não é o mestre.`);
            return socket.emit('error', { message: 'Apenas o Mestre pode atribuir tokens.' });
        }

        const updatedToken = await Token.findByIdAndUpdate(
            data.tokenId,
            { ownerId: data.newOwnerId },
            { new: true }
        );

        if (updatedToken) {
            io.to(data.tableId).emit('tokenOwnerUpdated', { 
                tokenId: updatedToken._id.toString(), 
                newOwner: await User.findById(updatedToken.ownerId, 'username _id') // Envia os dados do novo dono
            });
        }
    } catch (error) { 
        console.error("Erro ao atribuir token:", error); 
    }
  };

  const requestUndoMove = async (data: { tableId: string, tokenId: string }) => {
    try {
      const { tableId, tokenId } = data;
      const userId = socket.data.user?.id;
      
      const table = await Table.findById(tableId);
      if (!table) return;

      const tokenToUndo = await Token.findById(tokenId);
      if (!tokenToUndo || tokenToUndo.moveHistory.length === 0) return;

      // Validação de permissão
      const isDM = table.dm.toString() === userId;
      const isOwner = tokenToUndo.ownerId.toString() === userId;
      if (!isDM && !isOwner) return;

      const currentPosition = tokenToUndo.squareId;
      const previousPosition = tokenToUndo.moveHistory.pop()!; 

      // Recalcula o custo para restaurar o movimento
      const scene = await Scene.findById(tokenToUndo.sceneId);
      if (!scene) return;

      const getCoords = (sqId: string) => {
        const index = parseInt(sqId.replace('sq-', ''));
        const gridSize = scene.gridSize ?? 30;
        return { x: index % gridSize, y: Math.floor(index / gridSize) };
      };

      const distance = Math.max(Math.abs(getCoords(currentPosition).x - getCoords(previousPosition).x), Math.abs(getCoords(currentPosition).y - getCoords(previousPosition).y));
      const movementCost = distance * 1.5;

      tokenToUndo.squareId = previousPosition;
      tokenToUndo.remainingMovement += movementCost;
      const savedToken = await tokenToUndo.save();

      // Emite o mesmo evento 'tokenMoved'
      const populatedTokenToUndo = await savedToken.populate('ownerId', '_id username');
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
}