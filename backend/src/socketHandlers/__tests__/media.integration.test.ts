import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from '../../server';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import { resetPresence } from '../../services/presenceService';
import {
  getMediaMaxPeers,
  getMediaPeer,
  joinMediaRoom,
  listMediaPeers,
  resetMediaRooms,
} from '../../services/mediaRoomService';
import {
  mediaSignalRateLimiter,
  mediaSpeakingRateLimiter,
  mediaStateRateLimiter,
} from '../mediaHandlers';
import User from '../../models/User.model';
import Table from '../../models/Table.model';
import Scene from '../../models/Scene.model';
import { randomId } from '../../utils/id';

jest.setTimeout(40000);

process.env.JWT_SECRET = process.env.JWT_SECRET || 'media-integration-secret';

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

async function setupRoom(playerCount = 1) {
  const dm = await createUser(`dm-media-${randomId(4)}`);
  const players = await Promise.all(
    Array.from({ length: playerCount }, (_, index) => createUser(`player-media-${index}-${randomId(4)}`))
  );
  const { table } = await createTableWithScene(
    dm._id,
    players.map((player) => player._id)
  );
  const tableId = table._id.toString();

  const dmClient = await connectClient(signToken(dm));
  await joinTable(dmClient, tableId);
  const dmJoin = await emitAck(dmClient, 'mediaJoin', { tableId });
  expect(dmJoin.ok).toBe(true);

  const playerClients: ClientSocket[] = [];
  for (const player of players) {
    const client = await connectClient(signToken(player));
    await joinTable(client, tableId);
    const ack = await emitAck(client, 'mediaJoin', { tableId });
    expect(ack.ok).toBe(true);
    playerClients.push(client);
  }

  return { dm, players, table, tableId, dmClient, playerClients };
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
  resetMediaRooms();
  mediaSignalRateLimiter.reset();
  mediaStateRateLimiter.reset();
  mediaSpeakingRateLimiter.reset();
  delete process.env.MEDIA_MAX_PEERS;
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

describe('media signaling (2+ clients)', () => {
  it('1. membro entra, recebe os peers existentes e os demais recebem mediaPeerJoined', async () => {
    const dm = await createUser('dm-media-join');
    const player = await createUser('player-media-join');
    const { table } = await createTableWithScene(dm._id, [player._id]);
    const tableId = table._id.toString();

    const dmClient = await connectClient(signToken(dm));
    await joinTable(dmClient, tableId);

    const dmRoomStatePromise = onceEvent(dmClient, 'mediaRoomState');
    const dmJoin = await emitAck(dmClient, 'mediaJoin', { tableId });
    const dmRoomState = await dmRoomStatePromise;
    expect(dmJoin).toMatchObject({ ok: true, revision: 0 });
    expect(dmRoomState).toEqual({ tableId, peers: [] });

    const playerClient = await connectClient(signToken(player));
    await joinTable(playerClient, tableId);

    const peerJoinedPromise = onceEvent(dmClient, 'mediaPeerJoined');
    const playerRoomStatePromise = onceEvent(playerClient, 'mediaRoomState');
    const playerJoin = await emitAck(playerClient, 'mediaJoin', { tableId });
    const playerRoomState = await playerRoomStatePromise;
    const peerJoined = await peerJoinedPromise;

    expect(playerJoin.ok).toBe(true);
    expect(playerRoomState.peers).toHaveLength(1);
    expect(playerRoomState.peers[0]).toMatchObject({
      peerId: dmClient.id,
      userId: dm._id.toString(),
      username: dm.username,
      mediaState: {
        mic: 'muted',
        deafened: false,
        camera: 'off',
        screen: false,
        speaking: false,
      },
    });
    expect(peerJoined).toMatchObject({
      tableId,
      peer: { peerId: playerClient.id, userId: player._id.toString(), username: player.username },
    });
    expect(listMediaPeers(tableId)).toHaveLength(2);

    // Idempotente: reenviar mediaJoin não duplica nem reanuncia o peer.
    const extraJoins = collectEvents(dmClient, 'mediaPeerJoined');
    const rejoinStatePromise = onceEvent(playerClient, 'mediaRoomState');
    const rejoin = await emitAck(playerClient, 'mediaJoin', { tableId });
    const rejoinState = await rejoinStatePromise;
    expect(rejoin.ok).toBe(true);
    expect(rejoinState.peers).toHaveLength(1);
    await sleep(150);
    expect(extraJoins).toHaveLength(0);
    expect(listMediaPeers(tableId)).toHaveLength(2);
  });

  it('2. não-membro e display recebem FORBIDDEN e não ocupam a sala', async () => {
    const dm = await createUser('dm-media-authz');
    const outsider = await createUser('outsider-media-authz');
    const { table } = await createTableWithScene(dm._id, []);
    const tableId = table._id.toString();

    const outsiderClient = await connectClient(signToken(outsider));
    const outsiderAck = await emitAck(outsiderClient, 'mediaJoin', { tableId });
    expect(outsiderAck.ok).toBe(false);
    expect(outsiderAck.error.code).toBe('FORBIDDEN');

    const displayToken = await generateDisplayToken(dm, tableId);
    const displayClient = await connectWithAuth({ displayToken });
    const displayAck = await emitAck(displayClient, 'mediaJoin', { tableId });
    expect(displayAck.ok).toBe(false);
    expect(displayAck.error.code).toBe('FORBIDDEN');
    expect(displayAck.revision).toBe(0);

    expect(listMediaPeers(tableId)).toHaveLength(0);
  });

  it('3. offer/answer/ice chegam só ao peer de destino da mesma mesa', async () => {
    const { dmClient, playerClients, tableId } = await setupRoom(2);
    const [p1, p2] = playerClients;

    const p1Offers = collectEvents(p1, 'mediaOffer');
    const p2Offers = collectEvents(p2, 'mediaOffer');
    const offerAck = await emitAck(dmClient, 'mediaOffer', {
      tableId,
      toPeerId: p1.id,
      sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n',
    });
    expect(offerAck.ok).toBe(true);
    await sleep(150);
    expect(p1Offers).toHaveLength(1);
    expect(p1Offers[0]).toMatchObject({
      tableId,
      fromPeerId: dmClient.id,
      sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n',
    });
    expect(p2Offers).toHaveLength(0);

    const dmAnswers = collectEvents(dmClient, 'mediaAnswer');
    const p2Answers = collectEvents(p2, 'mediaAnswer');
    const answerAck = await emitAck(p1, 'mediaAnswer', {
      tableId,
      toPeerId: dmClient.id,
      sdp: 'v=0\r\nanswer',
    });
    expect(answerAck.ok).toBe(true);
    await sleep(150);
    expect(dmAnswers).toHaveLength(1);
    expect(dmAnswers[0]).toMatchObject({ tableId, fromPeerId: p1.id, sdp: 'v=0\r\nanswer' });
    expect(p2Answers).toHaveLength(0);

    const p1Ice = collectEvents(p1, 'mediaIce');
    const p2Ice = collectEvents(p2, 'mediaIce');
    const candidate = { candidate: 'candidate:1 1 UDP 1 127.0.0.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 };
    const iceAck = await emitAck(dmClient, 'mediaIce', { tableId, toPeerId: p1.id, candidate });
    expect(iceAck.ok).toBe(true);
    await sleep(150);
    expect(p1Ice).toHaveLength(1);
    expect(p1Ice[0]).toMatchObject({ tableId, fromPeerId: dmClient.id, candidate });
    expect(p2Ice).toHaveLength(0);
  });

  it('4. cross-table é bloqueado e não vaza sinal para outra mesa', async () => {
    const { dmClient, tableId } = await setupRoom(1);
    const otherDm = await createUser('dm-media-other');
    const otherPlayer = await createUser('player-media-other');
    const { table: otherTable } = await createTableWithScene(otherDm._id, [otherPlayer._id]);
    const otherTableId = otherTable._id.toString();

    const otherClient = await connectClient(signToken(otherPlayer));
    await joinTable(otherClient, otherTableId);
    expect((await emitAck(otherClient, 'mediaJoin', { tableId: otherTableId })).ok).toBe(true);

    const leaked = collectEvents(otherClient, 'mediaOffer');
    const crossTarget = await emitAck(dmClient, 'mediaOffer', {
      tableId,
      toPeerId: otherClient.id,
      sdp: 'v=0\r\ncross',
    });
    expect(crossTarget.ok).toBe(false);
    expect(crossTarget.error.code).toBe('NOT_FOUND');

    const notJoined = await emitAck(dmClient, 'mediaOffer', {
      tableId: otherTableId,
      toPeerId: otherClient.id,
      sdp: 'v=0\r\ncross',
    });
    expect(notJoined.ok).toBe(false);
    expect(notJoined.error.code).toBe('CONFLICT');

    await sleep(150);
    expect(leaked).toHaveLength(0);
  });

  it('5. SDP acima de 64 KB e candidate acima de 4 KB são rejeitados', async () => {
    const { dmClient, playerClients, tableId } = await setupRoom(1);
    const [p1] = playerClients;
    const offers = collectEvents(p1, 'mediaOffer');
    const ice = collectEvents(p1, 'mediaIce');

    const hugeSdp = await emitAck(dmClient, 'mediaOffer', {
      tableId,
      toPeerId: p1.id,
      sdp: 'x'.repeat(64 * 1024 + 1),
    });
    expect(hugeSdp.ok).toBe(false);
    expect(hugeSdp.error.code).toBe('VALIDATION');

    const hugeCandidate = await emitAck(dmClient, 'mediaIce', {
      tableId,
      toPeerId: p1.id,
      candidate: { candidate: 'x'.repeat(4 * 1024 + 1) },
    });
    expect(hugeCandidate.ok).toBe(false);
    expect(hugeCandidate.error.code).toBe('VALIDATION');

    await sleep(150);
    expect(offers).toHaveLength(0);
    expect(ice).toHaveLength(0);
  });

  it('6. mediaState/mediaSpeaking não incrementam a revisão nem geram sessionPatch', async () => {
    const { dm, dmClient, playerClients, tableId } = await setupRoom(1);
    const [p1] = playerClients;
    const patchesDm = collectEvents(dmClient, 'sessionPatch');
    const patchesP1 = collectEvents(p1, 'sessionPatch');

    const stateOnBoth = onceEvent(dmClient, 'mediaStateUpdated');
    const stateOnP1 = onceEvent(p1, 'mediaStateUpdated');
    const stateAck = await emitAck(dmClient, 'mediaState', {
      tableId,
      mic: 'on',
      deafened: true,
      camera: 'on',
      screen: true,
    });
    expect(stateAck).toMatchObject({ ok: true, revision: 0 });
    const [updateDm, updateP1] = await Promise.all([stateOnBoth, stateOnP1]);
    expect(updateDm).toEqual(updateP1);
    expect(updateDm).toMatchObject({
      tableId,
      peerId: dmClient.id,
      userId: dm._id.toString(),
      mediaState: { mic: 'on', deafened: true, camera: 'on', screen: true, speaking: false },
    });

    const speakingOnBoth = onceEvent(p1, 'mediaStateUpdated');
    const speakingAck = await emitAck(dmClient, 'mediaSpeaking', { tableId, speaking: true });
    expect(speakingAck).toMatchObject({ ok: true, revision: 0 });
    const speakingUpdate = await speakingOnBoth;
    // O indicador de fala preserva mic/deafen/câmera/tela.
    expect(speakingUpdate.mediaState).toEqual({
      mic: 'on',
      deafened: true,
      camera: 'on',
      screen: true,
      speaking: true,
    });

    await sleep(150);
    expect(patchesDm).toHaveLength(0);
    expect(patchesP1).toHaveLength(0);
    expect((await Table.findById(tableId))!.revision).toBe(0);
  });

  it('7. desconexão remove o peer e emite mediaPeerLeft para a sala', async () => {
    const { dmClient, playerClients, tableId } = await setupRoom(1);
    const [p1] = playerClients;
    const dmPeerId = dmClient.id as string;

    const peerLeftPromise = onceEvent(p1, 'mediaPeerLeft');
    dmClient.close();
    const peerLeft = await peerLeftPromise;
    expect(peerLeft).toEqual({ tableId, peerId: dmPeerId, userId: expect.any(String) });
    expect(getMediaPeer(tableId, dmPeerId)).toBeNull();
    expect(listMediaPeers(tableId)).toHaveLength(1);
  });

  it('8. só o DM remove peer da chamada; alvo recebe mediaKicked e mesa é preservada', async () => {
    const { dm, dmClient, players, playerClients, table, tableId } = await setupRoom(1);
    const [p1] = playerClients;
    const [player] = players;
    const playerPeerId = p1.id as string;

    const notDm = await emitAck(p1, 'mediaKick', { tableId, peerId: dmClient.id });
    expect(notDm.ok).toBe(false);
    expect(notDm.error.code).toBe('FORBIDDEN');

    const selfKick = await emitAck(dmClient, 'mediaKick', { tableId, peerId: dmClient.id });
    expect(selfKick.ok).toBe(false);
    expect(selfKick.error.code).toBe('VALIDATION');

    const kickedPromise = onceEvent(p1, 'mediaKicked');
    const leftOnP1 = onceEvent(p1, 'mediaPeerLeft');
    const leftOnDm = onceEvent(dmClient, 'mediaPeerLeft');
    const kickAck = await emitAck(dmClient, 'mediaKick', { tableId, peerId: playerPeerId });
    expect(kickAck.ok).toBe(true);

    const [kicked, leftP1, leftDm] = await Promise.all([kickedPromise, leftOnP1, leftOnDm]);
    expect(kicked).toMatchObject({ tableId, reason: expect.any(String) });
    expect(leftP1).toMatchObject({ tableId, peerId: playerPeerId });
    expect(leftDm).toMatchObject({ tableId, peerId: playerPeerId });
    expect(getMediaPeer(tableId, playerPeerId)).toBeNull();

    // Removido só da mídia: continua na mesa e não pode sinalizar até reentrar.
    const afterKick = await emitAck(p1, 'mediaOffer', {
      tableId,
      toPeerId: dmClient.id,
      sdp: 'v=0',
    });
    expect(afterKick.ok).toBe(false);
    expect(afterKick.error.code).toBe('CONFLICT');

    const stored = await Table.findById(table._id);
    expect(dm._id.toString()).toBe(stored!.dm.toString());
    expect(stored!.players.map((id) => id.toString())).toContain(player._id.toString());
  });

  it('9. respeita o limite MEDIA_MAX_PEERS por mesa', async () => {
    const dm = await createUser('dm-media-limit');
    const { table } = await createTableWithScene(dm._id, []);
    const tableId = table._id.toString();

    expect(getMediaMaxPeers()).toBe(8);
    process.env.MEDIA_MAX_PEERS = '2';
    expect(getMediaMaxPeers()).toBe(2);

    try {
      joinMediaRoom(tableId, { peerId: 'fake-peer-1', userId: dm._id.toString(), username: 'Fake 1' });
      joinMediaRoom(tableId, { peerId: 'fake-peer-2', userId: dm._id.toString(), username: 'Fake 2' });

      const dmClient = await connectClient(signToken(dm));
      await joinTable(dmClient, tableId);
      const full = await emitAck(dmClient, 'mediaJoin', { tableId });
      expect(full.ok).toBe(false);
      expect(full.error.code).toBe('CONFLICT');
      expect(full.error.message).toContain('2');
      expect(listMediaPeers(tableId)).toHaveLength(2);

      // Depois de uma saída há vaga novamente.
      resetMediaRooms();
      const ok = await emitAck(dmClient, 'mediaJoin', { tableId });
      expect(ok.ok).toBe(true);
    } finally {
      delete process.env.MEDIA_MAX_PEERS;
    }
  });

  it('10. limita sinalização (120/10s) e estado de mídia (20/10s) por socket', async () => {
    const { dmClient, playerClients, tableId } = await setupRoom(1);
    const [p1] = playerClients;
    p1.on('mediaIce', () => undefined);
    p1.on('mediaStateUpdated', () => undefined);

    for (let index = 0; index < 120; index += 1) {
      const ack = await emitAck(dmClient, 'mediaIce', {
        tableId,
        toPeerId: p1.id,
        candidate: { candidate: `candidate:${index}` },
      });
      expect(ack.ok).toBe(true);
    }
    const limitedSignal = await emitAck(dmClient, 'mediaIce', {
      tableId,
      toPeerId: p1.id,
      candidate: { candidate: 'candidate:limited' },
    });
    expect(limitedSignal.ok).toBe(false);
    expect(limitedSignal.error.code).toBe('RATE_LIMITED');

    for (let index = 0; index < 20; index += 1) {
      const ack = await emitAck(dmClient, 'mediaState', {
        tableId,
        mic: index % 2 === 0 ? 'on' : 'muted',
        deafened: false,
        camera: 'off',
        screen: false,
      });
      expect(ack.ok).toBe(true);
    }
    const limitedState = await emitAck(dmClient, 'mediaState', {
      tableId,
      mic: 'on',
      deafened: false,
      camera: 'off',
      screen: false,
    });
    expect(limitedState.ok).toBe(false);
    expect(limitedState.error.code).toBe('RATE_LIMITED');
  });
});
