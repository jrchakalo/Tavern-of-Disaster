import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from '../../server';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import { resetPresence } from '../../services/presenceService';
import { CHAT_HISTORY_LIMIT, CHAT_RETENTION_DAYS } from '../../services/chatService';
import { chatRateLimiter } from '../chatHandlers';
import User from '../../models/User.model';
import Table from '../../models/Table.model';
import Scene from '../../models/Scene.model';
import ChatMessage from '../../models/ChatMessage.model';
import { randomId } from '../../utils/id';

jest.setTimeout(40000);

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chat-integration-secret';

type RealtimeServer = ReturnType<typeof createServer>;
type SocketAuth = { token?: string; displayToken?: string };

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

function connectClient(token: string): Promise<ClientSocket> {
  return connectWithAuth({ token });
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

function collectEvents<T = any>(client: ClientSocket, event: string): T[] {
  const received: T[] = [];
  client.on(event, (payload: T) => received.push(payload));
  return received;
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
    throw new Error(`Falha ao gerar token de display: ${response.status}`);
  }
  return response.body.token as string;
}

async function seedMessages(
  tableId: Types.ObjectId,
  userId: Types.ObjectId,
  username: string,
  count: number
) {
  const baseTime = Date.now();
  const docs = Array.from({ length: count }, (_, index) => ({
    tableId,
    userId,
    username,
    text: `mensagem-${index}`,
    mentions: [],
    kind: 'user' as const,
    createdAt: new Date(baseTime - index * 60_000),
  }));
  return ChatMessage.insertMany(docs);
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
  chatRateLimiter.reset();
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

describe('chat (2+ clients)', () => {
  it('1. mensagem é transmitida a ambos, persistida e não incrementa revision', async () => {
    const dm = await createUser('dm-chat-broadcast');
    const player = await createUser('player-chat-broadcast');
    const { table } = await createTableWithScene(dm._id, [player._id]);
    const tableId = table._id.toString();

    const dmClient = await connectClient(signToken(dm));
    const playerClient = await connectClient(signToken(player));
    await joinTable(dmClient, tableId);
    await joinTable(playerClient, tableId);

    const dmPatches = collectEvents(dmClient, 'sessionPatch');
    const receivedOnDm = onceEvent(dmClient, 'chatMessage');
    const receivedOnPlayer = onceEvent(playerClient, 'chatMessage');

    const ack = await emitAck(dmClient, 'requestSendChatMessage', {
      tableId,
      text: '  Olá, @todos!  ',
      mentions: ['todos'],
    });
    expect(ack).toMatchObject({ ok: true, revision: 0 });

    const [onDm, onPlayer] = await Promise.all([receivedOnDm, receivedOnPlayer]);
    expect(onDm).toEqual(onPlayer);
    expect(onDm).toMatchObject({
      tableId,
      userId: dm._id.toString(),
      username: dm.username,
      text: 'Olá, @todos!',
      mentions: ['todos'],
      kind: 'user',
    });
    expect(typeof onDm.id).toBe('string');
    expect(new Date(onDm.createdAt).toISOString()).toBe(onDm.createdAt);

    const stored = await ChatMessage.findOne({ tableId: table._id });
    expect(stored?.text).toBe('Olá, @todos!');
    expect(stored?.userId.toString()).toBe(dm._id.toString());
    expect(stored?.mentions).toEqual(['todos']);
    expect(stored?.kind).toBe('user');

    await sleep(150);
    expect(dmPatches).toHaveLength(0);
    expect((await Table.findById(table._id))!.revision).toBe(0);

    // O histórico REST devolve a mesma mensagem para qualquer membro.
    const history = await request(realtime.app)
      .get(`/api/tables/${tableId}/chat`)
      .set('Authorization', `Bearer ${signToken(player)}`);
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({
      id: onDm.id,
      tableId,
      userId: dm._id.toString(),
      username: dm.username,
      text: 'Olá, @todos!',
      mentions: ['todos'],
      kind: 'user',
    });
  });

  it('2. authz: não-membro e display não enviam; histórico exige membro', async () => {
    const dm = await createUser('dm-chat-authz');
    const outsider = await createUser('outsider-chat-authz');
    const { table } = await createTableWithScene(dm._id, []);
    const tableId = table._id.toString();

    const outsiderClient = await connectClient(signToken(outsider));
    const outsiderAck = await emitAck(outsiderClient, 'requestSendChatMessage', {
      tableId,
      text: 'invasão',
    });
    expect(outsiderAck.ok).toBe(false);
    expect(outsiderAck.error.code).toBe('FORBIDDEN');

    const displayToken = await generateDisplayToken(dm, tableId);
    const displayClient = await connectWithAuth({ displayToken });
    const displayAck = await emitAck(displayClient, 'requestSendChatMessage', {
      tableId,
      text: 'TV fala',
    });
    expect(displayAck.ok).toBe(false);
    expect(displayAck.error.code).toBe('FORBIDDEN');
    expect(displayAck.revision).toBe(0);

    expect(await ChatMessage.countDocuments({ tableId: table._id })).toBe(0);

    const outsiderHistory = await request(realtime.app)
      .get(`/api/tables/${tableId}/chat`)
      .set('Authorization', `Bearer ${signToken(outsider)}`);
    expect(outsiderHistory.status).toBe(403);

    const anonymous = await request(realtime.app).get(`/api/tables/${tableId}/chat`);
    expect(anonymous.status).toBe(401);

    const memberHistory = await request(realtime.app)
      .get(`/api/tables/${tableId}/chat`)
      .set('Authorization', `Bearer ${signToken(dm)}`);
    expect(memberHistory.status).toBe(200);
    expect(memberHistory.body).toEqual([]);
  });

  it('3. histórico vem do mais recente para o mais antigo, pagina por before e limita a 50', async () => {
    const dm = await createUser('dm-chat-history');
    const player = await createUser('player-chat-history');
    const { table } = await createTableWithScene(dm._id, [player._id]);
    const tableId = table._id.toString();
    await seedMessages(table._id, player._id, player.username, 60);

    const playerToken = signToken(player);
    const firstPage = await request(realtime.app)
      .get(`/api/tables/${tableId}/chat?limit=5`)
      .set('Authorization', `Bearer ${playerToken}`);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body).toHaveLength(5);
    expect(firstPage.body.map((item: any) => item.text)).toEqual([
      'mensagem-0',
      'mensagem-1',
      'mensagem-2',
      'mensagem-3',
      'mensagem-4',
    ]);
    expect(firstPage.body[0]).toMatchObject({
      tableId,
      userId: player._id.toString(),
      username: player.username,
      kind: 'user',
      mentions: [],
    });
    expect(typeof firstPage.body[0].id).toBe('string');

    const cursor = firstPage.body[4].createdAt;
    const nextPage = await request(realtime.app)
      .get(`/api/tables/${tableId}/chat?limit=5&before=${encodeURIComponent(cursor)}`)
      .set('Authorization', `Bearer ${playerToken}`);
    expect(nextPage.status).toBe(200);
    expect(nextPage.body.map((item: any) => item.text)).toEqual([
      'mensagem-5',
      'mensagem-6',
      'mensagem-7',
      'mensagem-8',
      'mensagem-9',
    ]);

    const defaultPage = await request(realtime.app)
      .get(`/api/tables/${tableId}/chat`)
      .set('Authorization', `Bearer ${playerToken}`);
    expect(defaultPage.status).toBe(200);
    expect(defaultPage.body).toHaveLength(CHAT_HISTORY_LIMIT);

    const overLimit = await request(realtime.app)
      .get(`/api/tables/${tableId}/chat?limit=101`)
      .set('Authorization', `Bearer ${playerToken}`);
    expect(overLimit.status).toBe(400);

    const invalidCursor = await request(realtime.app)
      .get(`/api/tables/${tableId}/chat?before=nao-e-data`)
      .set('Authorization', `Bearer ${playerToken}`);
    expect(invalidCursor.status).toBe(400);
  });

  it('4. TTL de 7 dias no índice de createdAt', async () => {
    await ChatMessage.init();
    const indexes = await ChatMessage.collection.indexes();
    const ttlIndex = indexes.find((index) => index.key && (index.key as any).createdAt === 1);
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex?.expireAfterSeconds).toBe(CHAT_RETENTION_DAYS * 24 * 60 * 60);

    const tableIndex = indexes.find(
      (index) => index.key && (index.key as any).tableId === 1 && (index.key as any).createdAt === -1
    );
    expect(tableIndex).toBeDefined();
  });

  it('5. limita 10 mensagens por 10s, valida texto/menções e não incrementa revision', async () => {
    const dm = await createUser('dm-chat-rate');
    const { table } = await createTableWithScene(dm._id, []);
    const tableId = table._id.toString();

    const client = await connectClient(signToken(dm));
    await joinTable(client, tableId);

    for (let index = 0; index < 10; index += 1) {
      const ack = await emitAck(client, 'requestSendChatMessage', {
        tableId,
        text: `mensagem ${index}`,
      });
      expect(ack.ok).toBe(true);
      expect(ack.revision).toBe(0);
    }

    const limited = await emitAck(client, 'requestSendChatMessage', {
      tableId,
      text: 'mensagem bloqueada',
    });
    expect(limited.ok).toBe(false);
    expect(limited.error.code).toBe('RATE_LIMITED');
    expect(await ChatMessage.countDocuments({ tableId: table._id })).toBe(10);

    // Depois de reconectar o socket tem um orçamento novo.
    client.close();
    await sleep(100);
    const reconnected = await connectClient(signToken(dm));
    await joinTable(reconnected, tableId);

    const empty = await emitAck(reconnected, 'requestSendChatMessage', { tableId, text: '   ' });
    expect(empty.ok).toBe(false);
    expect(empty.error.code).toBe('VALIDATION');

    const tooLong = await emitAck(reconnected, 'requestSendChatMessage', {
      tableId,
      text: 'x'.repeat(1001),
    });
    expect(tooLong.ok).toBe(false);
    expect(tooLong.error.code).toBe('VALIDATION');

    const tooManyMentions = await emitAck(reconnected, 'requestSendChatMessage', {
      tableId,
      text: 'oi',
      mentions: Array.from({ length: 11 }, (_, index) => `user-${index}`),
    });
    expect(tooManyMentions.ok).toBe(false);
    expect(tooManyMentions.error.code).toBe('VALIDATION');

    const okAgain = await emitAck(reconnected, 'requestSendChatMessage', {
      tableId,
      text: 'mensagem após reconectar',
    });
    expect(okAgain.ok).toBe(true);
    expect((await Table.findById(table._id))!.revision).toBe(0);
  });
});
