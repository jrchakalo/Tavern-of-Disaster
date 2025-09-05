import express from 'express';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import connectDB from './config/db';
import authRouter from './routes/auth.routes';
import tableRouter from './routes/table.routes';
import { registerTableHandlers } from './socketHandlers/tableHandlers';
import { registerTokenHandlers } from './socketHandlers/tokenHandlers';
import { registerInitiativeHandlers } from './socketHandlers/initiativeHandlers';
import { registerMeasurementHandlers } from './socketHandlers/measurementHandlers';

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

  registerTableHandlers(io, socket);
  registerTokenHandlers(io, socket);
  registerInitiativeHandlers(io, socket);
  registerMeasurementHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log(`Usuário desconectado: ${socket.id}`);
  });
});