import express from 'express';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import connectDB from './config/db';
import authRouter from './routes/auth.routes';
import tableRouter from './routes/table.routes';
import characterRouter from './routes/character.routes';
import { registerTableHandlers } from './socketHandlers/tableHandlers';
import { registerTokenHandlers } from './socketHandlers/tokenHandlers';
import { registerInitiativeHandlers } from './socketHandlers/initiativeHandlers';
import { registerMeasurementHandlers } from './socketHandlers/measurementHandlers';
import { registerDiceHandlers } from './socketHandlers/diceHandlers';
import { cleanupInactiveTables } from './socketHandlers/measurementStore';

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
const measurementIdleTtlMs = Number(process.env.MEASUREMENT_IDLE_TTL_MS ?? 30 * 60 * 1000);
const measurementCleanupIntervalMs = Number(process.env.MEASUREMENT_CLEANUP_INTERVAL_MS ?? 5 * 60 * 1000);

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/tables', tableRouter);
app.use('/api', characterRouter);


server.listen(port, () => {
  console.log(`Server rodando em http://localhost:${port}`);
});

if (measurementIdleTtlMs > 0 && measurementCleanupIntervalMs > 0) {
  setInterval(() => {
    cleanupInactiveTables(measurementIdleTtlMs);
  }, measurementCleanupIntervalMs);
} else {
  console.warn('[measurement] Cleanup desabilitado; verifique as variáveis MEASUREMENT_IDLE_TTL_MS e MEASUREMENT_CLEANUP_INTERVAL_MS');
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

  registerTableHandlers(io, socket);
  registerTokenHandlers(io, socket);
  registerInitiativeHandlers(io, socket);
  registerMeasurementHandlers(io, socket);
  registerDiceHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log(`Usuário desconectado: ${socket.id}`);
  });
});