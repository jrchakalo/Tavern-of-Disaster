import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from '../../server';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import { resetPresence } from '../../services/presenceService';
import { resolveDisplayToken } from '../../services/displayTokenService';
import User from '../../models/User.model';
import Table from '../../models/Table.model';
import Scene from '../../models/Scene.model';
import Token from '../../models/Token.model';
import { randomId } from '../../utils/id';

jest.setTimeout(30000);

process.env.JWT_SECRET = process.env.JWT_SECRET || 'display-integration-secret';

type RealtimeServer = ReturnType<typeof createServer>;
type SocketAuth = { token?: string; displayToken?: string };

let realtime: RealtimeServer;
let baseUrl: string;
const openClients: ClientSocket[] = [];

const GRID_WIDTH = 10;
const GRID_HEIGHT = 10;

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
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
  });
  table.scenes = [scene._id as Types.ObjectId];
  table.activeScene = scene._id as Types.ObjectId;
  await table.save();
  return { table, scene };
}

async function createTokenFor(options: {
  tableId: Types.ObjectId;
  sceneId: Types.ObjectId;
  ownerId: Types.ObjectId;
  squareId?: string;
}) {
  return Token.create({
    tableId: options.tableId,
    sceneId: options.sceneId,
    squareId: options.squareId ?? 'sq-0',
    color: '#ffffff',
    ownerId: options.ownerId,
    name: 'Token',
    movement: 9,
    remainingMovement: 9,
    size: 'Pequeno/Médio',
    canOverlap: false,
  });
}

function connectWithAuth(auth: SocketAuth): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(baseUrl, {
      auth,
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

function connectCaptureError(auth: SocketAuth): Promise<{ error: Error & { data?: { code?: string } } }> {
  return new Promise((resolve, reject) => {
    const client = ioClient(baseUrl, {
      auth,
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    openClients.push(client);
    const timer = setTimeout(() => {
      client.close();
      reject(new Error('Timeout aguardando connect_error'));
    }, 8000);
    client.once('connect', () => {
      clearTimeout(timer);
      client.close();
      reject(new Error('Conexão inesperadamente aceita'));
    });
    client.once('connect_error', (error: Error & { data?: { code?: string } }) => {
      clearTimeout(timer);
      client.close();
      resolve({ error });
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

async function generateDisplayToken(dm: { _id: Types.ObjectId; username: string }, tableId: string) {
  const response = await request(realtime.app)
    .post(`/api/tables/${tableId}/display-token`)
    .set('Authorization', `Bearer ${signToken(dm)}`);
  if (response.status !== 200) {
    throw new Error(`Falha ao gerar token de display: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.token as string;
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
  await sleep(20);
  await clearMongoMemory();
  delete process.env.PUBLIC_APP_URL;
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

describe('display token REST', () => {
  it('1. DM gera token; texto claro não é persistido; hash confere', async () => {
    const dm = await createUser('dm-display-generate');
    const player = await createUser('player-display-generate');
    const { table } = await createTableWithScene(dm._id, [player._id]);

    const response = await request(realtime.app)
      .post(`/api/tables/${table._id}/display-token`)
      .set('Authorization', `Bearer ${signToken(dm)}`);

    expect(response.status).toBe(200);
    expect(typeof response.body.token).toBe('string');
    expect(response.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.body.displayUrl).toContain(`/display/${table._id}#token=${response.body.token}`);

    const stored = await Table.findById(table._id).select('+displayTokenHash');
    const expectedHash = createHash('sha256').update(response.body.token).digest('hex');
    expect(stored?.displayTokenHash).toBe(expectedHash);
    expect(stored?.displayTokenHash).not.toBe(response.body.token);
    expect(stored?.displayTokenRotatedAt).toBeInstanceOf(Date);

    // O hash não pode vazar nas respostas REST que serializam a mesa.
    const listed = await request(realtime.app)
      .get('/api/tables/mytables')
      .set('Authorization', `Bearer ${signToken(player)}`);
    expect(listed.status).toBe(200);
    const serialized = JSON.stringify(listed.body);
    expect(serialized).not.toContain(response.body.token);
    expect(serialized).not.toContain(expectedHash);

    const forbidden = await request(realtime.app)
      .post(`/api/tables/${table._id}/display-token`)
      .set('Authorization', `Bearer ${signToken(player)}`);
    expect(forbidden.status).toBe(403);
  });

  it('1b. displayUrl usa a origem de PUBLIC_APP_URL quando configurada', async () => {
    const dm = await createUser('dm-display-origin');
    const { table } = await createTableWithScene(dm._id, []);
    process.env.PUBLIC_APP_URL = 'https://tv.example.com/algum/path';

    const response = await request(realtime.app)
      .post(`/api/tables/${table._id}/display-token`)
      .set('Authorization', `Bearer ${signToken(dm)}`);

    expect(response.status).toBe(200);
    expect(response.body.displayUrl).toBe(
      `https://tv.example.com/display/${table._id}#token=${response.body.token}`
    );
  });

  it('2. rotacionar invalida o token anterior', async () => {
    const dm = await createUser('dm-display-rotate');
    const { table } = await createTableWithScene(dm._id, []);
    const tableId = table._id.toString();

    const first = await generateDisplayToken(dm, tableId);
    const secondResponse = await request(realtime.app)
      .post(`/api/tables/${tableId}/display-token`)
      .set('Authorization', `Bearer ${signToken(dm)}`);
    const second = secondResponse.body.token as string;

    expect(second).not.toBe(first);
    expect(await resolveDisplayToken(first)).toBeNull();
    expect(await resolveDisplayToken(second)).toEqual({ tableId });

    const stored = await Table.findById(table._id).select('+displayTokenHash');
    expect(stored?.displayTokenHash).toBe(createHash('sha256').update(second).digest('hex'));

    // Handshake com o token antigo é recusado.
    const { error } = await connectCaptureError({ displayToken: first });
    expect(error.data?.code).toBe('UNAUTHENTICATED');
  });

  it('3. revogar invalida o token e derruba novas conexões da TV', async () => {
    const dm = await createUser('dm-display-revoke');
    const player = await createUser('player-display-revoke');
    const { table } = await createTableWithScene(dm._id, [player._id]);
    const tableId = table._id.toString();
    const token = await generateDisplayToken(dm, tableId);

    const playerAttempt = await request(realtime.app)
      .delete(`/api/tables/${tableId}/display-token`)
      .set('Authorization', `Bearer ${signToken(player)}`);
    expect(playerAttempt.status).toBe(403);

    const revoked = await request(realtime.app)
      .delete(`/api/tables/${tableId}/display-token`)
      .set('Authorization', `Bearer ${signToken(dm)}`);
    expect(revoked.status).toBe(204);

    const stored = await Table.findById(table._id).select('+displayTokenHash');
    expect(stored?.displayTokenHash).toBeNull();
    expect(await resolveDisplayToken(token)).toBeNull();

    const { error } = await connectCaptureError({ displayToken: token });
    expect(error.data?.code).toBe('UNAUTHENTICATED');
  });
});

describe('display socket (read-only)', () => {
  it('4. display entra na mesa certa com snapshot DISPLAY e permissions=[]', async () => {
    const dm = await createUser('dm-display-socket');
    const { table } = await createTableWithScene(dm._id, []);
    const tableId = table._id.toString();
    const token = await generateDisplayToken(dm, tableId);

    const display = await connectWithAuth({ displayToken: token });
    const { ack, snapshot } = await joinTable(display, tableId);

    expect(ack.ok).toBe(true);
    expect(snapshot.you).toEqual({
      userId: `display:${tableId}`,
      username: 'TV',
      role: 'DISPLAY',
      permissions: [],
    });
    expect(snapshot.tableId).toBe(tableId);
    expect(snapshot.presence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: `display:${tableId}`, username: 'TV', role: 'DISPLAY' }),
      ])
    );
  });

  it('5. display não muta, não entra em outra mesa e não altera a revisão', async () => {
    const dm = await createUser('dm-display-readonly');
    const player = await createUser('player-display-readonly');
    const otherDm = await createUser('dm-display-other');
    const { table, scene } = await createTableWithScene(dm._id, [player._id]);
    const { table: otherTable } = await createTableWithScene(otherDm._id, []);
    const tableId = table._id.toString();
    const sceneId = scene._id.toString();
    const token = await createTokenFor({
      tableId: table._id,
      sceneId: scene._id,
      ownerId: player._id,
    });
    const displayToken = await generateDisplayToken(dm, tableId);

    const display = await connectWithAuth({ displayToken });
    await joinTable(display, tableId);

    const attempts: Array<{ event: string; payload: Record<string, unknown> }> = [
      {
        event: 'requestPlaceToken',
        payload: { tableId, sceneId, squareId: 'sq-1', name: 'Invasor', size: 'Pequeno/Médio' },
      },
      {
        event: 'requestMoveToken',
        payload: { tableId, tokenId: token._id.toString(), targetSquareId: 'sq-2' },
      },
      { event: 'requestNextTurn', payload: { tableId, sceneId } },
      { event: 'requestSetActiveScene', payload: { tableId, sceneId } },
      { event: 'requestPing', payload: { tableId, sceneId, x: 1, y: 1 } },
      { event: 'requestRollDice', payload: { tableId, expression: '1d20' } },
    ];

    for (const attempt of attempts) {
      const ack = await emitAck(display, attempt.event, attempt.payload);
      expect(ack.ok).toBe(false);
      expect(ack.error.code).toBe('FORBIDDEN');
      expect(ack.error.message).toBe('A TV é somente leitura.');
    }

    const snapshotsOfOtherTable: unknown[] = [];
    display.on('sessionSnapshot', (payload: any) => {
      if (payload?.tableId === otherTable._id.toString()) snapshotsOfOtherTable.push(payload);
    });
    const otherJoin = await emitAck(display, 'joinTable', otherTable._id.toString());
    expect(otherJoin.ok).toBe(false);
    expect(otherJoin.error.code).toBe('FORBIDDEN');
    await sleep(150);
    expect(snapshotsOfOtherTable).toHaveLength(0);

    const storedTable = await Table.findById(table._id);
    const storedToken = await Token.findById(token._id);
    expect(storedTable?.revision).toBe(0);
    expect(storedTable?.activeScene?.toString()).toBe(sceneId);
    expect(storedToken?.squareId).toBe('sq-0');
  });

  it('5b. display sem callback de ack recebe actionError FORBIDDEN', async () => {
    const dm = await createUser('dm-display-no-ack');
    const { table, scene } = await createTableWithScene(dm._id, []);
    const tableId = table._id.toString();
    const displayToken = await generateDisplayToken(dm, tableId);

    const display = await connectWithAuth({ displayToken });
    await joinTable(display, tableId);

    const errorPromise = onceEvent(display, 'actionError');
    display.emit('requestPing', { tableId, sceneId: scene._id.toString(), x: 1, y: 1 });
    const payload = await errorPromise;

    expect(payload.event).toBe('requestPing');
    expect(payload.error.code).toBe('FORBIDDEN');
    expect(payload.error.message).toBe('A TV é somente leitura.');
    expect(payload.revision).toBe(0);
  });

  it('7. display não ressincroniza outra mesa', async () => {
    const dm = await createUser('dm-display-resync');
    const otherDm = await createUser('dm-display-resync-other');
    const { table } = await createTableWithScene(dm._id, []);
    const { table: otherTable } = await createTableWithScene(otherDm._id, []);
    const tableId = table._id.toString();
    const token = await generateDisplayToken(dm, tableId);

    const display = await connectWithAuth({ displayToken: token });
    await joinTable(display, tableId);

    const forbidden = await emitAck(display, 'requestResync', { tableId: otherTable._id.toString() });
    expect(forbidden.ok).toBe(false);
    expect(forbidden.error.code).toBe('FORBIDDEN');

    const snapshotPromise = onceEvent(display, 'sessionSnapshot');
    const own = await emitAck(display, 'requestResync', { tableId });
    const snapshot = await snapshotPromise;
    expect(own.ok).toBe(true);
    expect(snapshot.you.role).toBe('DISPLAY');
    expect(snapshot.you.permissions).toEqual([]);
  });

  it('8. token de display inválido no handshake entrega UNAUTHENTICATED', async () => {
    const { error } = await connectCaptureError({ displayToken: 'token-invalido' });
    expect(error.data?.code).toBe('UNAUTHENTICATED');
  });
});

describe('ping em coordenadas de grade', () => {
  it('6a. ping válido chega a 2 clientes com o mesmo x/y de grade', async () => {
    const dm = await createUser('dm-ping-grid');
    const player = await createUser('player-ping-grid');
    const { table, scene } = await createTableWithScene(dm._id, [player._id]);
    const tableId = table._id.toString();
    const sceneId = scene._id.toString();

    const dmClient = await connectWithAuth({ token: signToken(dm) });
    const playerClient = await connectWithAuth({ token: signToken(player) });
    expect((await joinTable(dmClient, tableId)).ack.ok).toBe(true);
    expect((await joinTable(playerClient, tableId)).ack.ok).toBe(true);

    const dmPingPromise = onceEvent(dmClient, 'pingBroadcast');
    const playerPingPromise = onceEvent(playerClient, 'pingBroadcast');
    const ack = await emitAck(playerClient, 'requestPing', {
      tableId,
      sceneId,
      x: 2.5,
      y: 3.25,
      color: '#ff8c00',
    });

    const [dmPing, playerPing] = await Promise.all([dmPingPromise, playerPingPromise]);
    expect(ack.ok).toBe(true);
    expect(ack.revision).toBe(0);
    expect(dmPing.x).toBe(2.5);
    expect(dmPing.y).toBe(3.25);
    expect(playerPing.x).toBe(2.5);
    expect(playerPing.y).toBe(3.25);
    expect(dmPing.revision).toBe(0);
    expect(playerPing.revision).toBe(0);
  });

  it('6b. ping fora do grid retorna VALIDATION e não faz broadcast', async () => {
    const dm = await createUser('dm-ping-invalid');
    const player = await createUser('player-ping-invalid');
    const { table, scene } = await createTableWithScene(dm._id, [player._id]);
    const tableId = table._id.toString();
    const sceneId = scene._id.toString();

    const dmClient = await connectWithAuth({ token: signToken(dm) });
    const playerClient = await connectWithAuth({ token: signToken(player) });
    await joinTable(dmClient, tableId);
    await joinTable(playerClient, tableId);

    const received: unknown[] = [];
    const handler = (payload: unknown) => received.push(payload);
    dmClient.on('pingBroadcast', handler);

    const outsideX = await emitAck(playerClient, 'requestPing', {
      tableId,
      sceneId,
      x: GRID_WIDTH + 0.5,
      y: 1,
    });
    expect(outsideX.ok).toBe(false);
    expect(outsideX.error.code).toBe('VALIDATION');

    const outsideY = await emitAck(playerClient, 'requestPing', {
      tableId,
      sceneId,
      x: 1,
      y: -0.1,
    });
    expect(outsideY.ok).toBe(false);
    expect(outsideY.error.code).toBe('VALIDATION');

    await sleep(200);
    dmClient.off('pingBroadcast', handler);
    expect(received).toHaveLength(0);
  });

  it('6c. ping respeita o limite exato do grid (x=width, y=height)', async () => {
    const dm = await createUser('dm-ping-boundary');
    const { table, scene } = await createTableWithScene(dm._id, []);
    const tableId = table._id.toString();
    const sceneId = scene._id.toString();

    const dmClient = await connectWithAuth({ token: signToken(dm) });
    await joinTable(dmClient, tableId);

    const pingPromise = onceEvent(dmClient, 'pingBroadcast');
    const ack = await emitAck(dmClient, 'requestPing', {
      tableId,
      sceneId,
      x: GRID_WIDTH,
      y: GRID_HEIGHT,
    });
    const ping = await pingPromise;
    expect(ack.ok).toBe(true);
    expect(ping.x).toBe(GRID_WIDTH);
    expect(ping.y).toBe(GRID_HEIGHT);
  });
});
