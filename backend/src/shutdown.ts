import type { Server as HttpServer } from 'http';
import mongoose from 'mongoose';
import type { Server as SocketServer } from 'socket.io';
import { createLogger } from './logger';

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

type CloseableHttpServer = Pick<HttpServer, 'close'>;
type CloseableSocketServer = Pick<SocketServer, 'close'>;

type ShutdownLogger = {
  info: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
};

export type ShutdownDeps = {
  server: CloseableHttpServer;
  io: CloseableSocketServer;
  disconnectDatabase?: () => Promise<unknown>;
  exit?: (code: number) => void;
  timeoutMs?: number;
  logger?: ShutdownLogger;
};

function resolveTimeout(timeoutMs?: number): number {
  if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return timeoutMs;
  }
  const fromEnv = Number(process.env.SHUTDOWN_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_SHUTDOWN_TIMEOUT_MS;
}

function closeHttpServer(server: CloseableHttpServer): Promise<void> {
  return new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function closeSocketServer(io: CloseableSocketServer): Promise<void> {
  return new Promise((resolve) => {
    try {
      io.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

const defaultDisconnect = async () => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
};

/**
 * Cria um handler idempotente de shutdown: HTTP para de aceitar conexões,
 * Socket.IO fecha, Mongoose desconecta e o processo sai com 0. Se algo travar,
 * um timer força a saída (código 1) após `SHUTDOWN_TIMEOUT_MS` (padrão 10s).
 */
export function createShutdownHandler(deps: ShutdownDeps): (signal: string) => Promise<void> {
  const logger = deps.logger ?? createLogger({ scope: 'shutdown' });
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const timeoutMs = resolveTimeout(deps.timeoutMs);
  const disconnectDatabase = deps.disconnectDatabase ?? defaultDisconnect;
  let shuttingDown = false;

  return async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal, timeoutMs }, 'Sinal recebido; encerrando servidor');

    const forceExit = setTimeout(() => {
      logger.error({ signal, timeoutMs }, 'Shutdown excedeu o tempo limite; saindo à força');
      exit(1);
    }, timeoutMs);
    forceExit.unref?.();

    try {
      // Para de aceitar conexões primeiro, mas fecha o Socket.IO antes de
      // aguardar o HTTP: clientes WebSocket manteriam `server.close()` pendente.
      const httpClosed = closeHttpServer(deps.server);
      await closeSocketServer(deps.io);
      await httpClosed;
      await disconnectDatabase();
      clearTimeout(forceExit);
      logger.info({ signal }, 'Shutdown concluído');
      exit(0);
    } catch (error) {
      clearTimeout(forceExit);
      logger.error({ signal, err: error }, 'Falha durante o shutdown');
      exit(1);
    }
  };
}

/**
 * Registra SIGTERM/SIGINT uma única vez. Retorna uma função para remover os
 * listeners (útil em testes/importações).
 */
export function registerShutdownHandlers(deps: ShutdownDeps): () => void {
  const handler = createShutdownHandler(deps);
  const onSignal = (signal: NodeJS.Signals) => {
    void handler(signal);
  };

  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);

  return () => {
    process.removeListener('SIGTERM', onSignal);
    process.removeListener('SIGINT', onSignal);
  };
}
