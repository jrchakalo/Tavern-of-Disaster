import { Types } from 'mongoose';
import System from '../../models/System.model';
import Table from '../../models/Table.model';
import { createCharacter } from '../characterService';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';

function mapToPlainObject(map?: Map<string, number> | Record<string, number>) {
  if (!map) return {};
  if (map instanceof Map) {
    return Object.fromEntries(map.entries());
  }
  return { ...map };
}

describe('characterService.createCharacter', () => {
  const dmId = new Types.ObjectId();
  const playerId = new Types.ObjectId();

  beforeAll(async () => {
    await connectMongoMemory();
  });

  afterEach(async () => {
    await clearMongoMemory();
  });

  afterAll(async () => {
    await disconnectMongoMemory();
  });

  it('initializes numeric attributes based on system defaults', async () => {
    const system = await System.create({
      key: 'pbta',
      name: 'Powered by the Apocalypse',
      defaultAttributes: [
        { key: 'body', label: 'Corpo', type: 'number' },
        { key: 'mind', label: 'Mente', type: 'number' },
      ],
    });

    const table = await Table.create({
      name: 'Mesa Teste',
      dm: dmId,
      players: [playerId],
      inviteCode: 'INV123',
      scenes: [],
      systemId: system._id,
    });

    const character = await createCharacter(playerId.toString(), table._id.toString(), {
      name: 'Ava',
      attributes: {
        body: 2,
        charm: 1,
      },
    });

    const attrs = mapToPlainObject(character.attributes as any);
    expect(attrs).toMatchObject({ body: 2, mind: 0, charm: 1 });
    expect(attrs).not.toHaveProperty('nonexistent');
  });
});
