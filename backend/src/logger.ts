import pino from 'pino';

export type LogContext = {
  tableId?: string;
  sceneId?: string;
  userId?: string;
  socketId?: string;
  eventType?: string;
  [key: string]: unknown;
};

const defaultLevel = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export const logger = pino({
  level: defaultLevel,
  base: {
    service: 'tavern-of-disaster-backend',
    env: process.env.NODE_ENV ?? 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const createLogger = (context: LogContext = {}) => logger.child(context);
