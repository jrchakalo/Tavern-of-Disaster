import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from '../../server';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import { resetPresence } from '../../services/presenceService';
import User from '../../models/User.model';
import Table from '../../models/Table.model';
import Scene from '../../models/Scene.model';
import Token from '../../models/Token.model';
import Character from '../../models/Character.model';
import System from '../../models/System.model';
import { randomId } from '../../utils/id';

jest.setTimeout(30000);

process.env.JWT_SECRET = process.env.JWT_SECRET || 'character-integration-secret';

type RealtimeServer = ReturnType<typeof createServer>;

let realtime: RealtimeServer;
let baseUrl: string;
const openClients: ClientSocket[] = [];

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function createUser(username: string, password = 'senha123') {
  const passwordHash = await bcrypt.hash(password, 4);
  return User.create({
    username,
    email: `${username}-${randomId(6)}@test.dev`,
    passwordHash,
  });
}

function signToken(user: { _id: Types.ObjectId | string; username: string }) {
  return jwt.sign(
    { user: { id: user._id.toString(), username: user.username } },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );
}

async function createTableWithScene(
  dmId: Types.ObjectId,
  playerIds: Types.ObjectId[] = [],
  systemId?: Types.ObjectId
) {
  const table = await Table.create({
    name: `Mesa ${randomId(4)}`,
    dm: dmId,
    players: [dmId, ...playerIds],
    inviteCode: randomId(8),
    scenes: [],
    ...(systemId ? { systemId } : {}),
  });
  const scene = await Scene.create({
    tableId: table._id,
    name: 'Cena 1',
    gridWidth: 10,
    gridHeight: 10,
  });
  table.scenes = [scene._id as Types.ObjectId];
  table.activeScene = scene._id as Types.ObjectId;
  await table.save();
  return { table, scene };
}

async function createLinkedToken(options: {
  tableId: Types.ObjectId;
  sceneId: Types.ObjectId;
  ownerId: Types.ObjectId;
  characterId: Types.ObjectId;
}) {
  return Token.create({
    tableId: options.tableId,
    sceneId: options.sceneId,
    squareId: 'sq-0',
    color: '#ffffff',
    ownerId: options.ownerId,
    name: 'Token vinculado',
    movement: 9,
    remainingMovement: 9,
    size: 'Pequeno/Médio',
    canOverlap: false,
    characterId: options.characterId,
  });
}

function connectClient(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    openClients.push(client);
    const timer = setTimeout(() => {
      client.close();
      reject(new Error('Timeout ao conectar socket de teste'));
    }, 8000);
    client.once('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once('connect_error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function onceEvent<T = any>(client: ClientSocket, event: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, handler);
      reject(new Error(`Timeout aguardando evento ${event}`));
    }, timeoutMs);
    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    client.once(event, handler);
  });
}

function emitAck<T = any>(client: ClientSocket, event: string, payload?: unknown, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout aguardando ack de ${event}`)), timeoutMs);
    if (payload === undefined) {
      client.emit(event, (ack: T) => {
        clearTimeout(timer);
        resolve(ack);
      });
      return;
    }
    client.emit(event, payload, (ack: T) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

async function joinTable(client: ClientSocket, tableId: string) {
  const snapshotPromise = onceEvent(client, 'sessionSnapshot');
  const ack = await emitAck(client, 'joinTable', tableId);
  const snapshot = ack?.ok ? await snapshotPromise : null;
  return { ack, snapshot };
}

async function resync(client: ClientSocket, tableId: string) {
  const snapshotPromise = onceEvent(client, 'sessionSnapshot');
  const ack = await emitAck(client, 'requestResync', { tableId });
  const snapshot = await snapshotPromise;
  return { ack, snapshot };
}

beforeAll(async () => {
  await connectMongoMemory();
  realtime = createServer();
  await new Promise<void>((resolve) => {
    realtime.server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = realtime.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Não foi possível obter a porta do servidor de teste');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  while (openClients.length) {
    const client = openClients.pop();
    client?.removeAllListeners();
    client?.close();
  }
  resetPresence();
  await sleep(20);
  await clearMongoMemory();
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    realtime.io.close(() => resolve());
  });
  await new Promise<void>((resolve) => {
    realtime.server.close(() => resolve());
  });
  await disconnectMongoMemory();
});

describe('character realtime (2+ clients)', () => {
  it('1. membro cria ficha; patch characters chega aos dois clientes e o snapshot traz o resumo', async () => {
    const system = await System.create({ key: 'dnd5e', name: 'D&D 5e' });
    const dm = await createUser('dm-char-create');
    const player = await createUser('player-char-create');
    const { table } = await createTableWithScene(dm._id, [player._id], system._id as Types.ObjectId);

    const dmClient = await connectClient(signToken(dm));
    const playerClient = await connectClient(signToken(player));
    expect((await joinTable(dmClient, table._id.toString())).ack.ok).toBe(true);
    expect((await joinTable(playerClient, table._id.toString())).ack.ok).toBe(true);

    const dmPatchPromise = onceEvent(dmClient, 'sessionPatch');
    const playerPatchPromise = onceEvent(playerClient, 'sessionPatch');
    const ack = await emitAck(playerClient, 'requestCreateCharacter', {
      tableId: table._id.toString(),
      character: {
        name: 'Aria',
        profile: { className: 'Guerreira', level: 3, race: 'Humana', hitDice: '3d10' },
        attributes: { STR: 16, DEX: 14, CON: 15, INT: 10, WIS: 12, CHA: 8 },
        stats: { currentHP: 24, maxHP: 28, defense: 16, baseInitiative: 2 },
        skills: { athletics: 5 },
        proficientSaves: ['STR', 'CON'],
        proficientSkills: ['athletics', 'perception'],
        expertiseSkills: ['athletics'],
        attacks: [{ name: 'Espada longa', bonus: '+5', damage: '1d8+3' }],
        features: [{ name: 'Ação de surto', description: 'Uma ação extra.' }],
        inventory: [{ name: 'Corda', quantity: 1, notes: '15 m' }],
        spellSlots: { '1': { used: 0, max: 2 } },
      },
    });
    const [dmPatch, playerPatch] = await Promise.all([dmPatchPromise, playerPatchPromise]);

    expect(ack.ok).toBe(true);
    expect(ack.revision).toBe(1);
    for (const patch of [dmPatch, playerPatch]) {
      expect(patch.revision).toBe(1);
      expect(patch.changes.characters).toHaveLength(1);
      expect(patch.changes.characters[0]).toMatchObject({
        name: 'Aria',
        ownerId: player._id.toString(),
        systemKey: 'dnd5e',
        level: 3,
        currentHP: 24,
        maxHP: 28,
        defense: 16,
        tokenId: null,
      });
    }

    const stored = await Character.findOne({ tableId: table._id });
    expect(stored?.ownerId.toString()).toBe(player._id.toString());
    expect(stored?.systemKey).toBe('dnd5e');
    expect(stored?.attacks?.[0]).toMatchObject({ name: 'Espada longa', bonus: '+5' });
    const spellSlots = stored?.spellSlots as unknown as Map<string, { used?: number; max?: number }>;
    expect(spellSlots?.get('1')).toMatchObject({ used: 0, max: 2 });

    const { snapshot } = await resync(dmClient, table._id.toString());
    expect(snapshot.characters).toHaveLength(1);
    expect(snapshot.characters[0]._id).toBe(stored!._id.toString());
  });

  it('2. DM cria ficha para jogador; jogador não pode escolher outro dono', async () => {
    const dm = await createUser('dm-char-owner');
    const player = await createUser('player-char-owner');
    const other = await createUser('player-char-owner-2');
    const { table } = await createTableWithScene(dm._id, [player._id, other._id]);

    const dmClient = await connectClient(signToken(dm));
    const playerClient = await connectClient(signToken(player));
    await joinTable(dmClient, table._id.toString());
    await joinTable(playerClient, table._id.toString());

    const forPlayer = await emitAck(dmClient, 'requestCreateCharacter', {
      tableId: table._id.toString(),
      ownerId: player._id.toString(),
      character: { name: 'Ficha do jogador' },
    });
    expect(forPlayer.ok).toBe(true);
    const created = await Character.findOne({ tableId: table._id, ownerId: player._id });
    expect(created).not.toBeNull();

    const playerForOther = await emitAck(playerClient, 'requestCreateCharacter', {
      tableId: table._id.toString(),
      ownerId: other._id.toString(),
      character: { name: 'Ficha alheia' },
    });
    expect(playerForOther.ok).toBe(false);
    expect(playerForOther.error.code).toBe('FORBIDDEN');
    expect(await Character.countDocuments({ tableId: table._id })).toBe(1);
  });

  it('3. atualização: dono e DM podem, outro jogador não; ownerId no patch é rejeitado', async () => {
    const dm = await createUser('dm-char-update');
    const owner = await createUser('player-char-update');
    const intruder = await createUser('player-char-intruder');
    const { table } = await createTableWithScene(dm._id, [owner._id, intruder._id]);

    const dmClient = await connectClient(signToken(dm));
    const ownerClient = await connectClient(signToken(owner));
    const intruderClient = await connectClient(signToken(intruder));
    await joinTable(dmClient, table._id.toString());
    await joinTable(ownerClient, table._id.toString());
    await joinTable(intruderClient, table._id.toString());

    const createAck = await emitAck(ownerClient, 'requestCreateCharacter', {
      tableId: table._id.toString(),
      character: { name: 'Kael', notes: 'Original' },
    });
    expect(createAck.ok).toBe(true);
    const character = await Character.findOne({ tableId: table._id });
    const characterId = character!._id.toString();

    const denied = await emitAck(intruderClient, 'requestUpdateCharacter', {
      tableId: table._id.toString(),
      characterId,
      patch: { notes: 'Invadido' },
    });
    expect(denied.ok).toBe(false);
    expect(denied.error.code).toBe('FORBIDDEN');
    expect((await Character.findById(characterId))?.notes).toBe('Original');
    expect((await Table.findById(table._id))?.revision).toBe(1);

    const forbiddenField = await emitAck(ownerClient, 'requestUpdateCharacter', {
      tableId: table._id.toString(),
      characterId,
      patch: { ownerId: intruder._id.toString() },
    });
    expect(forbiddenField.ok).toBe(false);
    expect(forbiddenField.error.code).toBe('VALIDATION');

    const forbiddenTable = await emitAck(ownerClient, 'requestUpdateCharacter', {
      tableId: table._id.toString(),
      characterId,
      patch: { tableId: table._id.toString() },
    });
    expect(forbiddenTable.ok).toBe(false);
    expect(forbiddenTable.error.code).toBe('VALIDATION');

    const patchPromise = onceEvent(ownerClient, 'sessionPatch');
    const dmUpdate = await emitAck(dmClient, 'requestUpdateCharacter', {
      tableId: table._id.toString(),
      characterId,
      patch: { notes: 'Ajustado pelo Mestre', profile: { level: 4 } },
    });
    const patch = await patchPromise;
    expect(dmUpdate.ok).toBe(true);
    expect(dmUpdate.revision).toBe(2);
    expect(patch.changes.characterUpdates[0]).toMatchObject({
      characterId,
      patch: { name: 'Kael', level: 4 },
    });
    expect((await Character.findById(characterId))?.notes).toBe('Ajustado pelo Mestre');

    const ownerUpdate = await emitAck(ownerClient, 'requestUpdateCharacter', {
      tableId: table._id.toString(),
      characterId,
      patch: { name: 'Kael, o Bravo' },
    });
    expect(ownerUpdate.ok).toBe(true);
    expect(ownerUpdate.revision).toBe(3);
    expect((await Character.findById(characterId))?.name).toBe('Kael, o Bravo');
  });

  it('4. PV propaga para todos os tokens vinculados; fora de 0..maxHP é VALIDATION', async () => {
    const dm = await createUser('dm-char-hp');
    const player = await createUser('player-char-hp');
    const { table, scene } = await createTableWithScene(dm._id, [player._id]);

    const dmClient = await connectClient(signToken(dm));
    const playerClient = await connectClient(signToken(player));
    await joinTable(dmClient, table._id.toString());
    await joinTable(playerClient, table._id.toString());

    const createAck = await emitAck(playerClient, 'requestCreateCharacter', {
      tableId: table._id.toString(),
      character: { name: 'Borin', stats: { currentHP: 20, maxHP: 20, defense: 15 } },
    });
    expect(createAck.ok).toBe(true);
    const character = await Character.findOne({ tableId: table._id });
    const token = await createLinkedToken({
      tableId: table._id,
      sceneId: scene._id,
      ownerId: player._id,
      characterId: character!._id,
    });

    const dmPatchPromise = onceEvent(dmClient, 'sessionPatch');
    const playerPatchPromise = onceEvent(playerClient, 'sessionPatch');
    const hpAck = await emitAck(playerClient, 'requestUpdateCharacterHp', {
      tableId: table._id.toString(),
      characterId: character!._id.toString(),
      currentHP: 7,
    });
    const [dmPatch, playerPatch] = await Promise.all([dmPatchPromise, playerPatchPromise]);

    expect(hpAck.ok).toBe(true);
    expect(hpAck.revision).toBe(2);
    for (const patch of [dmPatch, playerPatch]) {
      expect(patch.changes.characterUpdates[0].patch).toMatchObject({ currentHP: 7, maxHP: 20 });
      expect(patch.changes.tokenUpdates).toEqual([
        {
          tokenId: token._id.toString(),
          patch: {
            character: {
              _id: character!._id.toString(),
              name: 'Borin',
              currentHP: 7,
              maxHP: 20,
              defense: 15,
            },
          },
        },
      ]);
    }

    const invalid = await emitAck(playerClient, 'requestUpdateCharacterHp', {
      tableId: table._id.toString(),
      characterId: character!._id.toString(),
      currentHP: 999,
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.error.code).toBe('VALIDATION');
    expect((await Table.findById(table._id))?.revision).toBe(2);
    expect((await Character.findById(character!._id))?.stats?.currentHP).toBe(7);

    const { snapshot } = await resync(dmClient, table._id.toString());
    const tokenDTO = snapshot.tokens.find((item: any) => item._id === token._id.toString());
    expect(tokenDTO.character).toMatchObject({
      _id: character!._id.toString(),
      currentHP: 7,
      maxHP: 20,
      defense: 15,
    });
    expect(tokenDTO.characterId).toBe(character!._id.toString());
    const summary = snapshot.characters.find((item: any) => item._id === character!._id.toString());
    expect(summary.tokenId).toBe(token._id.toString());
  });

  it('5. exclusão desvincula tokens e publica charactersRemoved + tokenUpdates', async () => {
    const dm = await createUser('dm-char-delete');
    const owner = await createUser('player-char-delete');
    const intruder = await createUser('player-char-delete-2');
    const { table, scene } = await createTableWithScene(dm._id, [owner._id, intruder._id]);

    const dmClient = await connectClient(signToken(dm));
    const ownerClient = await connectClient(signToken(owner));
    const intruderClient = await connectClient(signToken(intruder));
    await joinTable(dmClient, table._id.toString());
    await joinTable(ownerClient, table._id.toString());
    await joinTable(intruderClient, table._id.toString());

    const createAck = await emitAck(ownerClient, 'requestCreateCharacter', {
      tableId: table._id.toString(),
      character: { name: 'Descartável' },
    });
    expect(createAck.ok).toBe(true);
    const character = await Character.findOne({ tableId: table._id });
    const token = await createLinkedToken({
      tableId: table._id,
      sceneId: scene._id,
      ownerId: owner._id,
      characterId: character!._id,
    });

    const denied = await emitAck(intruderClient, 'requestDeleteCharacter', {
      tableId: table._id.toString(),
      characterId: character!._id.toString(),
    });
    expect(denied.ok).toBe(false);
    expect(denied.error.code).toBe('FORBIDDEN');
    expect(await Character.findById(character!._id)).not.toBeNull();

    const dmPatchPromise = onceEvent(dmClient, 'sessionPatch');
    const ownerPatchPromise = onceEvent(ownerClient, 'sessionPatch');
    const ack = await emitAck(ownerClient, 'requestDeleteCharacter', {
      tableId: table._id.toString(),
      characterId: character!._id.toString(),
    });
    const [dmPatch, ownerPatch] = await Promise.all([dmPatchPromise, ownerPatchPromise]);

    expect(ack.ok).toBe(true);
    for (const patch of [dmPatch, ownerPatch]) {
      expect(patch.changes.charactersRemoved).toEqual([character!._id.toString()]);
      expect(patch.changes.tokenUpdates).toEqual([
        {
          tokenId: token._id.toString(),
          patch: { character: null, characterId: null },
        },
      ]);
    }
    expect(await Character.findById(character!._id)).toBeNull();
    expect((await Token.findById(token._id))?.characterId).toBeNull();
  });

  it('6. systemKey vem da mesa com fallback dnd5e e só o DM pode sobrescrever', async () => {
    const dm = await createUser('dm-char-system');
    const player = await createUser('player-char-system');
    const { table } = await createTableWithScene(dm._id, [player._id]);

    const dmClient = await connectClient(signToken(dm));
    const playerClient = await connectClient(signToken(player));
    await joinTable(dmClient, table._id.toString());
    await joinTable(playerClient, table._id.toString());

    const createAck = await emitAck(playerClient, 'requestCreateCharacter', {
      tableId: table._id.toString(),
      character: { name: 'Sem sistema' },
    });
    expect(createAck.ok).toBe(true);
    const character = await Character.findOne({ tableId: table._id });
    expect(character?.systemKey).toBe('dnd5e');

    const playerOverride = await emitAck(playerClient, 'requestUpdateCharacter', {
      tableId: table._id.toString(),
      characterId: character!._id.toString(),
      patch: { systemKey: 'cyberpunk-red' },
    });
    expect(playerOverride.ok).toBe(false);
    expect(playerOverride.error.code).toBe('FORBIDDEN');

    const dmOverride = await emitAck(dmClient, 'requestUpdateCharacter', {
      tableId: table._id.toString(),
      characterId: character!._id.toString(),
      patch: { systemKey: 'cyberpunk-red' },
    });
    expect(dmOverride.ok).toBe(true);
    expect((await Character.findById(character!._id))?.systemKey).toBe('cyberpunk-red');
  });

  it('7. vincular token pela edição de token embute o resumo da ficha no patch', async () => {
    const dm = await createUser('dm-char-link');
    const player = await createUser('player-char-link');
    const { table, scene } = await createTableWithScene(dm._id, [player._id]);

    const dmClient = await connectClient(signToken(dm));
    const playerClient = await connectClient(signToken(player));
    await joinTable(dmClient, table._id.toString());
    await joinTable(playerClient, table._id.toString());

    const createAck = await emitAck(playerClient, 'requestCreateCharacter', {
      tableId: table._id.toString(),
      character: { name: 'Lia', stats: { currentHP: 9, maxHP: 12, defense: 13 } },
    });
    expect(createAck.ok).toBe(true);
    const character = await Character.findOne({ tableId: table._id });
    const token = await Token.create({
      tableId: table._id,
      sceneId: scene._id,
      squareId: 'sq-1',
      color: '#ffffff',
      ownerId: player._id,
      name: 'Token da Lia',
      movement: 9,
      remainingMovement: 9,
      size: 'Pequeno/Médio',
      canOverlap: false,
    });

    const linkPatchPromise = onceEvent(dmClient, 'sessionPatch');
    const linkAck = await emitAck(dmClient, 'requestEditToken', {
      tableId: table._id.toString(),
      tokenId: token._id.toString(),
      patch: { characterId: character!._id.toString() },
    });
    const linkPatch = await linkPatchPromise;
    expect(linkAck.ok).toBe(true);
    expect(linkPatch.changes.tokenUpdates[0].patch).toMatchObject({
      characterId: character!._id.toString(),
      character: {
        _id: character!._id.toString(),
        name: 'Lia',
        currentHP: 9,
        maxHP: 12,
        defense: 13,
      },
    });

    const unlinkPatchPromise = onceEvent(dmClient, 'sessionPatch');
    const unlinkAck = await emitAck(dmClient, 'requestEditToken', {
      tableId: table._id.toString(),
      tokenId: token._id.toString(),
      patch: { characterId: null },
    });
    const unlinkPatch = await unlinkPatchPromise;
    expect(unlinkAck.ok).toBe(true);
    expect(unlinkPatch.changes.tokenUpdates[0].patch).toMatchObject({
      characterId: null,
      character: null,
    });
  });

  it('8. ficha de outra mesa e ficha inexistente não vazam (FORBIDDEN/NOT_FOUND)', async () => {
    const dmA = await createUser('dm-char-cross-a');
    const playerA = await createUser('player-char-cross-a');
    const dmB = await createUser('dm-char-cross-b');
    const playerB = await createUser('player-char-cross-b');
    const { table: tableA } = await createTableWithScene(dmA._id, [playerA._id]);
    const { table: tableB } = await createTableWithScene(dmB._id, [playerB._id]);

    const foreignCharacter = await Character.create({
      ownerId: playerB._id,
      tableId: tableB._id,
      name: 'Ficha da mesa B',
    });

    const client = await connectClient(signToken(playerA));
    await joinTable(client, tableA._id.toString());

    const crossTable = await emitAck(client, 'requestUpdateCharacter', {
      tableId: tableA._id.toString(),
      characterId: foreignCharacter._id.toString(),
      patch: { notes: 'tentativa' },
    });
    expect(crossTable.ok).toBe(false);
    expect(crossTable.error.code).toBe('FORBIDDEN');
    expect((await Character.findById(foreignCharacter._id))?.notes).toBeUndefined();

    const missing = await emitAck(client, 'requestDeleteCharacter', {
      tableId: tableA._id.toString(),
      characterId: new Types.ObjectId().toString(),
    });
    expect(missing.ok).toBe(false);
    expect(missing.error.code).toBe('NOT_FOUND');
  });
});
