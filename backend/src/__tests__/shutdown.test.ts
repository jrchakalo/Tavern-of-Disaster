import { createShutdownHandler, registerShutdownHandlers } from '../shutdown';

type AsyncCallback = (error?: Error) => void;

function buildDeps(overrides: Partial<Parameters<typeof createShutdownHandler>[0]> = {}) {
  const order: string[] = [];
  const server = {
    close: jest.fn((callback?: AsyncCallback) => {
      order.push('http');
      callback?.();
    }),
  };
  const io = {
    close: jest.fn((callback?: AsyncCallback) => {
      order.push('io');
      callback?.();
    }),
  };
  const disconnectDatabase = jest.fn(async () => {
    order.push('db');
  });
  const exit = jest.fn();
  const logger = { info: jest.fn(), error: jest.fn() };

  return {
    order,
    server,
    io,
    disconnectDatabase,
    exit,
    logger,
    deps: {
      server: server as never,
      io: io as never,
      disconnectDatabase,
      exit,
      timeoutMs: 1000,
      logger,
      ...overrides,
    },
  };
}

describe('createShutdownHandler', () => {
  it('fecha HTTP, Socket.IO e Mongo e sai com 0', async () => {
    const { deps, order, exit, logger } = buildDeps();
    const handler = createShutdownHandler(deps);

    await handler('SIGTERM');

    expect(order).toEqual(['http', 'io', 'db']);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(logger.info).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('é idempotente: um segundo sinal não executa o shutdown de novo', async () => {
    const { deps, order, exit } = buildDeps();
    const handler = createShutdownHandler(deps);

    await handler('SIGTERM');
    await handler('SIGINT');

    expect(order).toEqual(['http', 'io', 'db']);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('sai com 1 quando a desconexão do banco falha', async () => {
    const disconnectDatabase = jest.fn().mockRejectedValue(new Error('db disconnect failed'));
    const { deps, order, exit, logger } = buildDeps({ disconnectDatabase });
    const handler = createShutdownHandler(deps);

    await handler('SIGINT');

    expect(order).toEqual(['http', 'io']);
    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it('força a saída com 1 após o timeout', async () => {
    jest.useFakeTimers();
    try {
      const server = { close: jest.fn() };
      const io = { close: jest.fn((callback?: AsyncCallback) => callback?.()) };
      const exit = jest.fn();
      const logger = { info: jest.fn(), error: jest.fn() };
      const handler = createShutdownHandler({
        server: server as never,
        io: io as never,
        disconnectDatabase: jest.fn(async () => undefined),
        exit,
        timeoutMs: 500,
        logger,
      });

      void handler('SIGTERM');
      await jest.advanceTimersByTimeAsync(500);

      expect(exit).toHaveBeenCalledWith(1);
      expect(server.close).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('registerShutdownHandlers', () => {
  it('registra e remove os listeners de SIGTERM/SIGINT', () => {
    const { deps } = buildDeps();
    const termBefore = process.listenerCount('SIGTERM');
    const intBefore = process.listenerCount('SIGINT');

    const unregister = registerShutdownHandlers(deps);
    expect(process.listenerCount('SIGTERM')).toBe(termBefore + 1);
    expect(process.listenerCount('SIGINT')).toBe(intBefore + 1);

    unregister();
    expect(process.listenerCount('SIGTERM')).toBe(termBefore);
    expect(process.listenerCount('SIGINT')).toBe(intBefore);
  });
});
