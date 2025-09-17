import { Server, Socket } from 'socket.io';
import Token from '../models/Token.model';
import Scene from '../models/Scene.model';
import Table from '../models/Table.model';
import User from '../models/User.model';

export function registerTokenHandlers(io: Server, socket: Socket) {

  const requestPlaceToken = async (data: { tableId: string, sceneId: string, squareId: string; name: string; imageUrl?: string; movement: number; remainingMovement?: number; ownerId?: string; size: string; canOverlap?: boolean }) => {
    try {
        const userId = socket.data.user?.id; 
        if (!userId) return;

  const { tableId, sceneId, squareId, name, imageUrl, movement, remainingMovement, ownerId, size, canOverlap } = data;

        const requesterId = socket.data.user?.id; 
        if (!requesterId) return;

        if (!sceneId) {
        socket.emit('tokenPlacementError', { message: 'ID da cena não fornecido.' });
        return;
        }

        // Carrega cena para validar limites
        const scene = await Scene.findById(sceneId);
        if (!scene) {
          socket.emit('tokenPlacementError', { message: 'Cena não encontrada.' });
          return;
        }
        const gridWidth = (scene as any).gridWidth ?? 30;
        const gridHeight = (scene as any).gridHeight ?? 30;
        const maxIndex = gridWidth * gridHeight - 1;
        const numericIndex = parseInt(squareId.replace('sq-', ''));
        if (isNaN(numericIndex) || numericIndex < 0 || numericIndex > maxIndex) {
          socket.emit('tokenPlacementError', { message: 'Quadrado fora dos limites da grade.' });
          return;
        }

        // Função util para converter squareId em coords
        const getCoords = (sqId: string) => {
          const index = parseInt(sqId.replace('sq-', ''));
          return { x: index % gridWidth, y: Math.floor(index / gridWidth) };
        };
        const anchor = getCoords(squareId);
        const sizeMap: Record<string, number> = { 'Pequeno/Médio': 1, 'Grande': 2, 'Enorme': 3, 'Descomunal': 4, 'Colossal': 5 };
        const footprintSize = sizeMap[size] || 1;
        const footprintSquares: string[] = [];
        for (let dy = 0; dy < footprintSize; dy++) {
          for (let dx = 0; dx < footprintSize; dx++) {
            const nx = anchor.x + dx;
            const ny = anchor.y + dy;
            if (nx >= gridWidth || ny >= gridHeight) {
              socket.emit('tokenPlacementError', { message: 'Token não cabe dentro do grid.' });
              return;
            }
            const idx = ny * gridWidth + nx;
            footprintSquares.push(`sq-${idx}`);
          }
        }
        // Verifica ocupação em qualquer square da área
        const occupying = await Token.find({ sceneId: sceneId, squareId: { $in: footprintSquares } });
        if (occupying.length > 0 && !canOverlap) {
          socket.emit('tokenPlacementError', { message: 'Área ocupada por outro token.' });
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
  remainingMovement: data.remainingMovement || data.movement || 9, // restante inicial igual ao movimento base
        size: data.size || 'Pequeno/Médio',
    canOverlap: !!canOverlap,
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

  // Validação de limites destino
  const gridWidth = (scene as any).gridWidth ?? 30;
  const gridHeight = (scene as any).gridHeight ?? 30;
  const maxIndex = gridWidth * gridHeight - 1;
        const numericTarget = parseInt(targetSquareId.replace('sq-', ''));
        if (isNaN(numericTarget) || numericTarget < 0 || numericTarget > maxIndex) {
          socket.emit('tokenMoveError', { message: 'Destino fora dos limites do grid.' });
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

  // (gridWidth/gridHeight já definidos acima)

        const getCoords = (sqId: string) => {
          const index = parseInt(sqId.replace('sq-', ''));
          return { x: index % gridWidth, y: Math.floor(index / gridWidth) };
        };

        const oldCoords = getCoords(tokenToMove.squareId);
        const newCoords = getCoords(targetSquareId);

        // Footprint validation for larger tokens
        const sizeMap: Record<string, number> = { 'Pequeno/Médio': 1, 'Grande': 2, 'Enorme': 3, 'Descomunal': 4, 'Colossal': 5 };
        const footprintSize = sizeMap[tokenToMove.size] || 1;
        if (footprintSize > 1) {
          // Build new footprint square ids
          const newFootprint: string[] = [];
          for (let dy = 0; dy < footprintSize; dy++) {
            for (let dx = 0; dx < footprintSize; dx++) {
              const nx = newCoords.x + dx;
              const ny = newCoords.y + dy;
              if (nx >= gridWidth || ny >= gridHeight) {
                socket.emit('tokenMoveError', { message: 'Token não cabe no destino.' });
                return;
              }
              newFootprint.push(`sq-${ny * gridWidth + nx}`);
            }
          }
          // Current footprint squares (to allow moving within overlapping area)
          const currentFootprint: Set<string> = new Set();
          for (let dy = 0; dy < footprintSize; dy++) {
            for (let dx = 0; dx < footprintSize; dx++) {
              const cx = oldCoords.x + dx; const cy = oldCoords.y + dy;
              if (cx >= 0 && cy >= 0 && cx < gridWidth && cy < gridHeight) {
                currentFootprint.add(`sq-${cy * gridWidth + cx}`);
              }
            }
          }
          // Query any tokens occupying any square in new footprint (excluding self footprint squares)
          const occupying = await Token.find({ sceneId: tokenToMove.sceneId, squareId: { $in: newFootprint } });
          const blocking = occupying.filter(t => t._id.toString() !== tokenToMove._id.toString() && !currentFootprint.has(t.squareId));
          if (blocking.length > 0 && !tokenToMove.canOverlap) {
            socket.emit('tokenMoveError', { message: 'Destino ocupado por outro token.' });
            return;
          }
        }

        // Calcula a distância em quadrados (método Chebyshev, comum em D&D 5e e outros jogos de tabuleiro)
  const distanceInSquares = Math.max(Math.abs(newCoords.x - oldCoords.x), Math.abs(newCoords.y - oldCoords.y));
  const metersPerSquare = (scene as any).metersPerSquare ?? 1.5;
  const movementCost = distanceInSquares * metersPerSquare; // Custo em metros baseado na escala da cena

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

  const requestEditToken = async (data: { tableId: string; tokenId: string; name?: string; movement?: number; imageUrl?: string; ownerId?: string; size?: string; resetRemainingMovement?: boolean; canOverlap?: boolean }) => {
    try {
      const { tableId, tokenId } = data;
      const userId = socket.data.user?.id;
      if (!userId) return;
      const table = await Table.findById(tableId);
      if (!table) return;
      const isDM = table.dm.toString() === userId;
      if (!isDM) {
        console.log(`[AUTH] Falha: Usuário ${userId} tentou editar token ${tokenId} sem ser Mestre.`);
        return socket.emit('error', { message: 'Apenas o Mestre pode editar tokens.' });
      }
      const token = await Token.findById(tokenId);
      if (!token) return;
      let initiativeNeedsUpdate = false;
      if (typeof data.name === 'string' && data.name.trim()) {
        token.name = data.name.trim();
        initiativeNeedsUpdate = true;
      }
      if (typeof data.movement === 'number' && data.movement > 0) {
        token.movement = data.movement;
        if (data.resetRemainingMovement) {
          token.remainingMovement = data.movement;
        } else if (token.remainingMovement > token.movement) {
          token.remainingMovement = token.movement; // cap
        }
      }
      if (typeof data.imageUrl === 'string') {
        token.imageUrl = data.imageUrl.trim();
      }
      if (typeof data.ownerId === 'string' && data.ownerId) {
        token.ownerId = data.ownerId as any;
      }
      if (typeof data.size === 'string' && data.size) {
        token.size = data.size;
      }
      if (typeof data.canOverlap === 'boolean') {
        token.canOverlap = data.canOverlap;
      }
      await token.save();

      // Atualiza iniciativa se nome mudou
      if (initiativeNeedsUpdate) {
        const scene = await Scene.findById(token.sceneId);
        if (scene) {
          let changed = false;
            scene.initiative.forEach(entry => {
              if (entry.tokenId?.toString() === token._id.toString()) {
                entry.characterName = token.name;
                changed = true;
              }
            });
            if (changed) {
              await scene.save();
              io.to(tableId).emit('initiativeUpdated', scene.initiative);
            }
        }
      }

      const populated = await token.populate('ownerId', '_id username');
      io.to(tableId).emit('tokenUpdated', {
        _id: populated._id.toString(),
        squareId: populated.squareId,
        color: populated.color,
        ownerId: populated.ownerId,
        name: populated.name,
        imageUrl: populated.imageUrl,
        tableId: populated.tableId?.toString(),
        sceneId: populated.sceneId?.toString(),
        movement: populated.movement,
        remainingMovement: populated.remainingMovement,
        size: populated.size,
      });
    } catch (error) {
      console.error('Erro ao editar token:', error);
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

  const gridWidth = (scene as any).gridWidth ?? 30;
      const getCoords = (sqId: string) => {
        const index = parseInt(sqId.replace('sq-', ''));
        return { x: index % gridWidth, y: Math.floor(index / gridWidth) };
      };

      const distance = Math.max(Math.abs(getCoords(currentPosition).x - getCoords(previousPosition).x), Math.abs(getCoords(currentPosition).y - getCoords(previousPosition).y));
  const metersPerSquare = (scene as any).metersPerSquare ?? 1.5;
  const movementCost = distance * metersPerSquare;

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
  socket.on('requestEditToken', requestEditToken);
}