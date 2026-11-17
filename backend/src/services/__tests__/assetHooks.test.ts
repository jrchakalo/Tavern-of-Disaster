import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Types } from 'mongoose';
import Asset from '../../models/Asset.model';
import Table from '../../models/Table.model';
import Scene from '../../models/Scene.model';
import Token from '../../models/Token.model';
import Character from '../../models/Character.model';
import { updateSceneMap, deleteScene } from '../sceneService';
import { updateToken, deleteToken } from '../tokenService';
import { updateCharacter } from '../characterService';
import {
  clearMongoMemory,
  connectMongoMemory,
  disconnectMongoMemory,
} from '../../test-utils/mongoMemory';

jest.setTimeout(30000);

let uploadDir: string;

async function seedAsset(params: {
  tableId?: Types.ObjectId;
  ownerId: Types.ObjectId;
  kind: 'map' | 'token' | 'avatar';
  publicUrl: string;
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
    publicUrl: params.publicUrl,
    bytes: 12,
    mimeType: 'image/webp',
    width: 8,
    height: 8,
  });
  return { asset, absolute };
}

async function expectGone(assetId: Types.ObjectId, absolute: string) {
  await expect(Asset.findById(assetId)).resolves.toBeNull();
  await expect(fs.stat(absolute)).rejects.toThrow();
}

async function expectKept(assetId: Types.ObjectId, absolute: string) {
  await expect(Asset.findById(assetId)).resolves.toBeTruthy();
  await expect(fs.stat(absolute)).resolves.toBeTruthy();
}

async function createTable(dmId: Types.ObjectId, sceneIds: Types.ObjectId[] = []) {
  return Table.create({
    name: 'Mesa hooks',
    dm: dmId,
    players: [],
    inviteCode: `invite-${new Types.ObjectId().toString()}`,
    scenes: sceneIds,
    activeScene: sceneIds[0],
  });
}

beforeAll(async () => {
  await connectMongoMemory();
});

beforeEach(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tof-hooks-'));
  process.env.STORAGE_DRIVER = 'local';
  process.env.LOCAL_UPLOAD_DIR = uploadDir;
});

afterEach(async () => {
  await clearMongoMemory();
  await fs.rm(uploadDir, { recursive: true, force: true });
  delete process.env.LOCAL_UPLOAD_DIR;
  delete process.env.STORAGE_DRIVER;
});

afterAll(async () => {
  await disconnectMongoMemory();
});

describe('hooks de cena', () => {
  it('trocar o mapa apaga o asset anterior', async () => {
    const dm = new Types.ObjectId();
    const table = await createTable(dm);
    const oldUrl = '/uploads/tables/x/maps/old.webp';
    const seeded = await seedAsset({ tableId: table._id, ownerId: dm, kind: 'map', publicUrl: oldUrl });
    const scene = await Scene.create({ tableId: table._id, name: 'Cena', imageUrl: oldUrl });

    const newUrl = '/uploads/tables/x/maps/new.webp';
    const updated = await updateSceneMap(scene._id.toString(), newUrl);

    expect(updated?.imageUrl).toBe(newUrl);
    await expectGone(seeded.asset._id, seeded.absolute);
  });

  it('manter o mesmo mapa não apaga o asset', async () => {
    const dm = new Types.ObjectId();
    const table = await createTable(dm);
    const url = '/uploads/tables/x/maps/same.webp';
    const seeded = await seedAsset({ tableId: table._id, ownerId: dm, kind: 'map', publicUrl: url });
    const scene = await Scene.create({ tableId: table._id, name: 'Cena', imageUrl: url });

    await updateSceneMap(scene._id.toString(), url);
    await expectKept(seeded.asset._id, seeded.absolute);
  });

  it('excluir a cena apaga o mapa', async () => {
    const dm = new Types.ObjectId();
    const url = '/uploads/tables/x/maps/scene.webp';
    const scene = await Scene.create({ tableId: new Types.ObjectId(), name: 'Cena', imageUrl: url });
    const table = await createTable(dm, [scene._id as Types.ObjectId]);
    const seeded = await seedAsset({
      tableId: table._id,
      ownerId: dm,
      kind: 'map',
      publicUrl: url,
    });

    await deleteScene(table as any, scene._id.toString());

    await expect(Scene.findById(scene._id)).resolves.toBeNull();
    await expectGone(seeded.asset._id, seeded.absolute);
  });
});

describe('hooks de token', () => {
  it('trocar a imagem do token apaga a anterior', async () => {
    const dm = new Types.ObjectId();
    const table = await createTable(dm);
    const scene = await Scene.create({ tableId: table._id, name: 'Cena' });
    const oldUrl = '/uploads/tables/x/tokens/old.webp';
    const seeded = await seedAsset({ tableId: table._id, ownerId: dm, kind: 'token', publicUrl: oldUrl });
    const token = await Token.create({
      tableId: table._id,
      sceneId: scene._id,
      squareId: 'sq-0',
      color: '#fff',
      ownerId: dm,
      name: 'Token',
      imageUrl: oldUrl,
    });

    const newUrl = '/uploads/tables/x/tokens/new.webp';
    const updated = await updateToken(token._id.toString(), { imageUrl: newUrl });

    expect(updated.imageUrl).toBe(newUrl);
    await expectGone(seeded.asset._id, seeded.absolute);
  });

  it('excluir o token apaga a imagem', async () => {
    const dm = new Types.ObjectId();
    const table = await createTable(dm);
    const scene = await Scene.create({ tableId: table._id, name: 'Cena' });
    const url = '/uploads/tables/x/tokens/delete.webp';
    const seeded = await seedAsset({ tableId: table._id, ownerId: dm, kind: 'token', publicUrl: url });
    const token = await Token.create({
      tableId: table._id,
      sceneId: scene._id,
      squareId: 'sq-0',
      color: '#fff',
      ownerId: dm,
      name: 'Token',
      imageUrl: url,
    });

    await deleteToken(token._id.toString());

    await expect(Token.findById(token._id)).resolves.toBeNull();
    await expectGone(seeded.asset._id, seeded.absolute);
  });
});

describe('hook de personagem', () => {
  it('trocar o avatar da ficha apaga o asset anterior', async () => {
    const owner = new Types.ObjectId();
    const table = await createTable(owner);
    const oldUrl = '/uploads/avatars/old.webp';
    const seeded = await seedAsset({ ownerId: owner, kind: 'avatar', publicUrl: oldUrl });
    const character = await Character.create({
      tableId: table._id,
      ownerId: owner,
      name: 'Ficha',
      avatarUrl: oldUrl,
    });

    const newUrl = '/uploads/avatars/new.webp';
    await updateCharacter(owner.toString(), table._id.toString(), character._id.toString(), {
      avatarUrl: newUrl,
    });

    const stored = await Character.findById(character._id);
    expect(stored?.avatarUrl).toBe(newUrl);
    await expectGone(seeded.asset._id, seeded.absolute);
  });
});
