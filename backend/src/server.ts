import express from 'express';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import connectDB from './config/db';
import Token, { IToken } from './models/Token.model';
import Table from './models/Table.model';
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

// Configuração do Socket.IO
io.on('connection', async (socket) => {
  console.log(`Usuário conectado:, ${socket.id}`);

  socket.on('joinTable', async (tableId: string) => {
    try {
      // 'join' é o comando do Socket.IO para adicionar um socket a uma sala
      socket.join(tableId);
      console.log(`Socket ${socket.id} entrou na sala da mesa ${tableId}`);

      const tokens = await Token.find({ tableId: tableId });
      socket.emit('initialTokenState', tokens);

      const table = await Table.findById(tableId);
      if (table && table.currentMapUrl) {
        socket.emit('mapUpdated', { mapUrl: table.currentMapUrl });
      }
    } catch (error) {
      console.error(`Erro ao entrar na sala ${tableId}:`, error);
      socket.emit('error', { message: `Não foi possível entrar na mesa ${tableId}` });
    }
  });

  socket.on('requestPlaceToken', async (data: { tableId: string, squareId: string; name: string; imageUrl?: string }) => {
    try {
      if (!data || !data.squareId || !data.name) {
        socket.emit('tokenPlacementError', { message: 'squareId não fornecido.' });
        return;
      }

      // Verifica se já existe um token nesse quadrado
      const existingToken = await Token.findOne({ tableId: data.tableId, squareId: data.squareId });
      if (existingToken) {
        console.log(`Tentativa de colocar token em quadrado já ocupado: ${data.squareId}`);
        socket.emit('tokenPlacementError', { message: 'Este quadrado já está ocupado.' });
        return;
      }

      // Cria um novo token
      const randomNumber = Math.floor(Math.random() * 16777215);
      const hexString = randomNumber.toString(16).padStart(6, '0');
      const tokenColor = `#${hexString}`;

      const newToken = new Token({
        tableId: data.tableId,  
        squareId: data.squareId,
        color: tokenColor,
        ownerSocketId: socket.id,
        name: data.name,
        imageUrl: data.imageUrl
      });

      await newToken.save();

      io.to(data.tableId).emit('tokenPlaced', newToken); // Envia o token completo

    } catch (error: any) {
      console.error('Erro ao processar requestPlaceToken:', error.message);
      socket.emit('tokenPlacementError', { message: 'Erro ao colocar o token.' });
    }
  });

  socket.on('requestMoveToken', async (data: { tableId: string, tokenId: string; targetSquareId: string }) => {
    console.log(`Recebido 'requestMoveToken' de ${socket.id}:`, data);
    try {
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

      
      if (tokenToMove.ownerSocketId !== socket.id) {
        console.log(`Usuário ${socket.id} tentou mover token ${tokenId} que não lhe pertence.`);
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
        ownerSocketId: tokenToMove.ownerSocketId,
        name: tokenToMove.name,
        imageUrl: tokenToMove.imageUrl
      });
    } catch (error: any) {
      console.error('Erro ao processar requestMoveToken:', error.message);
      socket.emit('tokenMoveError', { message: 'Erro interno ao mover o token.' });
    }
  });

  socket.on('requestSetMap', async (data: { tableId: string, mapUrl: string }) => {
    try {
      if (typeof data.mapUrl === 'string' && data.tableId) {
        // Encontra a mesa no DB e atualiza sua URL do mapa
        const updatedTable = await Table.findByIdAndUpdate(
          data.tableId,
          { currentMapUrl: data.mapUrl },
          { new: true } // Retorna o documento atualizado
        );

        if (updatedTable) {
          console.log(`Mapa da mesa ${data.tableId} atualizado para: ${data.mapUrl}`);
          // Notifica TODOS na sala sobre o novo mapa
          io.to(data.tableId).emit('mapUpdated', { mapUrl: updatedTable.currentMapUrl });
        }
      }
    } catch (error) {
      console.error("Erro ao atualizar o mapa da mesa:", error);
    }
  });

  // Evento de desconexão
  socket.on('disconnect', () => {
    console.log(`Usuário desconectado:, ${socket.id}`);
  });
});