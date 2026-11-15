import { Types } from 'mongoose';
import System from '../../models/System.model';
import Table from '../../models/Table.model';
import Character from '../../models/Character.model';
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

  it('copies the table system key and falls back to dnd5e', async () => {
    const system = await System.create({ key: 'cyberpunk-red', name: 'Cyberpunk RED' });
    const table = await Table.create({
      name: 'Mesa Cyberpunk',
      dm: dmId,
      players: [playerId],
      inviteCode: 'INV-SYS',
      scenes: [],
      systemId: system._id,
    });
    const withSystem = await createCharacter(playerId.toString(), table._id.toString(), {
      name: 'V',
    });
    expect(withSystem.systemKey).toBe('cyberpunk-red');

    const tableWithoutSystem = await Table.create({
      name: 'Mesa sem sistema',
      dm: dmId,
      players: [playerId],
      inviteCode: 'INV-NOSYS',
      scenes: [],
    });
    const fallback = await createCharacter(playerId.toString(), tableWithoutSystem._id.toString(), {
      name: 'Sem sistema',
    });
    expect(fallback.systemKey).toBe('dnd5e');
  });

  it('merges partial stats and validates HP against maxHP', async () => {
    const table = await Table.create({
      name: 'Mesa Stats',
      dm: dmId,
      players: [playerId],
      inviteCode: 'INV-STATS',
      scenes: [],
    });
    const created = await createCharacter(playerId.toString(), table._id.toString(), {
      name: 'Borin',
      stats: { currentHP: 10, maxHP: 10, defense: 12 },
    });
    const characterId = created._id.toString();

    const updated = await updateCharacter(playerId.toString(), table._id.toString(), characterId, {
      stats: { currentHP: 5 },
    });
    expect(updated.stats?.currentHP).toBe(5);
    expect(updated.stats?.maxHP).toBe(10);
    expect(updated.stats?.defense).toBe(12);

    await expect(
      updateCharacter(playerId.toString(), table._id.toString(), characterId, {
        stats: { currentHP: 99 },
      })
    ).rejects.toThrow('HP atual não pode exceder o máximo.');
    expect((await Character.findById(characterId))?.stats?.currentHP).toBe(5);
  });

  it('seeds OP2 attributes and preserves PD/armor on partial stat updates', async () => {
    const system = await System.create({
      key: 'ordem-paranormal-2',
      name: 'Ordem Paranormal 2 (Playtest)',
    });
    const table = await Table.create({
      name: 'Mesa OP2',
      dm: dmId,
      players: [playerId],
      inviteCode: 'INV-OP2',
      scenes: [],
      systemId: system._id,
    });

    const created = await createCharacter(playerId.toString(), table._id.toString(), {
      name: 'Agente',
      attributes: { fisico: 8 },
      stats: {
        currentHP: 10,
        maxHP: 10,
        currentPD: 5,
        maxPD: 5,
        armorPoints: 2,
        armorPointsMax: 3,
      },
      skills: { luta: 10, pontaria: 6 },
    });

    expect(mapToPlainObject(created.attributes as any)).toMatchObject({
      fisico: 8,
      mente: 6,
      emocao: 6,
    });
    expect(created.systemKey).toBe('ordem-paranormal-2');
    expect(mapToPlainObject(created.skills as any)).toMatchObject({ luta: 10, pontaria: 6 });

    const updated = await updateCharacter(playerId.toString(), table._id.toString(), created._id.toString(), {
      stats: { currentPD: 3 },
    });
    expect(updated.stats?.currentPD).toBe(3);
    expect(updated.stats?.maxPD).toBe(5);
    expect(updated.stats?.currentHP).toBe(10);
    expect(updated.stats?.maxHP).toBe(10);
    expect(updated.stats?.armorPoints).toBe(2);
    expect(updated.stats?.armorPointsMax).toBe(3);

    await expect(
      updateCharacter(playerId.toString(), table._id.toString(), created._id.toString(), {
        stats: { currentPD: 9 },
      })
    ).rejects.toThrow('PD atual não pode exceder o máximo.');
    await expect(
      updateCharacter(playerId.toString(), table._id.toString(), created._id.toString(), {
        stats: { armorPoints: 4 },
      })
    ).rejects.toThrow('Pontos de armadura atuais não podem exceder o máximo.');
  });

  it('seeds OPSH attributes at 1 without overwriting provided values', async () => {
    const system = await System.create({
      key: 'ordem-paranormal-sobrevivendo-ao-horror',
      name: 'Ordem Paranormal: Sobrevivendo ao Horror',
    });
    const table = await Table.create({
      name: 'Mesa OPSH',
      dm: dmId,
      players: [playerId],
      inviteCode: 'INV-OPSH',
      scenes: [],
      systemId: system._id,
    });

    const created = await createCharacter(playerId.toString(), table._id.toString(), {
      name: 'Sobrevivente',
      attributes: { vigor: 3 },
    });

    expect(mapToPlainObject(created.attributes as any)).toMatchObject({
      agilidade: 1,
      forca: 1,
      intelecto: 1,
      presenca: 1,
      vigor: 3,
    });
  });

  it('validates OP2 skill dice as numbers only for the OP2 system', async () => {
    const system = await System.create({
      key: 'ordem-paranormal-2',
      name: 'Ordem Paranormal 2 (Playtest)',
    });
    const table = await Table.create({
      name: 'Mesa OP2 Perícias',
      dm: dmId,
      players: [playerId],
      inviteCode: 'INV-OP2-SKILLS',
      scenes: [],
      systemId: system._id,
    });

    await expect(
      createCharacter(playerId.toString(), table._id.toString(), {
        name: 'Inválido',
        skills: { luta: 7 },
      })
    ).rejects.toThrow('Dado inválido para a perícia "luta"');

    await expect(
      createCharacter(playerId.toString(), table._id.toString(), {
        name: 'Texto',
        skills: { luta: 'd10' },
      })
    ).rejects.toThrow('precisa de um dado');

    const valid = await createCharacter(playerId.toString(), table._id.toString(), {
      name: 'Válido',
      skills: { luta: 8, bruxaria: 20 },
    });
    expect(mapToPlainObject(valid.skills as any)).toMatchObject({ luta: 8, bruxaria: 20 });

    const updated = await updateCharacter(playerId.toString(), table._id.toString(), valid._id.toString(), {
      skills: { luta: 6 },
    });
    expect(mapToPlainObject(updated.skills as any)).toMatchObject({ luta: 6 });

    await expect(
      updateCharacter(playerId.toString(), table._id.toString(), valid._id.toString(), {
        skills: { luta: 5 },
      })
    ).rejects.toThrow('Dado inválido para a perícia "luta"');

    // D&D continua aceitando valores textuais (expertise) sem validação de dado.
    const dndTable = await Table.create({
      name: 'Mesa D&D',
      dm: dmId,
      players: [playerId],
      inviteCode: 'INV-DND-SKILLS',
      scenes: [],
    });
    const dnd = await createCharacter(playerId.toString(), dndTable._id.toString(), {
      name: 'D&D',
      skills: { athletics: 'expertise' },
    });
    expect(dnd.systemKey).toBe('dnd5e');
    expect(mapToPlainObject(dnd.skills as any)).toMatchObject({ athletics: 'expertise' });
  });
});
