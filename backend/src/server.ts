import express from 'express';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db';
import Square, { ISquare } from './models/Square.model';

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

const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Socket.IO carregado.');
});

server.listen(port, () => {
  console.log(`Server rodando em http://localhost:${port}`);
});

// Configuração do Socket.IO
io.on('connection', async (socket) => {
  console.log(`Usuário conectado:, ${socket.id}`);

  try{
    const squares: ISquare[] = await Square.find({});
    socket.emit('initialGridState', squares);
    console.log('Estado inicial da grade enviado para o cliente');
  }catch (error) {
    console.error('Erro ao buscar o estado inicial da grade:', error);
    socket.emit('errorLoadingGrid', {message: 'Não foi possível carregar o estado inicial da grade.'});
  }

  socket.on('squareClicked', async (data: { squareId: string, color: string }) => {
    try {
      const { squareId, color } = data;
      
      if (!squareId || !color) {
        socket.emit('updateError', { message: 'Dados inválidos para squareClicked.' });
        return;
      }

      const updatedSquare = await Square.findOneAndUpdate(
        { squareId: squareId },
        { color: color },
        {
          new: true, // Retorna o documento atualizado
          upsert: true, // Cria um novo documento se não existir
          setDefaultsOnInsert: true // Define valores padrão se o documento for criado
        }
      );

      io.emit('gridSquareUpdated', updatedSquare);
    } catch (error) {
      console.error('Erro ao atualizar o quadrado:', error);
      socket.emit('updateError', { message: 'Erro ao atualizar o quadrado.' });
    }
  });

  // Evento de desconexão
  socket.on('disconnect', () => {
    console.log(`Usuário desconectado:, ${socket.id}`);
  });
});