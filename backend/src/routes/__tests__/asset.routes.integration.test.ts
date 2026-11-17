import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { Types } from 'mongoose';
import { createServer } from '../../server';
import Asset from '../../models/Asset.model';
import Table from '../../models/Table.model';
import User from '../../models/User.model';
import { randomId } from '../../utils/id';
import {
  clearMongoMemory,
  connectMongoMemory,
  disconnectMongoMemory,
} from '../../test-utils/mongoMemory';

jest.setTimeout(40000);

process.env.JWT_SECRET = process.env.JWT_SECRET || 'asset-routes-secret';

type RealtimeServer = ReturnType<typeof createServer>;

let realtime: RealtimeServer;
let uploadDir: string;

async function createUser(username: string) {
  const passwordHash = await bcrypt.hash('senha123', 4);
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

async function pngBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: '#ff0000' },
  })
    .png()
    .toBuffer();
}

function uploadAsset(
  route: string,
  token: string,
  buffer: Buffer,
  filename = 'asset.png'
) {
  return request(realtime.app)
    .post(route)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', buffer, { filename, contentType: 'image/png' });
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

beforeAll(async () => {
  await connectMongoMemory();
  realtime = createServer();
});

beforeEach(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tof-asset-routes-'));
  process.env.STORAGE_DRIVER = 'local';
  process.env.LOCAL_UPLOAD_DIR = uploadDir;
  delete process.env.TABLE_STORAGE_QUOTA_BYTES;
});

afterEach(async () => {
  await clearMongoMemory();
  await fs.rm(uploadDir, { recursive: true, force: true });
  delete process.env.TABLE_STORAGE_QUOTA_BYTES;
  delete process.env.LOCAL_UPLOAD_DIR;
  delete process.env.STORAGE_DRIVER;
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

describe('POST /api/assets/maps/:tableId', () => {
  it('DM sobe mapa, registra Asset e devolve uso com quota', async () => {
    const dm = await createUser('dm-asset-map');
    const player = await createUser('player-asset-map');
    const table = await createTable(dm._id, [player._id]);

    const response = await uploadAsset(
      `/api/assets/maps/${table._id}`,
      signToken(dm),
      await pngBuffer()
    );

    expect(response.status).toBe(201);
    expect(response.body.publicUrl).toMatch(/^\/uploads\/tables\/.+\/maps\/.+\.webp$/);
    expect(response.body.assetId).toBeTruthy();
    expect(response.body.bytes).toBeGreaterThan(0);
    expect(response.body.usage).toMatchObject({
      usedBytes: response.body.bytes,
      quotaBytes: 200 * 1024 * 1024,
      count: 1,
      byKind: { map: response.body.bytes, token: 0, avatar: 0 },
    });
    expect(response.body.usage.remainingBytes).toBe(
      response.body.usage.quotaBytes - response.body.usage.usedBytes
    );

    const asset = await Asset.findById(response.body.assetId);
    expect(asset).toBeTruthy();
    expect(asset?.kind).toBe('map');
    expect(asset?.tableId?.toString()).toBe(table._id.toString());
    expect(asset?.ownerId.toString()).toBe(dm._id.toString());
    expect(asset?.bytes).toBe(response.body.bytes);
    expect(asset?.mimeType).toBe('image/webp');
    await expect(fs.stat(path.join(uploadDir, asset!.objectPath))).resolves.toBeTruthy();
  });

  it('jogador recebe 403 e não grava arquivo nem registro', async () => {
    const dm = await createUser('dm-asset-forbidden-map');
    const player = await createUser('player-asset-forbidden-map');
    const table = await createTable(dm._id, [player._id]);

    const response = await uploadAsset(
      `/api/assets/maps/${table._id}`,
      signToken(player),
      await pngBuffer()
    );

    expect(response.status).toBe(403);
    expect(await Asset.countDocuments({ tableId: table._id })).toBe(0);
    await expect(listFiles(uploadDir)).resolves.toEqual([]);
  });

  it('quota excedida retorna 413 e não deixa arquivo nem registro', async () => {
    process.env.TABLE_STORAGE_QUOTA_BYTES = '1';
    const dm = await createUser('dm-asset-quota');
    const table = await createTable(dm._id);

    const response = await uploadAsset(
      `/api/assets/maps/${table._id}`,
      signToken(dm),
      await pngBuffer()
    );

    expect(response.status).toBe(413);
    expect(response.body.message).toBe('A mesa atingiu o limite de armazenamento.');
    expect(await Asset.countDocuments({ tableId: table._id })).toBe(0);
    await expect(listFiles(uploadDir)).resolves.toEqual([]);
  });
});

describe('POST /api/assets/tokens/:tableId', () => {
  it('DM sobe token e o uso é somado por tipo', async () => {
    const dm = await createUser('dm-asset-token');
    const table = await createTable(dm._id);

    const mapResponse = await uploadAsset(
      `/api/assets/maps/${table._id}`,
      signToken(dm),
      await pngBuffer()
    );
    const tokenResponse = await uploadAsset(
      `/api/assets/tokens/${table._id}`,
      signToken(dm),
      await pngBuffer()
    );

    expect(mapResponse.status).toBe(201);
    expect(tokenResponse.status).toBe(201);
    expect(tokenResponse.body.usage.count).toBe(2);
    expect(tokenResponse.body.usage.usedBytes).toBe(mapResponse.body.bytes + tokenResponse.body.bytes);
    expect(tokenResponse.body.usage.byKind.map).toBe(mapResponse.body.bytes);
    expect(tokenResponse.body.usage.byKind.token).toBe(tokenResponse.body.bytes);
  });

  it('jogador não pode subir token', async () => {
    const dm = await createUser('dm-asset-token-forbidden');
    const player = await createUser('player-asset-token-forbidden');
    const table = await createTable(dm._id, [player._id]);

    const response = await uploadAsset(
      `/api/assets/tokens/${table._id}`,
      signToken(player),
      await pngBuffer()
    );

    expect(response.status).toBe(403);
  });
});

describe('POST /api/assets/avatar', () => {
  it('registra avatar sem tableId e devolve compatibilidade de publicUrl', async () => {
    const user = await createUser('avatar-owner');

    const response = await uploadAsset('/api/assets/avatar', signToken(user), await pngBuffer());

    expect(response.status).toBe(201);
    expect(response.body.publicUrl).toMatch(/^\/uploads\/avatars\/.+\/.+\.webp$/);
    expect(response.body.assetId).toBeTruthy();
    expect(response.body.usage).toBeUndefined();

    const asset = await Asset.findById(response.body.assetId);
    expect(asset?.kind).toBe('avatar');
    expect(asset?.tableId).toBeUndefined();
  });
});

describe('GET /api/assets/tables/:tableId/usage', () => {
  it('membro da mesa lê o uso agregado', async () => {
    const dm = await createUser('dm-asset-usage');
    const player = await createUser('player-asset-usage');
    const table = await createTable(dm._id, [player._id]);
    const upload = await uploadAsset(
      `/api/assets/maps/${table._id}`,
      signToken(dm),
      await pngBuffer()
    );

    const response = await request(realtime.app)
      .get(`/api/assets/tables/${table._id}/usage`)
      .set('Authorization', `Bearer ${signToken(player)}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      usedBytes: upload.body.bytes,
      quotaBytes: 200 * 1024 * 1024,
      count: 1,
      byKind: { map: upload.body.bytes, token: 0, avatar: 0 },
    });
  });

  it('não-membro recebe 403', async () => {
    const dm = await createUser('dm-asset-usage-forbidden');
    const outsider = await createUser('outsider-asset-usage');
    const table = await createTable(dm._id);

    const response = await request(realtime.app)
      .get(`/api/assets/tables/${table._id}/usage`)
      .set('Authorization', `Bearer ${signToken(outsider)}`);

    expect(response.status).toBe(403);
  });
});

describe('DELETE /api/assets/:assetId', () => {
  it('DM apaga o asset e o arquivo; jogador e não-membro recebem 403', async () => {
    const dm = await createUser('dm-asset-delete');
    const player = await createUser('player-asset-delete');
    const outsider = await createUser('outsider-asset-delete');
    const table = await createTable(dm._id, [player._id]);
    const upload = await uploadAsset(
      `/api/assets/maps/${table._id}`,
      signToken(dm),
      await pngBuffer()
    );
    const asset = await Asset.findById(upload.body.assetId);
    const absolute = path.join(uploadDir, asset!.objectPath);

    for (const intruder of [player, outsider]) {
      const forbidden = await request(realtime.app)
        .delete(`/api/assets/${upload.body.assetId}`)
        .set('Authorization', `Bearer ${signToken(intruder)}`);
      expect(forbidden.status).toBe(403);
    }
    await expect(fs.stat(absolute)).resolves.toBeTruthy();

    const response = await request(realtime.app)
      .delete(`/api/assets/${upload.body.assetId}`)
      .set('Authorization', `Bearer ${signToken(dm)}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, assetId: upload.body.assetId });
    await expect(Asset.findById(upload.body.assetId)).resolves.toBeNull();
    await expect(fs.stat(absolute)).rejects.toThrow();
  });

  it('dono apaga o próprio avatar', async () => {
    const owner = await createUser('avatar-delete-owner');
    const other = await createUser('avatar-delete-other');
    const upload = await uploadAsset('/api/assets/avatar', signToken(owner), await pngBuffer());

    const forbidden = await request(realtime.app)
      .delete(`/api/assets/${upload.body.assetId}`)
      .set('Authorization', `Bearer ${signToken(other)}`);
    expect(forbidden.status).toBe(403);

    const response = await request(realtime.app)
      .delete(`/api/assets/${upload.body.assetId}`)
      .set('Authorization', `Bearer ${signToken(owner)}`);
    expect(response.status).toBe(200);
    await expect(Asset.findById(upload.body.assetId)).resolves.toBeNull();
  });

  it('asset inexistente retorna 404', async () => {
    const user = await createUser('asset-delete-missing');
    const response = await request(realtime.app)
      .delete(`/api/assets/${new Types.ObjectId().toString()}`)
      .set('Authorization', `Bearer ${signToken(user)}`);
    expect(response.status).toBe(404);
  });
});

describe('PUT /api/users/me (hook de avatar)', () => {
  it('trocar avatarUrl apaga o asset anterior', async () => {
    const user = await createUser('avatar-profile-hook');
    const upload = await uploadAsset('/api/assets/avatar', signToken(user), await pngBuffer());
    const asset = await Asset.findById(upload.body.assetId);
    const absolute = path.join(uploadDir, asset!.objectPath);

    const applied = await request(realtime.app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${signToken(user)}`)
      .send({ avatarUrl: upload.body.publicUrl });
    expect(applied.status).toBe(200);

    const response = await request(realtime.app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${signToken(user)}`)
      .send({ avatarUrl: '/uploads/avatars/manual/new.webp' });

    expect(response.status).toBe(200);
    expect(response.body.avatarUrl).toBe('/uploads/avatars/manual/new.webp');
    await expect(Asset.findById(upload.body.assetId)).resolves.toBeNull();
    await expect(fs.stat(absolute)).rejects.toThrow();
  });

  it('manter avatarUrl não apaga o asset', async () => {
    const user = await createUser('avatar-profile-same');
    const upload = await uploadAsset('/api/assets/avatar', signToken(user), await pngBuffer());
    const asset = await Asset.findById(upload.body.assetId);
    const absolute = path.join(uploadDir, asset!.objectPath);

    const response = await request(realtime.app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${signToken(user)}`)
      .send({ avatarUrl: upload.body.publicUrl });

    expect(response.status).toBe(200);
    await expect(Asset.findById(upload.body.assetId)).resolves.toBeTruthy();
    await expect(fs.stat(absolute)).resolves.toBeTruthy();
  });
});
