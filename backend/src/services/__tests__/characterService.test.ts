import { Types } from 'mongoose';
import System from '../../models/System.model';
import Table from '../../models/Table.model';
import { createCharacter, updateCharacter } from '../characterService';
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

  it('enforces owner vs DM permissions when updating a character', async () => {
    const secondPlayerId = new Types.ObjectId();
    const table = await Table.create({
      name: 'Mesa com Permissões',
      dm: dmId,
      players: [playerId, secondPlayerId],
      inviteCode: 'INV-PERM',
      scenes: [],
    });

    const created = await createCharacter(playerId.toString(), table._id.toString(), {
      name: 'Kael',
    });
    const createdId = (created._id as Types.ObjectId).toString();

    await expect(
      updateCharacter(secondPlayerId.toString(), table._id.toString(), createdId, {
        notes: 'Tentativa não autorizada',
      }),
    ).rejects.toThrow('Você não tem permissão para editar este personagem.');

    const dmUpdated = await updateCharacter(dmId.toString(), table._id.toString(), createdId, {
      notes: 'Ajustado pelo Mestre',
    });
    expect(dmUpdated.notes).toBe('Ajustado pelo Mestre');

    const ownerUpdated = await updateCharacter(playerId.toString(), table._id.toString(), createdId, {
      notes: 'Atualização final do dono',
    });
    expect(ownerUpdated.notes).toBe('Atualização final do dono');
  });
});
