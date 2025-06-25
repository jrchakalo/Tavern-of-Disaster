import express from 'express';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import connectDB from './config/db';
import Token, { IToken } from './models/Token.model';
import Table from './models/Table.model';
import Scene from './models/Scene.model';
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
  const tokens = await Token.find({ sceneId: sceneId }); // Apenas tokens da cena ativa
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

      const table = await Table.findById(tableId).populate('activeScene').populate('scenes');
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
      io.to(tableId).emit('tokenPlaced', newToken); 

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

      if (tokenToMove.ownerId.toString() !== userId) {
        console.log(`Usuário ${userId} tentou mover token ${data.tokenId} que não lhe pertence.`);
        socket.emit('tokenMoveError', { message: 'Você não tem permissão para mover este token.' });
        return;
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

      // Notifica todos os clientes sobre o movimento do token
      io.to(tableId).emit('tokenMoved', {
        _id: tokenToMove._id.toString(), // Garante que é string
        oldSquareId: oldSquareId,
        squareId: tokenToMove.squareId, // Novo squareId
        color: tokenToMove.color,
        ownerId: tokenToMove.ownerId.toString(),
        name: tokenToMove.name,
        imageUrl: tokenToMove.imageUrl,
        sceneId: tokenToMove.sceneId ? tokenToMove.sceneId.toString() : "",
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
});