import { Types } from 'mongoose';
import Table from '../../models/Table.model';
import System from '../../models/System.model';
import Scene from '../../models/Scene.model';
import Token from '../../models/Token.model';
import User from '../../models/User.model';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import { getFootprintSize, buildFootprintSquares, isSquareInsideGrid, createToken } from '../tokenService';

describe('tokenService helpers', () => {
  it('returns footprint size based on label', () => {
    expect(getFootprintSize('Pequeno/Médio')).toBe(1);
    expect(getFootprintSize('Grande')).toBe(2);
    expect(getFootprintSize('Unknown')).toBe(1);
  });

  it('builds footprint squares for tokens that fit within the grid', () => {
    const squares = buildFootprintSquares('sq-0', 'Grande', 10, 10);
    expect(squares).toEqual(['sq-0', 'sq-1', 'sq-10', 'sq-11']);
  });

  it('throws when footprint would exceed grid boundaries', () => {
    expect(() => buildFootprintSquares('sq-9', 'Grande', 10, 10)).toThrow('Token não cabe dentro do grid.');
  });

  it('detects whether a square id is inside the grid bounds', () => {
    expect(isSquareInsideGrid('sq-5', 3, 3)).toBe(true);
    expect(isSquareInsideGrid('sq-9', 3, 3)).toBe(false);
  });
});

describe('tokenService.createToken movement defaults', () => {
  const dmId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();

  beforeAll(async () => {
    await connectMongoMemory();
  });

  afterEach(async () => {
    await clearMongoMemory();
  });

  afterAll(async () => {
    await disconnectMongoMemory();
  });

  it('derives movement from the linked system when payload omits it', async () => {
    const system = await System.create({
      key: 'custom',
      name: 'Sistema Custom',
      movementRules: {
        baseSpeedFeet: 30,
        gridSizeFeet: 10,
      },
    });

    const table = await Table.create({
      name: 'Mesa Movimento',
      dm: dmId,
      players: [ownerId],
      inviteCode: 'MOVE01',
      scenes: [],
      systemId: system._id,
    });

    const scene = await Scene.create({
      tableId: table._id,
      name: 'Cena 1',
      gridWidth: 10,
      gridHeight: 10,
      metersPerSquare: 2,
    });

    await User.create({
      _id: ownerId,
      username: 'owner',
      email: 'owner@example.com',
      passwordHash: 'hashed',
    });

    const token = await createToken({
      tableId: table._id.toString(),
      sceneId: scene._id.toString(),
      squareId: 'sq-0',
      ownerId: ownerId.toString(),
      name: 'Batedor',
      size: 'Pequeno/Médio',
    });

    const storedToken = await Token.findById(token._id);
    expect(storedToken?.movement).toBeCloseTo(6);
    expect(storedToken?.remainingMovement).toBeCloseTo(6);
  });
});
