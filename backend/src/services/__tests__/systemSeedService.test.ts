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

  it('seeds D&D 5e, Cyberpunk RED, OP2 and OPSH with attributes and presets', async () => {
    const result = await seedSystems();
    expect(result.inserted.sort()).toEqual([
      'cyberpunk-red',
      'dnd5e',
      'ordem-paranormal-2',
      'ordem-paranormal-sobrevivendo-ao-horror',
    ]);
    expect(result.existing).toEqual([]);

    const systems = await System.find({}).lean();
    expect(systems).toHaveLength(4);

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

    const op2 = systems.find((system) => system.key === 'ordem-paranormal-2');
    expect(op2?.name).toBe('Ordem Paranormal 2 (Playtest)');
    expect(op2?.defaultAttributes?.map((attr) => attr.key)).toEqual(['fisico', 'mente', 'emocao']);
    expect(op2?.defaultAttributes?.every((attr) => attr.type === 'number')).toBe(true);
    expect(op2?.movementRules).toBeUndefined();
    expect(op2?.dicePresets?.map((preset) => preset.expression)).toEqual([
      '1d4',
      '1d6',
      '1d8',
      '1d10',
      '1d12',
      '1d6',
      '1d8',
      '1d10',
    ]);

    const opsh = systems.find(
      (system) => system.key === 'ordem-paranormal-sobrevivendo-ao-horror'
    );
    expect(opsh?.name).toBe('Ordem Paranormal: Sobrevivendo ao Horror');
    expect(opsh?.defaultAttributes?.map((attr) => attr.key)).toEqual([
      'agilidade',
      'forca',
      'intelecto',
      'presenca',
      'vigor',
    ]);
    expect(opsh?.dicePresets?.map((preset) => preset.expression)).toEqual([
      '1d20',
      '2d20kh1',
      '3d20kh1',
      '4d20kh1',
    ]);
  });

  it('is idempotent and never overwrites an existing system', async () => {
    await seedSystems();
    await System.updateOne({ key: 'dnd5e' }, { $set: { name: 'D&D Customizado' } });

    const secondRun = await seedSystems();
    expect(secondRun.inserted).toEqual([]);
    expect(secondRun.existing.sort()).toEqual([
      'cyberpunk-red',
      'dnd5e',
      'ordem-paranormal-2',
      'ordem-paranormal-sobrevivendo-ao-horror',
    ]);
    expect(await System.countDocuments({})).toBe(SYSTEM_SEEDS.length);

    const dnd = await System.findOne({ key: 'dnd5e' });
    expect(dnd?.name).toBe('D&D Customizado');
  });
});
