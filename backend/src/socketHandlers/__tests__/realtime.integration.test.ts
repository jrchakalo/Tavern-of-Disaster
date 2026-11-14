import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from '../../server';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import { resetPresence } from '../../services/presenceService';
import { advanceTurn } from '../../services/initiativeService';
import { ServiceError } from '../../services/serviceErrors';
import User from '../../models/User.model';
import Table from '../../models/Table.model';
import Scene from '../../models/Scene.model';
import Token from '../../models/Token.model';
import { randomId } from '../../utils/id';

jest.setTimeout(30000);

process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

type RealtimeServer = ReturnType<typeof createServer>;

let realtime: RealtimeServer;
let baseUrl: string;
let port: number;
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
  return jwt.sign({ user: { id: user._id.toString(), username: user.username } }, process.env.JWT_SECRET as string, {
    expiresIn: '1h',
  });
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

async function createTokenFor(options: {
  tableId: Types.ObjectId;
  sceneId: Types.ObjectId;
  ownerId: Types.ObjectId;
  squareId?: string;
  name?: string;
}) {
  return Token.create({
    tableId: options.tableId,
    sceneId: options.sceneId,
    squareId: options.squareId ?? 'sq-0',
    color: '#ffffff',
    ownerId: options.ownerId,
    name: options.name ?? 'Token',
    movement: 9,
    remainingMovement: 9,
    size: 'Pequeno/Médio',
    canOverlap: false,
  });
}

async function seedInitiative(
  sceneId: Types.ObjectId,
  entries: Array<{ name: string; tokenId?: Types.ObjectId; current?: boolean }>
) {
  const scene = await Scene.findById(sceneId);
  if (!scene) throw new Error('Cena não encontrada no seed');
  scene.initiative.push(
    ...(entries.map((entry) => ({
      characterName: entry.name,
      tokenId: entry.tokenId,
      isCurrentTurn: !!entry.current,
    })) as any)
  );
  scene.turnVersion = (scene.turnVersion ?? 0) + 1;
  await scene.save();
  return scene;
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

function connectClientCaptureError(token: string): Promise<{ error: Error & { data?: { code?: string } } }> {
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
  port = address.port;
  baseUrl = `http://127.0.0.1:${port}`;
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

describe('realtime integration (2+ clients)', () => {
  it('1. joinTable de não membro responde FORBIDDEN e não entrega snapshot', async () => {
    const dm = await createUser('dm-forbidden');
    const outsider = await createUser('outsider');
    const { table } = await createTableWithScene(dm._id, []);

    const client = await connectClient(signToken(outsider));
    const snapshots: unknown[] = [];
    client.on('sessionSnapshot', (payload: unknown) => snapshots.push(payload));

    const ack = await emitAck(client, 'joinTable', table._id.toString());
    expect(ack.ok).toBe(false);
    expect(ack.error.code).toBe('FORBIDDEN');

    await sleep(150);
    expect(snapshots).toHaveLength(0);
  });

  it('2. jogador da mesa A não move token da mesa B (FORBIDDEN, token intacto)', async () => {
    const dmA = await createUser('dm-a');
    const playerA = await createUser('player-a');
    const dmB = await createUser('dm-b');
    const playerB = await createUser('player-b');
    const { table: tableA } = await createTableWithScene(dmA._id, [playerA._id]);
    const { table: tableB, scene: sceneB } = await createTableWithScene(dmB._id, [playerB._id]);
    const tokenB = await createTokenFor({
      tableId: tableB._id,
      sceneId: sceneB._id,
      ownerId: playerB._id,
      squareId: 'sq-0',
    });

    const client = await connectClient(signToken(playerA));
    const { ack: joinAck } = await joinTable(client, tableA._id.toString());
    expect(joinAck.ok).toBe(true);

    const ack = await emitAck(client, 'requestMoveToken', {
      tableId: tableA._id.toString(),
      tokenId: tokenB._id.toString(),
      targetSquareId: 'sq-5',
    });
    expect(ack.ok).toBe(false);
    expect(ack.error.code).toBe('FORBIDDEN');

    const stored = await Token.findById(tokenB._id);
    expect(stored?.squareId).toBe('sq-0');
  });

  it('3. jogador não pode trocar a cena ativa (FORBIDDEN com ack)', async () => {
    const dm = await createUser('dm-scene');
    const player = await createUser('player-scene');
    const { table, scene } = await createTableWithScene(dm._id, [player._id]);

    const client = await connectClient(signToken(player));
    await joinTable(client, table._id.toString());

    const ack = await emitAck(client, 'requestSetActiveScene', {
      tableId: table._id.toString(),
      sceneId: scene._id.toString(),
    });
    expect(ack.ok).toBe(false);
    expect(ack.error.code).toBe('FORBIDDEN');
  });

  it('4. mutação sem callback de ack emite actionError no socket', async () => {
    const dm = await createUser('dm-no-ack');
    const player = await createUser('player-no-ack');
    const { table, scene } = await createTableWithScene(dm._id, [player._id]);

    const client = await connectClient(signToken(player));
    await joinTable(client, table._id.toString());

    const errorPromise = onceEvent(client, 'actionError');
    client.emit('requestSetActiveScene', {
      tableId: table._id.toString(),
      sceneId: scene._id.toString(),
    });
    const payload = await errorPromise;
    expect(payload.event).toBe('requestSetActiveScene');
    expect(payload.error.code).toBe('FORBIDDEN');
    expect(typeof payload.revision).toBe('number');
  });

  it('5. duas mutações sequenciais produzem revisões 1 e 2; snapshot tem revisão 2', async () => {
    const dm = await createUser('dm-revision');
    const { table } = await createTableWithScene(dm._id, []);

    const client = await connectClient(signToken(dm));
    const { ack: joinAck, snapshot } = await joinTable(client, table._id.toString());
    expect(joinAck.ok).toBe(true);
    expect(snapshot.revision).toBe(0);
    expect(snapshot.protocolVersion).toBe(1);
    expect(snapshot.you.role).toBe('DM');
    expect(snapshot.presence.length).toBeGreaterThanOrEqual(1);

    const firstPatchPromise = onceEvent(client, 'sessionPatch');
    const first = await emitAck(client, 'requestUpdateSessionStatus', {
      tableId: table._id.toString(),
      newStatus: 'LIVE',
    });
    const firstPatch = await firstPatchPromise;
    expect(first.ok).toBe(true);
    expect(first.revision).toBe(1);
    expect(firstPatch).toMatchObject({
      protocolVersion: 1,
      tableId: table._id.toString(),
      revision: 1,
      baseRevision: 0,
    });
    expect(firstPatch.changes.sessionStatus.status).toBe('LIVE');

    const second = await emitAck(client, 'requestUpdateSessionStatus', {
      tableId: table._id.toString(),
      newStatus: 'PAUSED',
      pauseSeconds: 30,
    });
    expect(second.ok).toBe(true);
    expect(second.revision).toBe(2);

    const resyncedPromise = onceEvent(client, 'sessionSnapshot');
    const resyncAck = await emitAck(client, 'requestResync', {
      tableId: table._id.toString(),
      sinceRevision: 0,
    });
    const resynced = await resyncedPromise;
    expect(resyncAck.ok).toBe(true);
    expect(resyncAck.revision).toBe(2);
    expect(resynced.revision).toBe(2);
    expect(resynced.table.status).toBe('PAUSED');
  });

  it('6. dois requestNextTurn concorrentes: um ok, um CONFLICT', async () => {
    const dm = await createUser('dm-turn-race');
    const player = await createUser('player-turn-race');
    const { table, scene } = await createTableWithScene(dm._id, [player._id]);
    const token = await createTokenFor({
      tableId: table._id,
      sceneId: scene._id,
      ownerId: player._id,
      squareId: 'sq-0',
      name: 'Herói',
    });
    await seedInitiative(scene._id, [
      { name: 'Herói', tokenId: token._id, current: true },
      { name: 'Inimigo' },
    ]);

    const dmClient = await connectClient(signToken(dm));
    const playerClient = await connectClient(signToken(player));
    expect((await joinTable(dmClient, table._id.toString())).ack.ok).toBe(true);
    expect((await joinTable(playerClient, table._id.toString())).ack.ok).toBe(true);

    const payload = { tableId: table._id.toString(), sceneId: scene._id.toString(), expectedRevision: 0 };
    const [a, b] = await Promise.all([
      emitAck(dmClient, 'requestNextTurn', payload),
      emitAck(playerClient, 'requestNextTurn', payload),
    ]);

    const results = [a, b];
    const okResults = results.filter((result) => result.ok === true);
    const conflictResults = results.filter(
      (result) => result.ok === false && result.error.code === 'CONFLICT'
    );
    expect(okResults).toHaveLength(1);
    expect(conflictResults).toHaveLength(1);

    const updated = await Scene.findById(scene._id);
    const current = updated?.initiative.filter((entry) => entry.isCurrentTurn) ?? [];
    expect(current).toHaveLength(1);
  });

  it('7. jogador não avança turno que não é dele (FORBIDDEN)', async () => {
    const dm = await createUser('dm-turn-owner');
    const owner = await createUser('player-turn-owner');
    const other = await createUser('player-turn-other');
    const { table, scene } = await createTableWithScene(dm._id, [owner._id, other._id]);
    const token = await createTokenFor({
      tableId: table._id,
      sceneId: scene._id,
      ownerId: owner._id,
      name: 'Dono do turno',
    });
    await seedInitiative(scene._id, [
      { name: 'Dono do turno', tokenId: token._id, current: true },
      { name: 'Outro' },
    ]);

    const otherClient = await connectClient(signToken(other));
    await joinTable(otherClient, table._id.toString());

    const ack = await emitAck(otherClient, 'requestNextTurn', {
      tableId: table._id.toString(),
      sceneId: scene._id.toString(),
    });
    expect(ack.ok).toBe(false);
    expect(ack.error.code).toBe('FORBIDDEN');
  });

  it('8. reconexão + requestResync devolve a revisão atual', async () => {
    const dm = await createUser('dm-reconnect');
    const { table } = await createTableWithScene(dm._id, []);
    const token = signToken(dm);

    const firstClient = await connectClient(token);
    await joinTable(firstClient, table._id.toString());
    const mutation = await emitAck(firstClient, 'requestUpdateSessionStatus', {
      tableId: table._id.toString(),
      newStatus: 'LIVE',
    });
    expect(mutation.revision).toBe(1);
    firstClient.close();
    await sleep(100);

    const secondClient = await connectClient(token);
    const { ack: rejoinAck, snapshot: rejoinSnapshot } = await joinTable(secondClient, table._id.toString());
    expect(rejoinAck.ok).toBe(true);
    expect(rejoinSnapshot.revision).toBe(1);

    const snapshotPromise = onceEvent(secondClient, 'sessionSnapshot');
    const ack = await emitAck(secondClient, 'requestResync', {
      tableId: table._id.toString(),
      sinceRevision: 0,
    });
    const snapshot = await snapshotPromise;
    expect(ack.ok).toBe(true);
    expect(ack.revision).toBe(1);
    expect(snapshot.revision).toBe(1);
  });

  it('9. POST /api/auth/refresh devolve token utilizável', async () => {
    await createUser('refresh-user', 'senha123');

    const loginResponse = await request(realtime.app)
      .post('/api/auth/login')
      .send({ email: (await User.findOne({ username: 'refresh-user' }))!.email, password: 'senha123' });
    expect(loginResponse.status).toBe(200);
    expect(typeof loginResponse.body.token).toBe('string');

    const refreshResponse = await request(realtime.app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${loginResponse.body.token}`);
    expect(refreshResponse.status).toBe(200);
    expect(typeof refreshResponse.body.token).toBe('string');
    const decoded = jwt.verify(refreshResponse.body.token, process.env.JWT_SECRET as string) as {
      user: { id: string; username: string };
    };
    expect(decoded.user.username).toBe('refresh-user');

    const client = await connectClient(refreshResponse.body.token);
    expect(client.connected).toBe(true);
  });

  it('10. handshake com token expirado entrega TOKEN_EXPIRED', async () => {
    const dm = await createUser('dm-expired');
    const expiredToken = jwt.sign(
      { user: { id: dm._id.toString(), username: dm.username } },
      process.env.JWT_SECRET as string,
      { expiresIn: '-10s' }
    );

    const { error } = await connectClientCaptureError(expiredToken);
    expect(error.data?.code).toBe('TOKEN_EXPIRED');
  });

  it('12. reorder injetado (entrada desconhecida ou token de outra mesa) é rejeitado sem alterar a iniciativa', async () => {
    const dm = await createUser('dm-reorder');
    const otherDm = await createUser('dm-reorder-other');
    const { table, scene } = await createTableWithScene(dm._id, []);
    await seedInitiative(scene._id, [{ name: 'A' }, { name: 'B' }]);
    const { table: otherTable, scene: otherScene } = await createTableWithScene(otherDm._id, []);
    const foreignToken = await createTokenFor({
      tableId: otherTable._id,
      sceneId: otherScene._id,
      ownerId: otherDm._id,
    });

    const storedScene = await Scene.findById(scene._id);
    const [entryA, entryB] = storedScene!.initiative;
    const entryAId = entryA._id.toString();
    const entryBId = entryB._id.toString();

    const client = await connectClient(signToken(dm));
    await joinTable(client, table._id.toString());

    const unknown = await emitAck(client, 'requestReorderInitiative', {
      tableId: table._id.toString(),
      sceneId: scene._id.toString(),
      newOrder: [{ _id: entryAId, isCurrentTurn: false }, { _id: new Types.ObjectId().toString() }],
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.error.code).toBe('VALIDATION');

    const crossToken = await emitAck(client, 'requestReorderInitiative', {
      tableId: table._id.toString(),
      sceneId: scene._id.toString(),
      newOrder: [
        { _id: entryAId, tokenId: foreignToken._id.toString(), isCurrentTurn: false },
        { _id: entryBId, isCurrentTurn: false },
      ],
    });
    expect(crossToken.ok).toBe(false);
    expect(crossToken.error.code).toBe('VALIDATION');

    const after = await Scene.findById(scene._id);
    expect(after!.initiative.map((entry) => entry._id.toString())).toEqual([entryAId, entryBId]);
    expect(after!.initiative[0].tokenId).toBeUndefined();
    expect(after!.initiative.every((entry) => !entry.isCurrentTurn)).toBe(true);
    expect((await Table.findById(table._id))!.revision).toBe(0);
  });

  it('13. edição de token inclui owner no patch (cliente patch-only vê a troca)', async () => {
    const dm = await createUser('dm-edit-owner');
    const player = await createUser('player-edit-owner');
    const { table, scene } = await createTableWithScene(dm._id, [player._id]);
    const token = await createTokenFor({
      tableId: table._id,
      sceneId: scene._id,
      ownerId: dm._id,
    });

    const client = await connectClient(signToken(dm));
    await joinTable(client, table._id.toString());

    const patchPromise = onceEvent(client, 'sessionPatch');
    const ack = await emitAck(client, 'requestEditToken', {
      tableId: table._id.toString(),
      tokenId: token._id.toString(),
      patch: { ownerId: player._id.toString() },
    });
    const patch = await patchPromise;

    expect(ack.ok).toBe(true);
    expect(patch.changes.tokenUpdates[0].tokenId).toBe(token._id.toString());
    expect(patch.changes.tokenUpdates[0].patch.owner).toEqual({
      _id: player._id.toString(),
      username: player.username,
    });
  });

  it('14. rolagem com ack não emite diceRollError duplicado; sem ack emite', async () => {
    const dm = await createUser('dm-dice');
    const player = await createUser('player-dice');
    const otherDm = await createUser('dm-dice-other');
    const otherPlayer = await createUser('player-dice-other');
    const { table } = await createTableWithScene(dm._id, [player._id]);
    const { table: otherTable, scene: otherScene } = await createTableWithScene(otherDm._id, [otherPlayer._id]);
    const foreignToken = await createTokenFor({
      tableId: otherTable._id,
      sceneId: otherScene._id,
      ownerId: otherPlayer._id,
    });

    const client = await connectClient(signToken(player));
    await joinTable(client, table._id.toString());

    const legacyErrors: unknown[] = [];
    client.on('diceRollError', (payload: unknown) => legacyErrors.push(payload));

    const ack = await emitAck(client, 'requestRollDice', {
      tableId: table._id.toString(),
      expression: '1d20',
      tokenId: foreignToken._id.toString(),
    });
    expect(ack.ok).toBe(false);
    expect(ack.error.code).toBe('FORBIDDEN');
    await sleep(250);
    expect(legacyErrors).toHaveLength(0);

    const legacyErrorPromise = onceEvent(client, 'diceRollError');
    client.emit('requestRollDice', {
      tableId: table._id.toString(),
      expression: '1d20',
      tokenId: foreignToken._id.toString(),
    });
    const legacyError = await legacyErrorPromise;
    expect(typeof legacyError.message).toBe('string');
  });

  it('15. nova rodada limpa persistentes no servidor e preserva auras', async () => {
    const dm = await createUser('dm-round-clear');
    const { table, scene } = await createTableWithScene(dm._id, []);
    const token = await createTokenFor({
      tableId: table._id,
      sceneId: scene._id,
      ownerId: dm._id,
    });
    await seedInitiative(scene._id, [{ name: 'A' }, { name: 'B', current: true }]);

    const client = await connectClient(signToken(dm));
    await joinTable(client, table._id.toString());

    const addMeasurement = await emitAck(client, 'requestAddPersistentMeasurement', {
      tableId: table._id.toString(),
      sceneId: scene._id.toString(),
      payload: {
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        distance: '1,5 m',
        type: 'ruler',
        affectedSquares: ['sq-0'],
        color: '#ff8c00',
      },
    });
    expect(addMeasurement.ok).toBe(true);

    const addAura = await emitAck(client, 'requestUpsertAura', {
      tableId: table._id.toString(),
      sceneId: scene._id.toString(),
      tokenId: token._id.toString(),
      name: 'Aura',
      color: '#ff8c00',
      radiusMeters: 3,
      difficultTerrain: false,
    });
    expect(addAura.ok).toBe(true);

    const beforeSnapshot = await (async () => {
      const promise = onceEvent(client, 'sessionSnapshot');
      await emitAck(client, 'requestResync', { tableId: table._id.toString() });
      return promise;
    })();
    expect(beforeSnapshot.measurements).toHaveLength(1);
    expect(beforeSnapshot.auras).toHaveLength(1);

    const patchPromise = onceEvent(client, 'sessionPatch');
    const nextTurn = await emitAck(client, 'requestNextTurn', {
      tableId: table._id.toString(),
      sceneId: scene._id.toString(),
    });
    const patch = await patchPromise;
    expect(nextTurn.ok).toBe(true);
    expect(patch.changes.measurements).toEqual([]);

    const afterSnapshot = await (async () => {
      const promise = onceEvent(client, 'sessionSnapshot');
      await emitAck(client, 'requestResync', { tableId: table._id.toString() });
      return promise;
    })();
    expect(afterSnapshot.measurements).toHaveLength(0);
    expect(afterSnapshot.auras).toHaveLength(1);
  });

  it('11. expectedRevision divergente responde CONFLICT e não aplica a mutação', async () => {
    const dm = await createUser('dm-expected');
    const { table, scene: firstScene } = await createTableWithScene(dm._id, []);
    const secondScene = await Scene.create({
      tableId: table._id,
      name: 'Cena 2',
      gridWidth: 10,
      gridHeight: 10,
    });
    table.scenes.push(secondScene._id as Types.ObjectId);
    await table.save();

    const client = await connectClient(signToken(dm));
    await joinTable(client, table._id.toString());

    const first = await emitAck(client, 'requestUpdateSessionStatus', {
      tableId: table._id.toString(),
      newStatus: 'LIVE',
    });
    expect(first.revision).toBe(1);

    const stale = await emitAck(client, 'requestSetActiveScene', {
      tableId: table._id.toString(),
      sceneId: secondScene._id.toString(),
      expectedRevision: 0,
    });
    expect(stale.ok).toBe(false);
    expect(stale.error.code).toBe('CONFLICT');

    const stored = await Table.findById(table._id);
    expect(stored?.activeScene?.toString()).toBe(firstScene._id.toString());
  });
});

describe('advanceTurn CAS (turnVersion)', () => {
  it('duas chamadas com a mesma turnVersion: uma vence, outra CONFLICT', async () => {
    const dm = await createUser('dm-cas');
    const { table, scene } = await createTableWithScene(dm._id, []);
    await seedInitiative(scene._id, [{ name: 'A', current: true }, { name: 'B' }]);

    const [sceneA, sceneB] = await Promise.all([Scene.findById(scene._id), Scene.findById(scene._id)]);
    const results = await Promise.allSettled([
      advanceTurn(table as any, sceneA as any, dm._id.toString()),
      advanceTurn(table as any, sceneB as any, dm._id.toString()),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ServiceError);
    expect((rejected[0].reason as ServiceError).status).toBe(409);

    // seedInitiative já levou turnVersion de 0 para 1; só um advanceTurn casou.
    const stored = await Scene.findById(scene._id);
    expect(stored?.turnVersion).toBe(2);
    expect(stored?.initiative.filter((entry) => entry.isCurrentTurn)).toHaveLength(1);
  });
});
