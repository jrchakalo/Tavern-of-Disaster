import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import userRoutes from './routes/userRoutes';
import tableRoutes from './routes/tableRoutes';
import authRoutes from './routes/authRoutes';
import passwordRoutes from './routes/passwordRoutes';
import playerRoutes from './routes/playerRoutes';
import http from 'http';
import { Server } from 'socket.io';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: '*',
  },
});

// Middlewares
app.use(cors());
app.use(express.json());

// Escute eventos de conexão
io.on('connection', (socket) => {
  console.log('Novo usuário conectado', socket.id);

  // Escutando o evento de carregamento de mapa de batalha
  socket.on('load_battle_map', (imageData) => {
    // Emitir para todos os outros clientes que o mapa foi carregado
    socket.broadcast.emit('battle_map_loaded', imageData);
  });

  // Escutando o evento de criação de token
  socket.on('create_token', (token) => {
    // Emitir para todos os outros clientes 
    socket.broadcast.emit('token_created', token);
  });

  // Escutando o evento de movimentação de token
  socket.on('move_token', (updatedToken) => {
    // Emitir para todos os outros clientess
    socket.broadcast.emit('token_moved', updatedToken);
  });

  // Escutando o evento de mudança de turno
  socket.on('next_turn', (newTurn) => {
    // Emitir para todos os outros clientes
    socket.broadcast.emit('turn_changed', newTurn);
  });

  // Escutando o evento de desfazer movimento
  socket.on('undo_move', (previousState) => {
    // Emitir para todos os outros clientes a reversão do movimento
    socket.broadcast.emit('tokens_updated', previousState);
  });

  // Escutando o evento de exclusão de token
  socket.on('delete_token', (tokenId) => {
    // Emitir para todos os outros clientes que o token foi excluído
    socket.broadcast.emit('token_deleted', tokenId);
  });

  // Escutando o evento de mover token na ordem do turno
  socket.on('move_token_in_turn_order', (newTokens) => {
    // Emitir para todos os outros clientes a nova ordem de tokens
    socket.broadcast.emit('tokens_order_updated', newTokens);
  });

  socket.on('disconnect', () => {
    console.log('Usuário desconectado', socket.id);
  });
});

// Rotas users
app.use('/api/users', userRoutes);

// Rotas tables
app.use('/api/table', tableRoutes);

// Rotas auth
app.use('/api/auth', authRoutes);

// Rotas password
app.use('/api/password', passwordRoutes);

// Rotas players
app.use('/api/players', playerRoutes);

// Rota de teste
app.get('/test', (req, res) => {
  res.send('API Tavern of Disaster');
});

// Inicia o servidor
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
