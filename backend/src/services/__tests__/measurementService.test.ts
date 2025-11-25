import { shareEphemeralMeasurement, cleanupUserMeasurements, clearTableMeasurementState } from '../measurementService';
import * as measurementStore from '../../socketHandlers/measurementStore';
import Table from '../../models/Table.model';

jest.mock('nanoid', () => ({
  nanoid: () => 'mock-measurement-id',
}));

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
  const mockedStore = measurementStore as jest.Mocked<typeof measurementStore>;

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('cleans up user measurements across all tables', () => {
    mockedStore.getTablesForUser.mockReturnValue(['tableA', 'tableB']);

    const tables = cleanupUserMeasurements('user42');

    expect(mockedStore.removeMeasurement).toHaveBeenCalledWith('tableA', 'user42');
    expect(mockedStore.removeMeasurement).toHaveBeenCalledWith('tableB', 'user42');
    expect(mockedStore.clearAllForUser).toHaveBeenCalledWith('user42');
    expect(tables).toEqual(['tableA', 'tableB']);
  });

  it('clears all measurement state for a table', () => {
    clearTableMeasurementState('table99');
    expect(mockedStore.clearAllForTable).toHaveBeenCalledWith('table99');
  });
});
