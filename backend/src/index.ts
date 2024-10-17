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
import { Socket } from 'dgram';

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
  console.log('Novo usuário conectado');

  // Ouça eventos de turno
  socket.on('endTurn', (data) => {
    // Envie a mudança de turno para todos os outros clientes
    socket.broadcast.emit('turnEnded', data);
  });

  socket.on('disconnect', () => {
    console.log('Usuário desconectado');
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
