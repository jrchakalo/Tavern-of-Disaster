import express from 'express';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db';
import Token from './models/Token.model';

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

app.get('/', (req, res) => {
  res.send('Socket.IO carregado.');
});

server.listen(port, () => {
  console.log(`Server rodando em http://localhost:${port}`);
});

// Configuração do Socket.IO
io.on('connection', async (socket) => {
  console.log(`Usuário conectado:, ${socket.id}`);

  try {
    const tokens = await Token.find({}); // Busca todos os tokens existentes
    socket.emit('initialTokenState', tokens); // Novo evento ou modifique o existente
    console.log('Estado inicial dos tokens enviado para o cliente');
  } catch (error) {
    console.error('Erro ao buscar o estado inicial dos tokens:', error);
  }

  socket.on('requestPlaceToken', async (data: { squareId: string }) => {
    try {
      if (!data || !data.squareId) {
        socket.emit('tokenPlacementError', { message: 'squareId não fornecido.' });
        return;
      }

      // Verifica se já existe um token nesse quadrado
      const existingToken = await Token.findOne({ squareId: data.squareId });
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
        squareId: data.squareId,
        color: tokenColor,
        ownerSocketId: socket.id
      });

      await newToken.save();

      io.emit('tokenPlaced', newToken); // Envia o token completo

    } catch (error: any) {
      console.error('Erro ao processar requestPlaceToken:', error.message);
      socket.emit('tokenPlacementError', { message: 'Erro ao colocar o token.' });
    }
  });

  socket.on('requestMoveToken', async (data: { tokenId: string; targetSquareId: string }) => {
    console.log(`Recebido 'requestMoveToken' de ${socket.id}:`, data);
    try {
      const { tokenId, targetSquareId } = data;

      if (!tokenId || !targetSquareId) {
        socket.emit('tokenMoveError', { message: 'Dados inválidos para mover token.' });
        return;
      }

      // Verifica se o quadrado de destino já está ocupado por OUTRO token
      const occupyingToken = await Token.findOne({ squareId: targetSquareId });
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
      io.emit('tokenMoved', {
        _id: tokenToMove._id.toString(), // Garante que é string
        oldSquareId: oldSquareId,
        squareId: tokenToMove.squareId, // Novo squareId
        color: tokenToMove.color,
        ownerSocketId: tokenToMove.ownerSocketId
      });

    } catch (error: any) {
      console.error('Erro ao processar requestMoveToken:', error.message);
      socket.emit('tokenMoveError', { message: 'Erro interno ao mover o token.' });
    }
  });

  // Evento de desconexão
  socket.on('disconnect', () => {
    console.log(`Usuário desconectado:, ${socket.id}`);
  });
});