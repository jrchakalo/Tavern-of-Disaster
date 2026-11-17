import {
  shareEphemeralMeasurement,
  cleanupUserMeasurements,
  clearTableMeasurementState,
  clearAllMeasurements,
  clearPersistentMeasurementsForScene,
  addPersistentMeasurement,
  removePersistentMeasurement,
  upsertTokenAura,
  removeTokenAura,
  listScenePersistents,
  listSceneAuras,
} from '../measurementService';
import * as measurementStore from '../../socketHandlers/measurementStore';
import Table from '../../models/Table.model';
import Scene from '../../models/Scene.model';
import Token from '../../models/Token.model';

jest.mock('../../socketHandlers/measurementStore', () => ({
  setMeasurement: jest.fn(),
  removeMeasurement: jest.fn(),
  clearMeasurementsForTable: jest.fn(),
  clearAllForUser: jest.fn(),
  getTablesForUser: jest.fn(),
  addPersistent: jest.fn(),
  removePersistent: jest.fn(),
  listPersistents: jest.fn(),
  upsertAura: jest.fn(),
  removeAura: jest.fn(),
  listAuras: jest.fn(),
  clearPersistentsForScene: jest.fn(),
  clearAurasForScene: jest.fn(),
  clearMeasurementsForScene: jest.fn(),
  clearAllForTable: jest.fn(),
}));

jest.mock('../../models/Scene.model', () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));

jest.mock('../../models/Table.model', () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));

jest.mock('../../models/Token.model', () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));

describe('measurementService', () => {
  const mockedTableModel = Table as unknown as { findById: jest.Mock };
  const mockedSceneModel = Scene as unknown as { findById: jest.Mock };
  const mockedTokenModel = Token as unknown as { findById: jest.Mock };
  const mockedStore = measurementStore as jest.Mocked<typeof measurementStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedStore.listPersistents.mockResolvedValue([]);
    mockedStore.listAuras.mockResolvedValue([]);
  });

  it('clears persistent measurements of a scene without touching auras', async () => {
    await clearPersistentMeasurementsForScene('table1', 'scene1');

    expect(mockedStore.clearPersistentsForScene).toHaveBeenCalledWith('table1', 'scene1');
    expect(mockedStore.clearAurasForScene).not.toHaveBeenCalled();
    expect(mockedStore.clearMeasurementsForScene).not.toHaveBeenCalled();
  });

  it('shares an ephemeral measurement when the requester is the DM', async () => {
    const populateMock = jest.fn().mockReturnThis();
    const tableData = {
      _id: { toString: () => 'table1' },
      dm: { _id: { toString: () => 'user1' } },
      activeScene: { _id: { toString: () => 'scene1' } },
      populate: populateMock,
    };
    mockedTableModel.findById.mockReturnValue(tableData);

    const measurement = await shareEphemeralMeasurement(
      { id: 'user1', username: 'DM' },
      'table1',
      'scene1',
      {
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        distance: '1m',
        type: 'ruler',
        affectedSquares: [],
        color: '#ff0000',
        sceneId: 'scene1',
      },
    );

    expect(mockedStore.setMeasurement).toHaveBeenCalledWith(
      'table1',
      'user1',
      expect.objectContaining({ color: '#3c096c', distance: '1m' }),
    );
    expect(measurement).toMatchObject({ userId: 'user1', sceneId: 'scene1' });
  });

  it('blocks non-turn owners from sharing measurements and avoids touching the store', async () => {
    const populateMock = jest.fn().mockReturnThis();
    const tableData = {
      _id: { toString: () => 'table1' },
      dm: { _id: { toString: () => 'dm-user' } },
      activeScene: { _id: { toString: () => 'scene1' } },
      populate: populateMock,
    };
    mockedTableModel.findById.mockReturnValue(tableData);
    mockedSceneModel.findById.mockResolvedValue({
      initiative: [{ isCurrentTurn: true, tokenId: 'token-current' }],
    });
    mockedTokenModel.findById.mockResolvedValue({
      ownerId: { toString: () => 'another-user' },
    });

    const measurement = await shareEphemeralMeasurement(
      { id: 'player-1', username: 'Jogador' },
      'table1',
      'scene1',
      {
        start: { x: 0, y: 0 },
        end: { x: 5, y: 5 },
        distance: '5m',
        type: 'ruler',
        affectedSquares: [],
        sceneId: 'scene1',
        color: '#ffaa00',
      },
    );

    expect(measurement).toBeNull();
    expect(mockedStore.setMeasurement).not.toHaveBeenCalled();
  });

  it('cleans up user measurements across all tables', () => {
    mockedStore.getTablesForUser.mockReturnValue(['tableA', 'tableB']);

    const tables = cleanupUserMeasurements('user42');

    expect(mockedStore.removeMeasurement).toHaveBeenCalledWith('tableA', 'user42');
    expect(mockedStore.removeMeasurement).toHaveBeenCalledWith('tableB', 'user42');
    expect(mockedStore.clearAllForUser).toHaveBeenCalledWith('user42');
    expect(tables).toEqual(['tableA', 'tableB']);
  });

  it('clears all measurement state for a table', async () => {
    await clearTableMeasurementState('table99');
    expect(mockedStore.clearAllForTable).toHaveBeenCalledWith('table99');
  });

  it('clears ephemeral, persistent measurements and auras for a scene', async () => {
    await clearAllMeasurements('tableX', 'sceneZ');
    expect(mockedStore.clearMeasurementsForScene).toHaveBeenCalledWith('tableX', 'sceneZ');
    expect(mockedStore.clearPersistentsForScene).toHaveBeenCalledWith('tableX', 'sceneZ');
    expect(mockedStore.clearAurasForScene).toHaveBeenCalledWith('tableX', 'sceneZ');
  });

  function mockDmTable(dmId = 'user1') {
    const populateMock = jest.fn().mockReturnThis();
    const tableData = {
      _id: { toString: () => 'table1' },
      dm: { _id: { toString: () => dmId } },
      activeScene: { _id: { toString: () => 'scene1' } },
      populate: populateMock,
    };
    mockedTableModel.findById.mockReturnValue(tableData);
    return tableData;
  }

  it('writes persistent measurements through the async store', async () => {
    mockDmTable();

    const result = await addPersistentMeasurement(
      { id: 'user1', username: 'DM' },
      'table1',
      'scene1',
      {
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        distance: '1,5 m',
        type: 'ruler',
        affectedSquares: ['sq-0'],
        color: '#ff8c00',
        sceneId: 'scene1',
      }
    );

    expect(mockedStore.addPersistent).toHaveBeenCalledWith(
      'table1',
      'scene1',
      expect.objectContaining({ id: result.id, userId: 'user1', color: '#3c096c' })
    );
  });

  it('loads persistents from the store before removing a measurement', async () => {
    mockDmTable();
    mockedStore.listPersistents.mockResolvedValue([
      { id: 'm1', userId: 'another-user' } as any,
    ]);

    await removePersistentMeasurement({ id: 'user1', username: 'DM' }, 'table1', 'scene1', 'm1');

    expect(mockedStore.listPersistents).toHaveBeenCalledWith('table1', 'scene1');
    expect(mockedStore.removePersistent).toHaveBeenCalledWith('table1', 'scene1', 'm1');
  });

  it('rejects removing a persistent measurement that does not exist', async () => {
    mockDmTable();
    mockedStore.listPersistents.mockResolvedValue([]);

    await expect(
      removePersistentMeasurement({ id: 'user1', username: 'DM' }, 'table1', 'scene1', 'missing')
    ).rejects.toMatchObject({ status: 404 });
    expect(mockedStore.removePersistent).not.toHaveBeenCalled();
  });

  it('awaits aura upsert and removal in the store', async () => {
    mockDmTable();
    mockedTokenModel.findById.mockResolvedValue({
      ownerId: { toString: () => 'user1' },
    });

    const aura = await upsertTokenAura({ id: 'user1', username: 'DM' }, 'table1', 'scene1', 'token1', {
      name: 'Aura',
      color: '#ff8c00',
      radiusMeters: 3,
      difficultTerrain: true,
    });

    expect(mockedStore.upsertAura).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'token1', tokenId: 'token1', radiusMeters: 3, difficultTerrain: true })
    );
    expect(aura).toMatchObject({ tokenId: 'token1', sceneId: 'scene1' });

    await removeTokenAura({ id: 'user1', username: 'DM' }, 'table1', 'scene1', 'token1');
    expect(mockedStore.removeAura).toHaveBeenCalledWith('table1', 'scene1', 'token1');
  });

  it('exposes async lists from the store', async () => {
    mockedStore.listPersistents.mockResolvedValue([{ id: 'm1' } as any]);
    mockedStore.listAuras.mockResolvedValue([{ id: 'a1' } as any]);

    await expect(listScenePersistents('table1', 'scene1')).resolves.toEqual([{ id: 'm1' }]);
    await expect(listSceneAuras('table1', 'scene1')).resolves.toEqual([{ id: 'a1' }]);
  });
});
