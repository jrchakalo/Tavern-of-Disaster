import express from 'express';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import connectDB from './config/db';
import Token from './models/Token.model';
import { IInitiativeEntry } from './models/Scene.model';
import Table from './models/Table.model';
import Scene from './models/Scene.model';
import User from './models/User.model';
import authRouter from './routes/auth.routes';
import tableRouter from './routes/table.routes';

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/tables', tableRouter);


server.listen(port, () => {
  console.log(`Server rodando em http://localhost:${port}`);
});

async function getFullSessionState(tableId: string, sceneId: string) {
  const activeScene = await Scene.findById(sceneId);
  const tokens = await Token.find({ sceneId: sceneId }).populate('ownerId', '_id username');
  return { activeScene, tokens };
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: Token não fornecido.'));
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return next(new Error('Authentication error: JWT Secret não configurada no servidor.'));
  }

  jwt.verify(token, jwtSecret, (err: any, decoded: any) => {
    if (err) {
      return next(new Error('Authentication error: Token inválido.'));
    }
    // Anexa o usuário ao objeto socket para uso posterior
    socket.data.user = decoded.user;
    next();
  });
});

// Configuração do Socket.IO
io.on('connection', async (socket) => {
  console.log(`Usuário conectado:, ${socket.id}`);

  socket.on('joinTable', async (tableId: string) => {
    try {
      socket.join(tableId);
      console.log(`Socket ${socket.id} entrou na sala da mesa ${tableId}`);

      const table = await Table.findById(tableId)
      .populate('activeScene')
      .populate('scenes')
      .populate('players', 'username _id')
      .populate('dm', 'username _id'); 
      if (!table) return;

      const activeSceneId = table.activeScene?._id;
      const tokens = activeSceneId ? await Token.find({ sceneId: activeSceneId }) : [];
      const initialState = {
        tableInfo: table,
        activeScene: table.activeScene,
        tokens: tokens,
        allScenes: table.scenes,
      };

      // Envia o estado completo para o cliente que acabou de entrar
      socket.emit('initialSessionState', initialState);
    } catch (error) {
      console.error(`Erro ao entrar na sala ${tableId}:`, error);
      socket.emit('error', { message: `Não foi possível entrar na mesa ${tableId}` });
    }
  });

  socket.on('requestPlaceToken', async (data: { tableId: string, sceneId: string, squareId: string; name: string; imageUrl?: string }) => {
    try {
      const userId = socket.data.user?.id; 
      if (!userId) return;

      const { tableId, sceneId, squareId, name, imageUrl } = data;

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
        ownerId: userId,
        name,
        imageUrl
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
  });

  socket.on('requestMoveToken', async (data: { tableId: string, tokenId: string; targetSquareId: string }) => {
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

      // Se o token já está no targetSquareId, não faz nada
      if (oldSquareId === targetSquareId) {
        console.log(`Token ${tokenId} já está em ${targetSquareId}. Nenhum movimento necessário.`);
        return;
      }

      tokenToMove.squareId = targetSquareId; // Atualiza a posição
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
      });
    } catch (error: any) {
      console.error('Erro ao processar requestMoveToken:', error.message);
      socket.emit('tokenMoveError', { message: 'Erro interno ao mover o token.' });
    }
  });

  socket.on('requestSetMap', async (data: { tableId: string, mapUrl: string }) => {
    try {
      if (typeof data.mapUrl === 'string' && data.tableId) {
        // Encontra a mesa para obter o ID da cena ativa
        const table = await Table.findById(data.tableId);
        if (!table || !table.activeScene) return;

        const updatedScene = await Scene.findByIdAndUpdate(
          table.activeScene,
          { imageUrl: data.mapUrl },
          { new: true }
        );

        if (updatedScene) {
          console.log(`Mapa da cena ${updatedScene._id} atualizado para: ${updatedScene.imageUrl}`);
          // Notifica a sala sobre o novo mapa
          io.to(data.tableId).emit('mapUpdated', { mapUrl: updatedScene.imageUrl });
        }
      }
    } catch (error) {
      console.error("Erro ao atualizar o mapa da mesa:", error);
    }
  });

  socket.on('requestSetActiveScene', async (data: { tableId: string; sceneId: string }) => {
    try {
      const { tableId, sceneId } = data;
      const userId = socket.data.user?.id; // Pega o usuário da conexão autenticada

      const table = await Table.findById(tableId);
      if (!table) return;

      if (table.dm.toString() !== userId) {
        console.log(`[AUTH] Falha: Usuário ${userId} tentou mudar cena da mesa ${tableId}, mas não é o mestre.`);
        return socket.emit('error', { message: 'Apenas o Mestre pode mudar a cena.' });
      }

      await Table.findByIdAndUpdate(tableId, { activeScene: sceneId });

      const newState = await getFullSessionState(data.tableId, data.sceneId);

      io.to(data.tableId).emit('sessionStateUpdated', newState);
      console.log(`Mesa ${tableId} teve sua cena ativa atualizada para ${sceneId}`);

    } catch (error) {
      console.error('Erro ao definir cena ativa:', error);
    }
  });

  socket.on('requestUpdateGridSize', async (data: { tableId: string, sceneId: string, newGridSize: number }) => {
    try {
      const { tableId, sceneId, newGridSize } = data;
      const userId = socket.data.user?.id; // Pega o usuário da conexão autenticada
      const table = await Table.findById(tableId).populate('scenes');
      if (!table) return;

      if (table.dm.toString() !== userId) {
        console.log(`[AUTH] Falha: Usuário ${userId} tentou atualizar o tamanho do grid da mesa ${tableId}, mas não é o mestre.`);
        return socket.emit('error', { message: 'Apenas o Mestre pode atualizar o tamanho do grid.' });
      }

      await Scene.findByIdAndUpdate(sceneId, { gridSize: newGridSize });
      
      const activeScene = await Scene.findById(sceneId);
      const tokens = await Token.find({ sceneId: sceneId });

      const newState = {
        tableInfo: table,
        activeScene: activeScene,
        tokens: tokens,
        allScenes: table?.scenes || []
      };

      socket.to(tableId).emit('sessionStateUpdated', newState);
    } catch (error) {
      console.error('Erro ao atualizar o tamanho do grid:', error);
    }
  });

  socket.on('requestAddCharacterToInitiative', async (data: { tableId: string, sceneId: string, tokenId: string }) => {
    try {
      const { tableId, sceneId, tokenId } = data;
      const userId = socket.data.user?.id;

      const table = await Table.findById(tableId);
      if (!table) return;

      if (table.dm.toString() !== userId) {
        console.log(`[AUTH] Falha: Usuário ${userId} tentou adicionar personagem à iniciativa da mesa ${tableId}, mas não é o mestre.`);
        return socket.emit('error', { message: 'Apenas o Mestre pode adicionar personagens à iniciativa.' });
      }

      if (!tokenId) {
        socket.emit('error', { message: 'Nenhum token foi selecionado.' });
        return;
      }

      const token = await Token.findById(tokenId);
      if (!token) {
          socket.emit('error', { message: 'Token não encontrado.' });
          return;
      }

      const scene = await Scene.findById(sceneId);
      if (scene && scene.initiative.some(entry => entry.tokenId?.toString() === tokenId)) {
          socket.emit('error', { message: 'Este token já está na iniciativa.' });
          return;
      }

      const newEntry = { 
        characterName: token.name,
        tokenId: token._id, 
        isCurrentTurn: false
      };

      const updatedScene = await Scene.findByIdAndUpdate(
        sceneId,
        { $push: { initiative: newEntry } },
        { new: true }
      );

      if (updatedScene) {
        io.to(tableId).emit('initiativeUpdated', updatedScene.initiative);
      }
    } catch (error) { 
      console.error("Erro ao adicionar personagem à iniciativa:", error); 
    }
  });

  socket.on('requestNextTurn', async (data: { tableId: string, sceneId: string }) => {
    try {
      const { tableId, sceneId } = data;
      const userId = socket.data.user?.id; 
      
      const table = await Table.findById(tableId);
      if (!table) return;

      if (table.dm.toString() !== userId) {
        console.log(`[AUTH] Falha: Usuário ${userId} tentou avançar o turno da mesa ${tableId}, mas não é o mestre.`);
        return socket.emit('error', { message: 'Apenas o Mestre pode avançar o turno.' });
      }

      const scene = await Scene.findById(sceneId);
      if (!scene || scene.initiative.length === 0) return;

      const initiativeList = scene.initiative;
      const currentTurnIndex = initiativeList.findIndex(entry => entry.isCurrentTurn);

      // Desmarca o turno atual
      if (currentTurnIndex !== -1) {
          initiativeList[currentTurnIndex].isCurrentTurn = false;
      }

      // Encontra o próximo turno, voltando ao início se chegar ao fim
      const nextTurnIndex = (currentTurnIndex + 1) % initiativeList.length;
      initiativeList[nextTurnIndex].isCurrentTurn = true;

      // Salva o estado atualizado da lista no documento da cena
      scene.initiative = initiativeList;
      await scene.save();

      // Notifica todos na sala sobre a lista de iniciativa atualizada
      io.to(tableId).emit('initiativeUpdated', scene.initiative);
    } catch (error) { 
      console.error("Erro ao avançar o turno:", error); 
    }
  });

  socket.on('requestResetInitiative', async (data: { tableId: string, sceneId: string }) => {
    try {
      const { tableId, sceneId } = data;
      const userId = socket.data.user?.id;

      const table = await Table.findById(tableId);
      if (!table) return;
      
      if (table.dm.toString() !== userId) {
          console.log(`[AUTH] Falha: Usuário ${userId} tentou resetar a iniciativa da mesa ${tableId}, mas não é o mestre.`);
          return socket.emit('error', { message: 'Apenas o Mestre pode resetar a iniciativa.' });
      }

      const updatedScene = await Scene.findByIdAndUpdate(
          sceneId,
          { initiative: [] }, // Define o array de iniciativa como vazio
          { new: true }
      );

      io.to(tableId).emit('initiativeUpdated', updatedScene?.initiative);
    } catch (error) { 
      console.error("Erro ao resetar a iniciativa:", error); 
    }
  });

  socket.on('requestRemoveFromInitiative', async (data: { tableId: string; sceneId: string; initiativeEntryId: string }) => {
    try {
      const { tableId, sceneId, initiativeEntryId } = data;
      
      const userId = socket.data.user?.id;
      const table = await Table.findById(tableId);
      if (!table) return;
      if (table.dm.toString() !== userId) {
        console.log(`[AUTH] Falha: Usuário ${userId} tentou remover da iniciativa da mesa ${tableId}, mas não é o mestre.`);
        return socket.emit('error', { message: 'Apenas o Mestre pode remover personagens da iniciativa.' });
      }

      // Encontra a cena
      const scene = await Scene.findById(sceneId);
      const entryToRemove = scene?.initiative.find(e => e._id.toString() === initiativeEntryId);

      if (entryToRemove && entryToRemove.tokenId) {
        // Deleta o token associado
        await Token.findByIdAndDelete(entryToRemove.tokenId);
      }

      // Remove a entrada do array de iniciativa no documento da cena
      const updatedScene = await Scene.findByIdAndUpdate(
        sceneId,
        { $pull: { initiative: { _id: initiativeEntryId } } },
        { new: true }
      );

      if (updatedScene) {
        // Notifica sobre a lista de iniciativa atualizada
        io.to(tableId).emit('initiativeUpdated', updatedScene.initiative);

        // Notifica que um token foi removido
        if (entryToRemove?.tokenId) {
          io.to(tableId).emit('tokenRemoved', { tokenId: entryToRemove.tokenId.toString() });
        }
      }
    } catch (error) { 
      console.error("Erro ao remover da iniciativa:", error); 
    }
  });

  socket.on('requestReorderInitiative', async (data: { tableId: string; sceneId: string; newOrder: IInitiativeEntry[] }) => {
    try {
      const { tableId, sceneId, newOrder } = data;
      const userId = socket.data.user?.id;

      const table = await Table.findById(tableId);
      if (!table) return;
      if (table.dm.toString() !== userId) {
        console.log(`[AUTH] Falha: Usuário ${userId} tentou reordenar a iniciativa da mesa ${tableId}, mas não é o mestre.`);
        return socket.emit('error', { message: 'Apenas o Mestre pode reordenar a iniciativa.' });
      }

      // Atualiza todo o array 'initiative' da cena com a nova ordem recebida
      const updatedScene = await Scene.findByIdAndUpdate(
        sceneId,
        { initiative: newOrder },
        { new: true }
      );

      if (updatedScene) {
        // Em vez de io.to, usamos socket.to para manter a fluidez para o mestre
        socket.to(tableId).emit('initiativeUpdated', updatedScene.initiative);
      }
    } catch (error) { console.error("Erro ao reordenar iniciativa:", error); }
  });

  socket.on('requestAssignToken', async (data: { tableId: string; tokenId: string; newOwnerId: string }) => {
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
    } catch (error) { console.error("Erro ao atribuir token:", error); }
  });

  socket.on('requestEditInitiativeEntry', async (data: { tableId: string; sceneId: string; initiativeEntryId: string; newName: string }) => {
    try {
      const { tableId, sceneId, initiativeEntryId, newName } = data;
      const userId = socket.data.user?.id;

      const table = await Table.findById(tableId);
      if (!table) return;
      if (table.dm.toString() !== userId) {
        console.log(`[AUTH] Falha: Usuário ${userId} tentou editar entrada da iniciativa da mesa ${tableId}, mas não é o mestre.`);
        return socket.emit('error', { message: 'Apenas o Mestre pode editar entradas da iniciativa.' });
      }

      const scene = await Scene.findById(sceneId);
      if (!scene) return;

      // Encontra a entrada específica no array e atualiza seu nome
      const entry = scene.initiative.find(e => e._id?.toString() === initiativeEntryId);
      if (entry) {
        entry.characterName = newName;

        if (entry.tokenId) {
          await Token.findByIdAndUpdate(entry.tokenId, { name: newName });
        }
      }

      await scene.save();

      // Notifica todos na sala sobre a lista de iniciativa atualizada
      io.to(tableId).emit('initiativeUpdated', scene.initiative);
    } catch (error) { 
      console.error("Erro ao editar entrada da iniciativa:", error); 
    }
  });

  socket.on('requestReorderScenes', async (data: { tableId: string; orderedSceneIds: string[] }) => {
    try {
      const { tableId, orderedSceneIds } = data;
      const userId = socket.data.user?.id;

      const table = await Table.findById(tableId);
      if (!table) return;
      if (table.dm.toString() !== userId) {
        console.log(`[AUTH] Falha: Usuário ${userId} tentou reordenar cenas da mesa ${tableId}, mas não é o mestre.`);
        return socket.emit('error', { message: 'Apenas o Mestre pode reordenar as cenas.' });
      }

      // Atualiza o array 'scenes' no documento da mesa com a nova ordem de IDs
      const updatedTable = await Table.findByIdAndUpdate(
        tableId,
        { scenes: orderedSceneIds },
        { new: true }
      ).populate('scenes'); // Popula para enviar a lista completa de volta

      if (updatedTable) {
        // Notifica todos na sala (exceto o Mestre que arrastou) sobre a nova ordem
        socket.to(tableId).emit('sceneListUpdated', updatedTable.scenes);
      }
    } catch (error) { console.error("Erro ao reordenar cenas:", error); }
  });

  socket.on('disconnect', () => {
    console.log(`Usuário desconectado: ${socket.id}`);
  });
});