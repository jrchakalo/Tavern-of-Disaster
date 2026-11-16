import { Types } from 'mongoose';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import Table from '../../models/Table.model';
import Scene from '../../models/Scene.model';
import '../../models/User.model';
import { loadSessionState } from '../sessionService';
import { MongoMeasurementStore } from '../../socketHandlers/measurementStore.mongo';
import { AuraPayload, PersistentMeasurementPayload } from '../../socketHandlers/measurementStore.types';
import { randomId } from '../../utils/id';

jest.setTimeout(30000);

describe('loadSessionState overlays persistidos', () => {
  beforeAll(async () => {
    await connectMongoMemory();
  });

  afterEach(async () => {
    await clearMongoMemory();
  });

  afterAll(async () => {
    await disconnectMongoMemory();
  });

  it('lê medições persistentes e auras do Mongo no snapshot da sessão', async () => {
    const dmId = new Types.ObjectId();
    const table = await Table.create({
      name: 'Mesa overlays',
      dm: dmId,
      players: [dmId],
      inviteCode: randomId(10),
      scenes: [],
    });
    const scene = await Scene.create({
      tableId: table._id,
      name: 'Cena com overlay',
      gridWidth: 10,
      gridHeight: 10,
    });
    table.scenes = [scene._id as Types.ObjectId];
    table.activeScene = scene._id as Types.ObjectId;
    await table.save();

    const tableId = table._id.toString();
    const sceneId = scene._id.toString();
    const measurement: PersistentMeasurementPayload = {
      id: 'persisted-measure',
      userId: dmId.toString(),
      username: 'Mestre',
      start: { x: 0, y: 0 },
      end: { x: 2, y: 3 },
      distance: '3 m',
      color: '#3c096c',
      sceneId,
      type: 'ruler',
      affectedSquares: ['sq-0', 'sq-1'],
    };
    const aura: AuraPayload = {
      id: 'token-aura',
      tokenId: 'token-aura',
      sceneId,
      tableId,
      name: 'Aura',
      color: '#ff8c00',
      radiusMeters: 4.5,
      ownerId: dmId.toString(),
      difficultTerrain: false,
    };

    // Grava por uma instância nova do store; o snapshot não compartilha cache.
    const writer = new MongoMeasurementStore();
    await writer.addPersistent(tableId, sceneId, measurement);
    await writer.upsertAura(aura);

    const bundle = await loadSessionState(tableId);

    expect(bundle).not.toBeNull();
    expect(bundle!.state.measurements).toEqual([
      {
        id: measurement.id,
        userId: measurement.userId,
        username: measurement.username,
        sceneId: measurement.sceneId,
        start: measurement.start,
        end: measurement.end,
        distance: measurement.distance,
        type: measurement.type,
        affectedSquares: measurement.affectedSquares,
        color: measurement.color,
      },
    ]);
    expect(bundle!.state.auras).toEqual([
      {
        id: aura.id,
        tokenId: aura.tokenId,
        tableId: aura.tableId,
        sceneId: aura.sceneId,
        ownerId: aura.ownerId,
        name: aura.name,
        color: aura.color,
        radiusMeters: aura.radiusMeters,
        difficultTerrain: aura.difficultTerrain,
      },
    ]);
  });
});
