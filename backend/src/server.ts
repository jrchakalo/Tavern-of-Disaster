import express from 'express';
import dotenv from 'dotenv';
import http from 'http';
import path from 'path';
import { Server, Socket } from 'socket.io';
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
import { getTableById } from './services/tableService';
import { getRevisionSafe } from './services/revisionService';
import { getTableInfo, sendPresenceUpdated } from './services/sessionService';
import { leavePresence } from './services/presenceService';

dotenv.config();
const log = createLogger({ scope: 'server' });

function buildCorsOptions() {
  // Defina CORS_ORIGIN (ex.: https://app.exemplo.com) em produção para limitar a origem.
  const allowedOrigin = process.env.CORS_ORIGIN || '*';
  const normalizedOrigin =
    allowedOrigin === '*'
      ? '*'
      : allowedOrigin
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0);
  return {
    origin: normalizedOrigin as '*' | string | string[],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  };
}

/**
 * Autenticação de handshake do Socket.IO.
 * Token expirado entrega `err.data.code = 'TOKEN_EXPIRED'` para o cliente renovar.
 */
function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token;
  const socketLog = log.child({ scope: 'socket-auth', socketId: socket.id });
  if (!token) {
    socketLog.warn('Tentativa de conexão sem token');
    const missing = new Error('Authentication error: Token não fornecido.') as Error & {
      data?: { code: string };
    };
    missing.data = { code: 'UNAUTHENTICATED' };
    return next(missing);
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    socketLog.error('JWT_SECRET ausente no servidor');
    return next(new Error('Authentication error: JWT Secret não configurada no servidor.'));
  }

  jwt.verify(token, jwtSecret, (err: any, decoded: any) => {
    if (err) {
      const expired = err?.name === 'TokenExpiredError';
      socketLog.warn({ err: err?.name }, 'Token inválido no handshake');
      const authError = new Error(
        expired ? 'Authentication error: Token expirado.' : 'Authentication error: Token inválido.'
      ) as Error & { data?: { code: string } };
      authError.data = { code: expired ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED' };
      return next(authError);
    }
    socket.data.user = decoded.user;
    socket.data.joinedTables = new Set<string>();
    socketLog.info({ userId: decoded.user?.id }, 'Socket autenticado');
    next();
  });
}

async function emitPresenceForTable(io: Server, tableId: string) {
  try {
    const table = await getTableById(tableId as string, [
      { path: 'dm', select: 'username _id' },
      { path: 'players', select: 'username _id' },
    ]);
    if (!table) return;
    const revision = await getRevisionSafe(tableId);
    sendPresenceUpdated(io, tableId, getTableInfo(table), revision);
  } catch (error) {
    log.warn({ err: error, tableId }, 'Falha ao emitir presença atualizada');
  }
}

/**
 * Cria app Express + servidor HTTP + Socket.IO sem abrir porta nem conectar ao Mongo.
 * Usado pelo bootstrap de produção (`startServer`) e pelos testes de integração.
 */
export function createServer(): { app: express.Express; server: http.Server; io: Server } {
  const app = express();
  const server = http.createServer(app);
  const corsOptions = buildCorsOptions();
  const io = new Server(server, {
    cors: {
      origin: corsOptions.origin,
      methods: ['GET', 'POST'],
    },
  });

  // Uploads locais (STORAGE_DRIVER=local). Em produção com object storage, o
  // arquivo é servido pelo CDN/bucket e esta rota fica apenas como fallback.
  const localUploadDir = process.env.LOCAL_UPLOAD_DIR
    ? path.resolve(process.env.LOCAL_UPLOAD_DIR)
    : path.resolve(__dirname, '..', 'uploads');

  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(
    '/uploads',
    express.static(localUploadDir, {
      maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
      fallthrough: true,
    })
  );
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

  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
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
      const userId = socket.data.user?.id as string | undefined;
      const joinedTables: Set<string> = socket.data.joinedTables ?? new Set<string>();
      if (userId) {
        joinedTables.forEach((tableId) => {
          leavePresence(tableId, userId, socket.id);
          void emitPresenceForTable(io, tableId);
        });
      }
      socketLog.info('Socket desconectado');
    });
  });

  return { app, server, io };
}

function startMeasurementCleanup() {
  const measurementIdleTtlMs = Number(process.env.MEASUREMENT_IDLE_TTL_MS ?? 30 * 60 * 1000);
  const measurementCleanupIntervalMs = Number(process.env.MEASUREMENT_CLEANUP_INTERVAL_MS ?? 5 * 60 * 1000);
  if (measurementIdleTtlMs > 0 && measurementCleanupIntervalMs > 0) {
    setInterval(() => {
      log.debug({ measurementIdleTtlMs }, 'Executando limpeza de medições inativas');
      cleanupInactiveTables(measurementIdleTtlMs);
    }, measurementCleanupIntervalMs);
  } else {
    log.warn(
      { measurementIdleTtlMs, measurementCleanupIntervalMs },
      '[measurement] Cleanup desabilitado; verifique variáveis de ambiente'
    );
  }
}

export async function startServer(port: number = Number(process.env.PORT) || 3001) {
  await connectDB();
  const { app, server, io } = createServer();
  server.listen(port, () => {
    log.info({ port }, 'Server iniciado');
  });
  startMeasurementCleanup();
  return { app, server, io };
}

if (require.main === module) {
  startServer().catch((error) => {
    log.error({ err: error }, 'Falha ao iniciar o servidor');
    process.exit(1);
  });
}
