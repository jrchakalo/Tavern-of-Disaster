import { Types } from 'mongoose';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import SceneOverlay from '../../models/SceneOverlay.model';
import { MongoMeasurementStore } from '../measurementStore.mongo';
import { AuraPayload, PersistentMeasurementPayload } from '../measurementStore.types';

jest.setTimeout(30000);

function buildMeasurement(overrides: Partial<PersistentMeasurementPayload> = {}): PersistentMeasurementPayload {
  return {
    id: 'measure-1',
    userId: 'user-1',
    username: 'Mestre',
    start: { x: 1, y: 2 },
    end: { x: 4, y: 6 },
    distance: '7,5 m',
    color: '#3c096c',
    sceneId: 'scene-placeholder',
    type: 'ruler',
    affectedSquares: ['sq-1', 'sq-2'],
    ...overrides,
  };
}

function buildAura(overrides: Partial<AuraPayload> = {}): AuraPayload {
  return {
    id: 'token-1',
    tokenId: 'token-1',
    sceneId: 'scene-placeholder',
    tableId: 'table-placeholder',
    name: 'Aura de fogo',
    color: '#ff8c00',
    radiusMeters: 3,
    ownerId: 'user-1',
    difficultTerrain: true,
    ...overrides,
  };
}

describe('MongoMeasurementStore (SceneOverlay)', () => {
  let tableId: string;
  let sceneId: string;
  let otherSceneId: string;

  beforeAll(async () => {
    await connectMongoMemory();
  });

  beforeEach(() => {
    tableId = new Types.ObjectId().toString();
    sceneId = new Types.ObjectId().toString();
    otherSceneId = new Types.ObjectId().toString();
  });

  afterEach(async () => {
    await clearMongoMemory();
  });

  afterAll(async () => {
    await disconnectMongoMemory();
  });

  it('sobrevive a restart: uma instância nova lê os payloads exatos do Mongo', async () => {
    const measurementA = buildMeasurement({ id: 'measure-a', sceneId });
    const measurementB = buildMeasurement({
      id: 'measure-b',
      sceneId,
      type: 'cone',
      color: '#ff8c00',
      affectedSquares: [],
    });
    const aura = buildAura({ sceneId, tableId });

    const store = new MongoMeasurementStore();
    await store.addPersistent(tableId, sceneId, measurementA);
    await store.addPersistent(tableId, sceneId, measurementB);
    await store.upsertAura(aura);

    // Simula restart do backend: instância nova, nenhum cache em memória.
    const restarted = new MongoMeasurementStore();

    await expect(restarted.listPersistents(tableId, sceneId)).resolves.toEqual([
      measurementA,
      measurementB,
    ]);
    await expect(restarted.listAuras(tableId, sceneId)).resolves.toEqual([aura]);

    const doc = await SceneOverlay.findOne({ tableId, sceneId }).lean();
    expect(doc).not.toBeNull();
    expect(doc!.measurements).toEqual([measurementA, measurementB]);
    expect(doc!.auras).toEqual([aura]);
    expect(doc!.createdAt).toBeInstanceOf(Date);
    expect(doc!.updatedAt).toBeInstanceOf(Date);
  });

  it('remove medições e substitui a aura pelo tokenId', async () => {
    const measurementA = buildMeasurement({ id: 'measure-a', sceneId });
    const measurementB = buildMeasurement({ id: 'measure-b', sceneId });
    const firstAura = buildAura({ sceneId, tableId, name: 'Aura antiga', radiusMeters: 1 });
    const updatedAura = buildAura({ sceneId, tableId, name: 'Aura nova', radiusMeters: 6 });

    const store = new MongoMeasurementStore();
    await store.addPersistent(tableId, sceneId, measurementA);
    await store.addPersistent(tableId, sceneId, measurementB);
    await store.upsertAura(firstAura);
    await store.upsertAura(updatedAura);

    await store.removePersistent(tableId, sceneId, measurementA.id);

    await expect(store.listPersistents(tableId, sceneId)).resolves.toEqual([measurementB]);
    await expect(store.listAuras(tableId, sceneId)).resolves.toEqual([updatedAura]);

    await store.removeAura(tableId, sceneId, updatedAura.tokenId);
    await expect(store.listAuras(tableId, sceneId)).resolves.toEqual([]);
  });

  it('limpa overlays por cena sem afetar outra cena da mesma mesa', async () => {
    const store = new MongoMeasurementStore();
    await store.addPersistent(tableId, sceneId, buildMeasurement({ id: 'scene-1-measure', sceneId }));
    await store.addPersistent(
      tableId,
      otherSceneId,
      buildMeasurement({ id: 'scene-2-measure', sceneId: otherSceneId })
    );
    await store.upsertAura(buildAura({ sceneId, tableId }));
    await store.upsertAura(buildAura({ sceneId: otherSceneId, tableId, tokenId: 'token-2', id: 'token-2' }));

    await store.clearPersistentsForScene(tableId, sceneId);
    await store.clearAurasForScene(tableId, sceneId);

    await expect(store.listPersistents(tableId, sceneId)).resolves.toEqual([]);
    await expect(store.listAuras(tableId, sceneId)).resolves.toEqual([]);
    await expect(store.listPersistents(tableId, otherSceneId)).resolves.toEqual([
      buildMeasurement({ id: 'scene-2-measure', sceneId: otherSceneId }),
    ]);
    await expect(store.listAuras(tableId, otherSceneId)).resolves.toEqual([
      buildAura({ sceneId: otherSceneId, tableId, tokenId: 'token-2', id: 'token-2' }),
    ]);
  });

  it('limpa todos os overlays da mesa', async () => {
    const store = new MongoMeasurementStore();
    await store.addPersistent(tableId, sceneId, buildMeasurement({ id: 'm1', sceneId }));
    await store.addPersistent(
      tableId,
      otherSceneId,
      buildMeasurement({ id: 'm2', sceneId: otherSceneId })
    );
    await store.upsertAura(buildAura({ sceneId, tableId }));

    await store.clearAllForTable(tableId);

    await expect(SceneOverlay.countDocuments({ tableId })).resolves.toBe(0);
    await expect(store.listPersistents(tableId, sceneId)).resolves.toEqual([]);
    await expect(store.listAuras(tableId, sceneId)).resolves.toEqual([]);
  });

  it('mantém cenas de mesas diferentes isoladas', async () => {
    const otherTableId = new Types.ObjectId().toString();
    const store = new MongoMeasurementStore();
    await store.addPersistent(tableId, sceneId, buildMeasurement({ id: 'mine', sceneId }));
    await store.addPersistent(otherTableId, sceneId, buildMeasurement({ id: 'theirs', sceneId }));

    await expect(store.listPersistents(tableId, sceneId)).resolves.toEqual([
      buildMeasurement({ id: 'mine', sceneId }),
    ]);
    await expect(store.listPersistents(otherTableId, sceneId)).resolves.toEqual([
      buildMeasurement({ id: 'theirs', sceneId }),
    ]);
  });
});
