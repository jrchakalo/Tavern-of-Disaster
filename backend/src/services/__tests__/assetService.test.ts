import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Types } from 'mongoose';
import {
  assertTableQuota,
  deleteAssetById,
  deleteAssetByUrl,
  getTableUsage,
  recordAsset,
  sweepOrphanAssets,
} from '../assetService';
import Asset from '../../models/Asset.model';
import Table from '../../models/Table.model';
import Scene from '../../models/Scene.model';
import Token from '../../models/Token.model';
import User from '../../models/User.model';
import Character from '../../models/Character.model';
import SceneTemplate from '../../models/SceneTemplate.model';
import TokenTemplate from '../../models/TokenTemplate.model';
import { ServiceError } from '../serviceErrors';
import {
  clearMongoMemory,
  connectMongoMemory,
  disconnectMongoMemory,
} from '../../test-utils/mongoMemory';

jest.setTimeout(30000);

let uploadDir: string;

async function createFileAsset(params: {
  tableId?: Types.ObjectId;
  ownerId: Types.ObjectId;
  kind: 'map' | 'token' | 'avatar';
  bytes?: number;
  publicUrl?: string;
  createdAt?: Date;
}) {
  const objectPath = `tables/${params.tableId?.toString() ?? 'avatars'}/${new Types.ObjectId().toString()}.webp`;
  const absolute = path.join(uploadDir, objectPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, Buffer.from('fake-image'));

  const asset = await Asset.create({
    tableId: params.tableId,
    ownerId: params.ownerId,
    kind: params.kind,
    objectPath,
    publicUrl: params.publicUrl ?? `/uploads/${objectPath}`,
    bytes: params.bytes ?? 10,
    mimeType: 'image/webp',
    width: 8,
    height: 8,
  });

  if (params.createdAt) {
    await Asset.collection.updateOne(
      { _id: asset._id },
      { $set: { createdAt: params.createdAt } }
    );
  }

  return { asset, absolute };
}

async function createTable(dmId: Types.ObjectId) {
  return Table.create({
    name: 'Mesa de teste',
    dm: dmId,
    players: [],
    inviteCode: `invite-${new Types.ObjectId().toString()}`,
    scenes: [],
  });
}

beforeAll(async () => {
  await connectMongoMemory();
});

beforeEach(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tof-assets-'));
  process.env.STORAGE_DRIVER = 'local';
  process.env.LOCAL_UPLOAD_DIR = uploadDir;
  delete process.env.TABLE_STORAGE_QUOTA_BYTES;
  delete process.env.ASSET_ORPHAN_TTL_MS;
  delete process.env.ASSET_ORPHAN_SWEEP_INTERVAL_MS;
});

afterEach(async () => {
  await clearMongoMemory();
  await fs.rm(uploadDir, { recursive: true, force: true });
  delete process.env.TABLE_STORAGE_QUOTA_BYTES;
  delete process.env.LOCAL_UPLOAD_DIR;
  delete process.env.STORAGE_DRIVER;
});

afterAll(async () => {
  await disconnectMongoMemory();
});

describe('getTableUsage', () => {
  it('agrega bytes e contagem por tipo da mesa', async () => {
    const dm = new Types.ObjectId();
    const table = await createTable(dm);
    await createFileAsset({ tableId: table._id, ownerId: dm, kind: 'map', bytes: 100 });
    await createFileAsset({ tableId: table._id, ownerId: dm, kind: 'map', bytes: 50 });
    await createFileAsset({ tableId: table._id, ownerId: dm, kind: 'token', bytes: 25 });
    // Avatar não pertence à mesa e não entra na quota.
    await createFileAsset({ ownerId: dm, kind: 'avatar', bytes: 999 });

    const usage = await getTableUsage(table._id.toString());
    expect(usage.usedBytes).toBe(175);
    expect(usage.count).toBe(3);
    expect(usage.byKind).toEqual({ map: 150, token: 25, avatar: 0 });
    expect(usage.quotaBytes).toBe(200 * 1024 * 1024);
    expect(usage.remainingBytes).toBe(usage.quotaBytes - 175);
  });

  it('respeita TABLE_STORAGE_QUOTA_BYTES e retorna zeros para id inválido', async () => {
    process.env.TABLE_STORAGE_QUOTA_BYTES = '1000';
    const usage = await getTableUsage('id-invalido');
    expect(usage).toMatchObject({
      usedBytes: 0,
      quotaBytes: 1000,
      remainingBytes: 1000,
      count: 0,
      byKind: { map: 0, token: 0, avatar: 0 },
    });
  });
});

describe('assertTableQuota', () => {
  it('lança ServiceError 413 quando o upload excede a quota restante', async () => {
    process.env.TABLE_STORAGE_QUOTA_BYTES = '100';
    const dm = new Types.ObjectId();
    const table = await createTable(dm);
    await createFileAsset({ tableId: table._id, ownerId: dm, kind: 'map', bytes: 80 });

    await expect(assertTableQuota(table._id.toString(), 21)).rejects.toMatchObject({
      name: 'ServiceError',
      status: 413,
    });
    await expect(assertTableQuota(table._id.toString(), 20)).resolves.toBeUndefined();
  });

  it('mensagem de quota é clara em pt-BR', async () => {
    process.env.TABLE_STORAGE_QUOTA_BYTES = '10';
    const dm = new Types.ObjectId();
    const table = await createTable(dm);

    try {
      await assertTableQuota(table._id.toString(), 11);
      throw new Error('deveria ter falhado');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      expect((error as ServiceError).message).toBe('A mesa atingiu o limite de armazenamento.');
    }
  });
});

describe('recordAsset', () => {
  it('registra asset com tableId opcional', async () => {
    const dm = new Types.ObjectId();
    const table = await createTable(dm);
    const asset = await recordAsset({
      tableId: table._id.toString(),
      ownerId: dm.toString(),
      kind: 'map',
      objectPath: 'tables/x/maps/y.webp',
      publicUrl: '/uploads/tables/x/maps/y.webp',
      bytes: 123,
      mimeType: 'image/webp',
      width: 640,
      height: 480,
    });

    expect(asset.tableId?.toString()).toBe(table._id.toString());
    expect(asset.bytes).toBe(123);
    expect(asset.width).toBe(640);
    expect(asset.height).toBe(480);
  });

  it('rejeita tableId inválido sem gravar', async () => {
    await expect(
      recordAsset({
        tableId: 'nao-e-object-id',
        ownerId: new Types.ObjectId().toString(),
        kind: 'map',
        objectPath: 'x.webp',
        publicUrl: '/uploads/x.webp',
        bytes: 1,
        mimeType: 'image/webp',
        width: 1,
        height: 1,
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(Asset.countDocuments()).resolves.toBe(0);
  });
});

describe('deleteAssetById', () => {
  it('DM remove asset da própria mesa e o arquivo', async () => {
    const dm = new Types.ObjectId();
    const table = await createTable(dm);
    const { asset, absolute } = await createFileAsset({
      tableId: table._id,
      ownerId: dm,
      kind: 'map',
    });

    await expect(deleteAssetById(dm.toString(), asset._id.toString())).resolves.toEqual({ deleted: true });
    await expect(Asset.findById(asset._id)).resolves.toBeNull();
    await expect(fs.stat(absolute)).rejects.toThrow();
  });

  it('jogador não remove asset da mesa', async () => {
    const dm = new Types.ObjectId();
    const player = new Types.ObjectId();
    const table = await createTable(dm);
    const { asset } = await createFileAsset({ tableId: table._id, ownerId: dm, kind: 'map' });

    await expect(deleteAssetById(player.toString(), asset._id.toString())).rejects.toMatchObject({
      status: 403,
    });
    await expect(Asset.findById(asset._id)).resolves.toBeTruthy();
  });

  it('dono remove o próprio avatar, mas outra pessoa não', async () => {
    const owner = new Types.ObjectId();
    const { asset } = await createFileAsset({ ownerId: owner, kind: 'avatar' });

    await expect(deleteAssetById(new Types.ObjectId().toString(), asset._id.toString())).rejects.toMatchObject({
      status: 403,
    });
    await expect(deleteAssetById(owner.toString(), asset._id.toString())).resolves.toEqual({ deleted: true });
  });

  it('retorna 404 para asset inexistente e 400 para id inválido', async () => {
    await expect(deleteAssetById(new Types.ObjectId().toString(), new Types.ObjectId().toString()))
      .rejects.toMatchObject({ status: 404 });
    await expect(deleteAssetById(new Types.ObjectId().toString(), 'invalido'))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe('deleteAssetByUrl', () => {
  it('apaga registro e arquivo pela URL', async () => {
    const { asset, absolute } = await createFileAsset({
      ownerId: new Types.ObjectId(),
      kind: 'avatar',
    });

    await expect(deleteAssetByUrl(asset.publicUrl)).resolves.toBe(true);
    await expect(Asset.findById(asset._id)).resolves.toBeNull();
    await expect(fs.stat(absolute)).rejects.toThrow();
  });

  it('não lança para URL vazia ou sem registro', async () => {
    await expect(deleteAssetByUrl(undefined)).resolves.toBe(false);
    await expect(deleteAssetByUrl('/uploads/nao-existe.webp')).resolves.toBe(false);
  });
});

describe('sweepOrphanAssets', () => {
  it('apaga apenas órfãos mais antigos que o TTL', async () => {
    const dm = new Types.ObjectId();
    const table = await createTable(dm);
    const old = new Date(Date.now() - 60 * 60 * 1000);

    const orphan = await createFileAsset({
      tableId: table._id,
      ownerId: dm,
      kind: 'map',
      createdAt: old,
    });
    const referenced = await createFileAsset({
      tableId: table._id,
      ownerId: dm,
      kind: 'map',
      createdAt: old,
    });
    const recent = await createFileAsset({
      tableId: table._id,
      ownerId: dm,
      kind: 'map',
    });
    await Scene.create({
      tableId: table._id,
      name: 'Cena com mapa',
      imageUrl: referenced.asset.publicUrl,
    });

    const result = await sweepOrphanAssets({ olderThanMs: 30 * 60 * 1000 });

    expect(result).toEqual({ scanned: 2, deleted: 1, kept: 1 });
    await expect(Asset.findById(orphan.asset._id)).resolves.toBeNull();
    await expect(fs.stat(orphan.absolute)).rejects.toThrow();
    await expect(Asset.findById(referenced.asset._id)).resolves.toBeTruthy();
    await expect(fs.stat(referenced.absolute)).resolves.toBeTruthy();
    await expect(Asset.findById(recent.asset._id)).resolves.toBeTruthy();
  });

  it('considera referências em Token, User, Character e templates', async () => {
    const dm = new Types.ObjectId();
    const table = await createTable(dm);
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const tokenRef = await createFileAsset({ tableId: table._id, ownerId: dm, kind: 'token', createdAt: old });
    const userRef = await createFileAsset({ ownerId: dm, kind: 'avatar', createdAt: old });
    const characterRef = await createFileAsset({ tableId: table._id, ownerId: dm, kind: 'token', createdAt: old });
    const sceneTemplateRef = await createFileAsset({ tableId: table._id, ownerId: dm, kind: 'map', createdAt: old });
    const tokenTemplateRef = await createFileAsset({ tableId: table._id, ownerId: dm, kind: 'token', createdAt: old });
    const orphan = await createFileAsset({ tableId: table._id, ownerId: dm, kind: 'map', createdAt: old });

    const scene = await Scene.create({ tableId: table._id, name: 'Cena' });
    await Token.create({
      tableId: table._id,
      sceneId: scene._id,
      squareId: 'sq-0',
      color: '#fff',
      ownerId: dm,
      name: 'Token',
      imageUrl: tokenRef.asset.publicUrl,
    });
    await User.create({
      username: `user-${new Types.ObjectId().toString()}`,
      email: `${new Types.ObjectId().toString()}@test.dev`,
      passwordHash: 'hash',
      avatarUrl: userRef.asset.publicUrl,
    });
    await Character.create({
      tableId: table._id,
      ownerId: dm,
      name: 'Personagem',
      avatarUrl: characterRef.asset.publicUrl,
    });
    await SceneTemplate.create({
      ownerId: dm,
      name: 'Template',
      mapUrl: sceneTemplateRef.asset.publicUrl,
    });
    await TokenTemplate.create({
      ownerId: dm,
      name: 'Template token',
      imageUrl: tokenTemplateRef.asset.publicUrl,
    });

    const result = await sweepOrphanAssets({ olderThanMs: 24 * 60 * 60 * 1000 });

    expect(result.deleted).toBe(1);
    expect(result.kept).toBe(5);
    await expect(Asset.findById(orphan.asset._id)).resolves.toBeNull();
    await expect(Asset.findById(tokenRef.asset._id)).resolves.toBeTruthy();
    await expect(Asset.findById(userRef.asset._id)).resolves.toBeTruthy();
    await expect(Asset.findById(characterRef.asset._id)).resolves.toBeTruthy();
    await expect(Asset.findById(sceneTemplateRef.asset._id)).resolves.toBeTruthy();
    await expect(Asset.findById(tokenTemplateRef.asset._id)).resolves.toBeTruthy();
  });

  it('não apaga nada quando não há candidatos', async () => {
    await expect(sweepOrphanAssets({ olderThanMs: 60 * 1000 })).resolves.toEqual({
      scanned: 0,
      deleted: 0,
      kept: 0,
    });
  });
});
