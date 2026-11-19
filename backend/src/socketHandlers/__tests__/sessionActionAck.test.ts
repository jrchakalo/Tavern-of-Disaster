import { Types } from 'mongoose';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import { runAction } from '../ack';
import SessionAction from '../../models/SessionAction.model';
import * as sessionActionService from '../../services/sessionActionService';

jest.setTimeout(30000);

const tableId = new Types.ObjectId().toString();

type Emitted = { room: string; event: string; payload: any };

function fakeIo(): { io: any; emitted: Emitted[] } {
  const emitted: Emitted[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => emitted.push({ room, event, payload }),
    }),
  };
  return { io, emitted };
}

function fakeSocket(userId = new Types.ObjectId().toString()): any {
  return {
    id: 'sock-test',
    data: { user: { id: userId, username: 'Mestre' } },
    emit: jest.fn(),
  };
}

function fakeLogger(): any {
  return { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
}

const changes = {
  sessionStatus: { status: 'PAUSED', pauseUntil: null, serverNowMs: Date.now() },
};

describe('runAction — log canônico de ações', () => {
  beforeAll(async () => {
    await connectMongoMemory();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await clearMongoMemory();
  });

  afterAll(async () => {
    await disconnectMongoMemory();
  });

  it('registra a ação e emite sessionAction para a sala (inclui o autor)', async () => {
    const { io, emitted } = fakeIo();
    const ack = jest.fn();
    const log = fakeLogger();

    await runAction({
      io,
      socket: fakeSocket(),
      event: 'requestUpdateSessionStatus',
      ack,
      log,
      body: async () => ({ tableId, revision: 4, changes }),
    });

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: true, revision: 4 }));
    const actionEvent = emitted.find((item) => item.event === 'sessionAction');
    expect(actionEvent).toBeDefined();
    expect(actionEvent!.room).toBe(tableId);
    expect(actionEvent!.payload.content).toBe('Sessão: Pausado');
    expect(actionEvent!.payload.authorName).toBe('Mestre');

    const stored = await SessionAction.find({ tableId });
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe('Sessão: Pausado');
  });

  it('não registra em joinTable, resync, chat ou medição', async () => {
    const { io, emitted } = fakeIo();
    for (const event of ['joinTable', 'requestResync', 'requestSendChat', 'requestShareMeasurement']) {
      const ack = jest.fn();
      await runAction({
        io,
        socket: fakeSocket(),
        event,
        ack,
        log: fakeLogger(),
        body: async () => ({ tableId, revision: 4, changes }),
      });
      expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    }
    expect(emitted.filter((item) => item.event === 'sessionAction')).toHaveLength(0);
    expect(await SessionAction.countDocuments({ tableId })).toBe(0);
  });

  it('falha ao registrar não transforma mutação bem-sucedida em erro', async () => {
    jest
      .spyOn(sessionActionService, 'recordSessionAction')
      .mockRejectedValueOnce(new Error('mongo indisponível'));
    const { io, emitted } = fakeIo();
    const ack = jest.fn();
    const log = fakeLogger();

    await runAction({
      io,
      socket: fakeSocket(),
      event: 'requestUpdateSessionStatus',
      ack,
      log,
      body: async () => ({ tableId, revision: 4, changes }),
    });

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: true, revision: 4 }));
    expect(emitted.some((item) => item.event === 'sessionAction')).toBe(false);
    expect(log.error).toHaveBeenCalled();
  });
});
