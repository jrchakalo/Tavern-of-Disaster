import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from '../../server';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import { resetPresence } from '../../services/presenceService';
import { diceRollRateLimiter } from '../../socketHandlers/diceHandlers';
import User from '../../models/User.model';
import Table from '../../models/Table.model';
import Scene from '../../models/Scene.model';
import Roll from '../../models/Roll.model';
import { ROLL_LOG_LIMIT, ROLL_LOG_RETENTION_DAYS } from '../../services/rollService';
import { randomId } from '../../utils/id';

jest.setTimeout(40000);

process.env.JWT_SECRET = process.env.JWT_SECRET || 'roll-integration-secret';

type RealtimeServer = ReturnType<typeof createServer>;

let realtime: RealtimeServer;
let baseUrl: string;
const openClients: ClientSocket[] = [];

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function createUser(username: string, password = 'senha123') {
  const passwordHash = await bcrypt.hash(password, 4);
  return User.create({
    username,
    email: `${username}-${randomId(6)}@test.dev`,
    passwordHash,
  });
}

function signToken(user: { _id: Types.ObjectId | string; username: string }) {
  return jwt.sign(
    { user: { id: user._id.toString(), username: user.username } },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );
}

async function createTableWithScene(dmId: Types.ObjectId, playerIds: Types.ObjectId[] = []) {
  const table = await Table.create({
    name: `Mesa ${randomId(4)}`,
    dm: dmId,
    players: [dmId, ...playerIds],
    inviteCode: randomId(8),
    scenes: [],
  });
  const scene = await Scene.create({
    tableId: table._id,
    name: 'Cena 1',
    gridWidth: 10,
    gridHeight: 10,
  });
  table.scenes = [scene._id as Types.ObjectId];
  table.activeScene = scene._id as Types.ObjectId;
  await table.save();
  return { table, scene };
}

function connectClient(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    openClients.push(client);
    const timer = setTimeout(() => {
      client.close();
      reject(new Error('Timeout ao conectar socket de teste'));
    }, 8000);
    client.once('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once('connect_error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function onceEvent<T = any>(client: ClientSocket, event: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, handler);
      reject(new Error(`Timeout aguardando evento ${event}`));
    }, timeoutMs);
    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    client.once(event, handler);
  });
}

function emitAck<T = any>(client: ClientSocket, event: string, payload?: unknown, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout aguardando ack de ${event}`)), timeoutMs);
    if (payload === undefined) {
      client.emit(event, (ack: T) => {
        clearTimeout(timer);
        resolve(ack);
      });
      return;
    }
    client.emit(event, payload, (ack: T) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

async function joinTable(client: ClientSocket, tableId: string) {
  const snapshotPromise = onceEvent(client, 'sessionSnapshot');
  const ack = await emitAck(client, 'joinTable', tableId);
  const snapshot = ack?.ok ? await snapshotPromise : null;
  return { ack, snapshot };
}

async function resync(client: ClientSocket, tableId: string) {
  const snapshotPromise = onceEvent(client, 'sessionSnapshot');
  await emitAck(client, 'requestResync', { tableId });
  return snapshotPromise;
}

async function seedRolls(
  tableId: Types.ObjectId,
  userId: Types.ObjectId,
  count: number,
  baseTime = Date.now()
) {
  const docs = Array.from({ length: count }, (_, index) => ({
    userId,
    tableId,
    expression: `1d20+${index}`,
    total: 10 + index,
    modifier: index,
    rolls: [{ die: 20, value: 10, kept: 'kept' as const }],
    revision: index,
    createdAt: new Date(baseTime - index * 60_000),
  }));
  return Roll.insertMany(docs);
}

beforeAll(async () => {
  await connectMongoMemory();
  realtime = createServer();
  await new Promise<void>((resolve) => {
    realtime.server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = realtime.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Não foi possível obter a porta do servidor de teste');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  while (openClients.length) {
    const client = openClients.pop();
    client?.removeAllListeners();
    client?.close();
  }
  resetPresence();
  diceRollRateLimiter.reset();
  await sleep(20);
  await clearMongoMemory();
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    realtime.io.close(() => resolve());
  });
  await new Promise<void>((resolve) => {
    realtime.server.close(() => resolve());
  });
  await disconnectMongoMemory();
});

describe('GET /api/tables/:tableId/rolls', () => {
  it('lista mais recente primeiro, pagina por before e limita a 50', async () => {
    const dm = await createUser('dm-roll-log');
    const player = await createUser('player-roll-log');
    const { table } = await createTableWithScene(dm._id, [player._id]);
    await seedRolls(table._id, player._id, 60);

    const playerToken = signToken(player);
    const page = await request(realtime.app)
      .get(`/api/tables/${table._id}/rolls?limit=5`)
      .set('Authorization', `Bearer ${playerToken}`);
    expect(page.status).toBe(200);
    expect(page.body).toHaveLength(5);
    expect(page.body.map((item: any) => item.expression)).toEqual([
      '1d20+0',
      '1d20+1',
      '1d20+2',
      '1d20+3',
      '1d20+4',
    ]);
    expect(page.body[0]).toMatchObject({
      tableId: table._id.toString(),
      userId: player._id.toString(),
      username: player.username,
      revision: 0,
    });
    expect(typeof page.body[0].id).toBe('string');
    expect(new Date(page.body[0].createdAt).getTime()).toBeGreaterThan(
      new Date(page.body[1].createdAt).getTime()
    );

    const cursor = page.body[4].createdAt;
    const nextPage = await request(realtime.app)
      .get(`/api/tables/${table._id}/rolls?limit=5&before=${encodeURIComponent(cursor)}`)
      .set('Authorization', `Bearer ${playerToken}`);
    expect(nextPage.status).toBe(200);
    expect(nextPage.body).toHaveLength(5);
    expect(nextPage.body.map((item: any) => item.expression)).toEqual([
      '1d20+5',
      '1d20+6',
      '1d20+7',
      '1d20+8',
      '1d20+9',
    ]);

    const capped = await request(realtime.app)
      .get(`/api/tables/${table._id}/rolls?limit=200`)
      .set('Authorization', `Bearer ${playerToken}`);
    expect(capped.status).toBe(200);
    expect(capped.body).toHaveLength(ROLL_LOG_LIMIT);

    const invalidCursor = await request(realtime.app)
      .get(`/api/tables/${table._id}/rolls?before=nao-e-data`)
      .set('Authorization', `Bearer ${playerToken}`);
    expect(invalidCursor.status).toBe(400);
  });

  it('é restrito a membros da mesa', async () => {
    const dm = await createUser('dm-roll-member');
    const player = await createUser('player-roll-member');
    const outsider = await createUser('outsider-roll-member');
    const { table } = await createTableWithScene(dm._id, [player._id]);
    await seedRolls(table._id, dm._id, 3);

    const outsiderResponse = await request(realtime.app)
      .get(`/api/tables/${table._id}/rolls`)
      .set('Authorization', `Bearer ${signToken(outsider)}`);
    expect(outsiderResponse.status).toBe(403);

    const playerResponse = await request(realtime.app)
      .get(`/api/tables/${table._id}/rolls`)
      .set('Authorization', `Bearer ${signToken(player)}`);
    expect(playerResponse.status).toBe(200);
    expect(playerResponse.body).toHaveLength(3);
  });

  it('mantém TTL de 7 dias no índice de createdAt', async () => {
    await Roll.init();
    const indexes = await Roll.collection.indexes();
    const ttlIndex = indexes.find((index) => index.key && (index.key as any).createdAt === 1);
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex?.expireAfterSeconds).toBe(ROLL_LOG_RETENTION_DAYS * 24 * 60 * 60);
  });
});

describe('recentRolls no snapshot e rate limit', () => {
  it('snapshot traz as 50 rolagens mais recentes com username e revisão', async () => {
    const dm = await createUser('dm-roll-snapshot');
    const player = await createUser('player-roll-snapshot');
    const { table } = await createTableWithScene(dm._id, [player._id]);
    await seedRolls(table._id, player._id, 55);

    const client = await connectClient(signToken(dm));
    const { ack, snapshot } = await joinTable(client, table._id.toString());
    expect(ack.ok).toBe(true);
    expect(snapshot.recentRolls).toHaveLength(ROLL_LOG_LIMIT);
    expect(snapshot.recentRolls[0]).toMatchObject({
      expression: '1d20+0',
      username: player.username,
      tableId: table._id.toString(),
      revision: 0,
    });
    expect(snapshot.recentRolls[ROLL_LOG_LIMIT - 1].expression).toBe(`1d20+${ROLL_LOG_LIMIT - 1}`);
  });

  it('rolagem ao vivo persiste com revisão e aparece no resync seguinte', async () => {
    const dm = await createUser('dm-roll-live');
    const player = await createUser('player-roll-live');
    const { table } = await createTableWithScene(dm._id, [player._id]);

    const client = await connectClient(signToken(player));
    await joinTable(client, table._id.toString());

    const diceRolledPromise = onceEvent(client, 'diceRolled');
    const ack = await emitAck(client, 'requestRollDice', {
      tableId: table._id.toString(),
      expression: '2d6+3',
    });
    const diceRolled = await diceRolledPromise;
    expect(ack.ok).toBe(true);
    expect(diceRolled).toMatchObject({
      expression: '2d6+3',
      tableId: table._id.toString(),
      userId: player._id.toString(),
      revision: 0,
    });

    const snapshot = await resync(client, table._id.toString());
    expect(snapshot.recentRolls[0]).toMatchObject({
      expression: '2d6+3',
      total: diceRolled.total,
      userId: player._id.toString(),
      username: player.username,
      revision: 0,
    });

    const stored = await Roll.findOne({ tableId: table._id });
    expect(stored?.expression).toBe('2d6+3');
    expect(stored?.revision).toBe(0);
  });

  it('limita 20 rolagens por 10s por socket e libera após reconectar', async () => {
    const dm = await createUser('dm-roll-rate');
    const player = await createUser('player-roll-rate');
    const { table } = await createTableWithScene(dm._id, [player._id]);

    const client = await connectClient(signToken(player));
    await joinTable(client, table._id.toString());

    for (let index = 0; index < 20; index += 1) {
      const ack = await emitAck(client, 'requestRollDice', {
        tableId: table._id.toString(),
        expression: '1d20',
      });
      expect(ack.ok).toBe(true);
    }

    const limited = await emitAck(client, 'requestRollDice', {
      tableId: table._id.toString(),
      expression: '1d20',
    });
    expect(limited.ok).toBe(false);
    expect(limited.error.code).toBe('RATE_LIMITED');

    client.close();
    await sleep(100);

    const reconnected = await connectClient(signToken(player));
    await joinTable(reconnected, table._id.toString());
    const afterReconnect = await emitAck(reconnected, 'requestRollDice', {
      tableId: table._id.toString(),
      expression: '1d20',
    });
    expect(afterReconnect.ok).toBe(true);
  });
});
