import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { createServer } from '../../server';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import User from '../../models/User.model';
import Table from '../../models/Table.model';
import { randomId } from '../../utils/id';

jest.setTimeout(30000);

process.env.JWT_SECRET = process.env.JWT_SECRET || 'media-routes-secret';

type RealtimeServer = ReturnType<typeof createServer>;

let realtime: RealtimeServer;

const ENV_KEYS = ['STUN_URLS', 'TURN_URLS', 'TURN_URL', 'TURN_USERNAME', 'TURN_CREDENTIAL', 'MEDIA_MAX_PEERS'];
const originalEnv: Record<string, string | undefined> = {};

function clearMediaEnv() {
  ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
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

async function createTable(dmId: Types.ObjectId, playerIds: Types.ObjectId[] = []) {
  return Table.create({
    name: `Mesa ${randomId(4)}`,
    dm: dmId,
    players: [dmId, ...playerIds],
    inviteCode: randomId(8),
    scenes: [],
  });
}

beforeAll(async () => {
  ENV_KEYS.forEach((key) => {
    originalEnv[key] = process.env[key];
  });
  clearMediaEnv();
  await connectMongoMemory();
  realtime = createServer();
});

beforeEach(() => {
  clearMediaEnv();
});

afterEach(async () => {
  clearMediaEnv();
  await clearMongoMemory();
});

afterAll(async () => {
  clearMediaEnv();
  ENV_KEYS.forEach((key) => {
    if (originalEnv[key] !== undefined) {
      process.env[key] = originalEnv[key];
    } else {
      delete process.env[key];
    }
  });
  await new Promise<void>((resolve) => {
    realtime.io.close(() => resolve());
  });
  await new Promise<void>((resolve) => {
    realtime.server.close(() => resolve());
  });
  await disconnectMongoMemory();
});

describe('GET /api/tables/:tableId/ice-servers', () => {
  it('1. exige autenticação e vínculo com a mesa', async () => {
    const dm = await createUser('dm-ice-authz');
    const player = await createUser('player-ice-authz');
    const outsider = await createUser('outsider-ice-authz');
    const table = await createTable(dm._id, [player._id]);
    const tableId = table._id.toString();

    const anonymous = await request(realtime.app).get(`/api/tables/${tableId}/ice-servers`);
    expect(anonymous.status).toBe(401);

    const outsiderResponse = await request(realtime.app)
      .get(`/api/tables/${tableId}/ice-servers`)
      .set('Authorization', `Bearer ${signToken(outsider)}`);
    expect(outsiderResponse.status).toBe(403);

    const playerResponse = await request(realtime.app)
      .get(`/api/tables/${tableId}/ice-servers`)
      .set('Authorization', `Bearer ${signToken(player)}`);
    expect(playerResponse.status).toBe(200);

    const dmResponse = await request(realtime.app)
      .get(`/api/tables/${tableId}/ice-servers`)
      .set('Authorization', `Bearer ${signToken(dm)}`);
    expect(dmResponse.status).toBe(200);

    const invalidId = await request(realtime.app)
      .get('/api/tables/nao-e-mesa/ice-servers')
      .set('Authorization', `Bearer ${signToken(player)}`);
    expect(invalidId.status).toBe(400);

    const missing = await request(realtime.app)
      .get(`/api/tables/${new Types.ObjectId().toString()}/ice-servers`)
      .set('Authorization', `Bearer ${signToken(player)}`);
    expect(missing.status).toBe(404);
  });

  it('2. sem TURN devolve STUN público padrão e turnConfigured=false', async () => {
    const dm = await createUser('dm-ice-default');
    const table = await createTable(dm._id);

    const response = await request(realtime.app)
      .get(`/api/tables/${table._id}/ice-servers`)
      .set('Authorization', `Bearer ${signToken(dm)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
      ttlSeconds: 3600,
      mode: 'mesh',
      turnConfigured: false,
      maxPeers: 8,
    });
  });

  it('3. STUN_URLS/TURN_URLS em CSV configuram TURN e respeitam MEDIA_MAX_PEERS', async () => {
    const dm = await createUser('dm-ice-turn');
    const table = await createTable(dm._id);
    process.env.STUN_URLS = 'stun:stun-a.example:3478, stun:stun-b.example:3478';
    process.env.TURN_URLS = 'turn:turn.example:443?transport=tcp, turn:turn.example:443';
    process.env.TURN_USERNAME = 'tavern-user';
    process.env.TURN_CREDENTIAL = 'super-secret';
    process.env.MEDIA_MAX_PEERS = '5';

    const response = await request(realtime.app)
      .get(`/api/tables/${table._id}/ice-servers`)
      .set('Authorization', `Bearer ${signToken(dm)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      iceServers: [
        { urls: ['stun:stun-a.example:3478', 'stun:stun-b.example:3478'] },
        {
          urls: ['turn:turn.example:443?transport=tcp', 'turn:turn.example:443'],
          username: 'tavern-user',
          credential: 'super-secret',
        },
      ],
      ttlSeconds: 3600,
      mode: 'mesh',
      turnConfigured: true,
      maxPeers: 5,
    });
  });

  it('4. TURN_URL único funciona como fallback legado', async () => {
    const dm = await createUser('dm-ice-turn-fallback');
    const table = await createTable(dm._id);
    process.env.TURN_URL = 'turn:legacy.example:3478';
    process.env.TURN_USERNAME = 'legacy';
    process.env.TURN_CREDENTIAL = 'legacy-secret';

    const response = await request(realtime.app)
      .get(`/api/tables/${table._id}/ice-servers`)
      .set('Authorization', `Bearer ${signToken(dm)}`);

    expect(response.status).toBe(200);
    expect(response.body.turnConfigured).toBe(true);
    expect(response.body.iceServers).toHaveLength(2);
    expect(response.body.iceServers[1]).toEqual({
      urls: ['turn:legacy.example:3478'],
      username: 'legacy',
      credential: 'legacy-secret',
    });
  });

  it('5. TURN incompleto (sem credencial) cai para STUN e sinaliza turnConfigured=false', async () => {
    const dm = await createUser('dm-ice-turn-partial');
    const table = await createTable(dm._id);
    process.env.TURN_URLS = 'turn:turn.example:3478';
    process.env.TURN_USERNAME = 'only-user';

    const response = await request(realtime.app)
      .get(`/api/tables/${table._id}/ice-servers`)
      .set('Authorization', `Bearer ${signToken(dm)}`);

    expect(response.status).toBe(200);
    expect(response.body.turnConfigured).toBe(false);
    expect(response.body.iceServers).toEqual([
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ]);
  });
});
