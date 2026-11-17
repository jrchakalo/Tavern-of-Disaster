import System from '../System.model';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';

describe('System model CRUD', () => {
  beforeAll(async () => {
    await connectMongoMemory();
  });

  afterEach(async () => {
    await clearMongoMemory();
  });

  afterAll(async () => {
    await disconnectMongoMemory();
  });

  it('creates, reads, updates and deletes a system document', async () => {
    const created = await System.create({
      key: 'dnd5e',
      name: 'Dungeons & Dragons 5e',
      description: 'Sistema clássico de fantasia',
      defaultAttributes: [
        { key: 'str', label: 'Força', type: 'number' },
        { key: 'dex', label: 'Destreza', type: 'number' },
      ],
      movementRules: {
        baseSpeedFeet: 30,
        diagonalRule: '5-10-5',
        gridSizeFeet: 5,
      },
      dicePresets: [
        { key: 'atk', label: 'Ataque', expression: '1d20+5' },
      ],
      docsUrl: 'https://example.com',
    });

    const fetched = await System.findOne({ key: 'dnd5e' });
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe('Dungeons & Dragons 5e');

    fetched!.name = 'D&D 5e Atualizado';
    await fetched!.save();

    const updated = await System.findById(created._id);
    expect(updated?.name).toBe('D&D 5e Atualizado');

    await System.findByIdAndDelete(created._id);
    const shouldBeNull = await System.findById(created._id);
    expect(shouldBeNull).toBeNull();
  });
});
