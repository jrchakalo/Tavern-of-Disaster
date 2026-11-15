import System from '../../models/System.model';
import { SYSTEM_SEEDS, seedSystems } from '../systemSeedService';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';

describe('systemSeedService', () => {
  beforeAll(async () => {
    await connectMongoMemory();
  });

  afterEach(async () => {
    await clearMongoMemory();
  });

  afterAll(async () => {
    await disconnectMongoMemory();
  });

  it('seeds D&D 5e and Cyberpunk RED with attributes and presets', async () => {
    const result = await seedSystems();
    expect(result.inserted.sort()).toEqual(['cyberpunk-red', 'dnd5e']);
    expect(result.existing).toEqual([]);

    const systems = await System.find({}).lean();
    expect(systems).toHaveLength(2);

    const dnd = systems.find((system) => system.key === 'dnd5e');
    expect(dnd?.name).toBe('D&D 5e');
    expect(dnd?.defaultAttributes?.map((attr) => attr.key)).toEqual([
      'STR',
      'DEX',
      'CON',
      'INT',
      'WIS',
      'CHA',
    ]);
    expect(dnd?.movementRules).toMatchObject({ baseSpeedFeet: 30, gridSizeFeet: 5 });
    expect(dnd?.dicePresets?.map((preset) => preset.expression)).toEqual([
      'd20',
      'd20+5',
      '2d6+3',
      '4d6kh3',
      '1d100',
    ]);

    const cyberpunk = systems.find((system) => system.key === 'cyberpunk-red');
    expect(cyberpunk?.name).toBe('Cyberpunk RED');
    expect(cyberpunk?.defaultAttributes?.map((attr) => attr.key)).toEqual([
      'INT',
      'REF',
      'DEX',
      'TECH',
      'COOL',
      'WILL',
      'LUCK',
      'MOVE',
      'BODY',
      'EMP',
    ]);
    expect(cyberpunk?.dicePresets?.map((preset) => preset.expression)).toEqual([
      '1d10!',
      '1d10!+6',
      '2d6',
      '3d6',
    ]);
  });

  it('is idempotent and never overwrites an existing system', async () => {
    await seedSystems();
    await System.updateOne({ key: 'dnd5e' }, { $set: { name: 'D&D Customizado' } });

    const secondRun = await seedSystems();
    expect(secondRun.inserted).toEqual([]);
    expect(secondRun.existing.sort()).toEqual(['cyberpunk-red', 'dnd5e']);
    expect(await System.countDocuments({})).toBe(SYSTEM_SEEDS.length);

    const dnd = await System.findOne({ key: 'dnd5e' });
    expect(dnd?.name).toBe('D&D Customizado');
  });
});
