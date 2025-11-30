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
import systemRouter from './routes/system.routes';
import { registerTableHandlers } from './socketHandlers/tableHandlers';
import { registerTokenHandlers } from './socketHandlers/tokenHandlers';
import { registerInitiativeHandlers } from './socketHandlers/initiativeHandlers';
import { registerMeasurementHandlers } from './socketHandlers/measurementHandlers';
import { registerDiceHandlers } from './socketHandlers/diceHandlers';
import { cleanupInactiveTables } from './socketHandlers/measurementStore';
import tokenTemplateRouter from './routes/tokenTemplate.routes';
import sceneTemplateRouter from './routes/sceneTemplate.routes';
import userRouter from './routes/user.routes';
import assetRouter from './routes/asset.routes';
import rollRouter from './routes/roll.routes';
import { createLogger } from './logger';
import {
  getMetricsSnapshot,
  recordSocketConnected,
  recordSocketDisconnected,
} from './metrics';

dotenv.config();
connectDB();
const log = createLogger({ scope: 'server' });

const app = express();
const server = http.createServer(app);
// Defina CORS_ORIGIN (ex.: https://app.exemplo.com) em produção para limitar a origem.
const allowedOrigin = process.env.CORS_ORIGIN || '*';
const normalizedOrigin =
  allowedOrigin === '*'
    ? '*'
    : allowedOrigin
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
const corsOptions = {
  origin: normalizedOrigin as '*' | string | string[],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
};
const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    methods: ['GET', 'POST'],
  },
});
const port = process.env.PORT || 3001;
const measurementIdleTtlMs = Number(process.env.MEASUREMENT_IDLE_TTL_MS ?? 30 * 60 * 1000);
const measurementCleanupIntervalMs = Number(process.env.MEASUREMENT_CLEANUP_INTERVAL_MS ?? 5 * 60 * 1000);

app.use(cors(corsOptions));
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/tables', tableRouter);
app.use('/api', characterRouter);
app.use('/api', systemRouter);
app.use('/api/users', userRouter);
app.use('/api/token-templates', tokenTemplateRouter);
app.use('/api/scene-templates', sceneTemplateRouter);
app.use('/api/assets', assetRouter);
app.use('/api', rollRouter);

app.get('/metrics', (_req, res) => {
  res.json(getMetricsSnapshot());
});


server.listen(port, () => {
  log.info({ port }, 'Server iniciado');
});

if (measurementIdleTtlMs > 0 && measurementCleanupIntervalMs > 0) {
  setInterval(() => {
    log.debug({ measurementIdleTtlMs }, 'Executando limpeza de medições inativas');
    cleanupInactiveTables(measurementIdleTtlMs);
  }, measurementCleanupIntervalMs);
} else {
  log.warn({ measurementIdleTtlMs, measurementCleanupIntervalMs }, '[measurement] Cleanup desabilitado; verifique variáveis de ambiente');
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const socketLog = log.child({ scope: 'socket-auth', socketId: socket.id });
  if (!token) {
    socketLog.warn('Tentativa de conexão sem token');
    return next(new Error('Authentication error: Token não fornecido.'));
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    socketLog.error('JWT_SECRET ausente no servidor');
    return next(new Error('Authentication error: JWT Secret não configurada no servidor.'));
  }

  jwt.verify(token, jwtSecret, (err: any, decoded: any) => {
    if (err) {
      socketLog.warn({ err }, 'Token inválido');
      return next(new Error('Authentication error: Token inválido.'));
    }
    socket.data.user = decoded.user;
    socketLog.info({ userId: decoded.user?.id }, 'Socket autenticado');
    next();
  });
});

// Configuração do Socket.IO
io.on('connection', async (socket) => {
  recordSocketConnected(socket.id);
  const socketLog = log.child({ scope: 'socket', socketId: socket.id, userId: socket.data.user?.id });
  socketLog.info('Socket conectado');

  registerTableHandlers(io, socket);
  registerTokenHandlers(io, socket);
  registerInitiativeHandlers(io, socket);
  registerMeasurementHandlers(io, socket);
  registerDiceHandlers(io, socket);

  socket.on('disconnect', () => {
    recordSocketDisconnected(socket.id);
    socketLog.info('Socket desconectado');
  });
});