import { Types } from 'mongoose';
import Character, {
  ICharacter,
  CharacterStats,
  CharacterProfile,
  CharacterAttack,
  CharacterFeature,
  CharacterInventoryItem,
  CharacterSpellSlot,
} from '../models/Character.model';
import Table, { ITable } from '../models/Table.model';
import System, { ISystem } from '../models/System.model';
import Token from '../models/Token.model';
import { ServiceError } from './serviceErrors';
import type { CreateCharacterPayload, UpdateCharacterPayload } from '../validation/schemas';

class NotFoundError extends ServiceError {
  constructor(message: string) {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class ForbiddenError extends ServiceError {
  constructor(message: string) {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

class UnauthorizedError extends ServiceError {
  constructor(message: string) {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

function assertAuthenticated(userId?: string): asserts userId is string {
  if (!userId) {
    throw new UnauthorizedError('Usuário não autenticado.');
  }
}

async function getTableOrThrow(tableId: string): Promise<ITable> {
  const table = await Table.findById(tableId);
  if (!table) {
    throw new NotFoundError('Mesa não encontrada.');
  }
  return table;
}

function isDM(userId: string | undefined, table: ITable): boolean {
  if (!userId) return false;
  return table.dm.toString() === userId;
}

function isTableMember(userId: string, table: ITable): boolean {
  return isDM(userId, table) || table.players.some((player) => player.toString() === userId);
}

function assertUserInTableOrDm(userId: string | undefined, table: ITable) {
  assertAuthenticated(userId);
  if (!isTableMember(userId, table)) {
    throw new ForbiddenError('Usuário não faz parte desta mesa.');
  }
}

function toPlainStats(stats?: CharacterStats | null): CharacterStats {
  if (!stats) return {};
  const maybeDocument = stats as CharacterStats & { toObject?: () => CharacterStats };
  const plain = typeof maybeDocument.toObject === 'function' ? maybeDocument.toObject() : stats;
  return {
    currentHP: plain.currentHP,
    maxHP: plain.maxHP,
    defense: plain.defense,
    baseInitiative: plain.baseInitiative,
  };
}

function validateStats(stats?: CharacterStats) {
  if (!stats) return;
  const { currentHP, maxHP, defense } = stats;
  if (currentHP != null && currentHP < 0) {
    throw new ServiceError('Pontos de vida atuais não podem ser negativos.');
  }
  if (maxHP != null && maxHP < 0) {
    throw new ServiceError('Pontos de vida máximos não podem ser negativos.');
  }
  if (currentHP != null && maxHP != null && currentHP > maxHP) {
    throw new ServiceError('HP atual não pode exceder o máximo.');
  }
  if (defense != null && defense < 0) {
    throw new ServiceError('Defesa não pode ser negativa.');
  }
}

function sanitizeName(name?: string): string {
  const trimmed = name?.trim();
  if (!trimmed) {
    throw new ServiceError('Nome do personagem é obrigatório.');
  }
  return trimmed;
}

async function loadTableSystem(table: ITable): Promise<ISystem | null> {
  if (!table.systemId) {
    return null;
  }
  return System.findById(table.systemId).select('key defaultAttributes');
}

function mergeWithSystemDefaultAttributes(system: ISystem | null, provided?: Record<string, number>) {
  if (!system && !provided) {
    return {};
  }
  const merged: Record<string, number> = {};
  if (system?.defaultAttributes?.length) {
    system.defaultAttributes.forEach((attr) => {
      const key = (attr.key || '').trim();
      if (!key) return;
      if (attr.type && attr.type !== 'number') return;
      if (!(key in merged)) {
        merged[key] = 0;
      }
    });
  }
  if (provided) {
    Object.entries(provided).forEach(([key, value]) => {
      if (typeof value !== 'number' || Number.isNaN(value)) return;
      const normalizedKey = key.trim();
      merged[normalizedKey] = value;
    });
  }
  return merged;
}

/** Chave do sistema: cópia da mesa, sobrescrita apenas pelo Mestre, fallback dnd5e. */
async function resolveSystemKey(
  table: ITable,
  payloadSystemKey: string | undefined,
  userIsDM: boolean
): Promise<string> {
  if (payloadSystemKey && userIsDM) {
    return payloadSystemKey;
  }
  const system = await loadTableSystem(table);
  return system?.key || 'dnd5e';
}

function assignCharacterFields(character: ICharacter, payload: UpdateCharacterPayload) {
  if (payload.name !== undefined) {
    character.name = sanitizeName(payload.name);
  }
  if (payload.avatarUrl !== undefined) {
    character.avatarUrl = payload.avatarUrl;
  }
  if (payload.profile !== undefined) {
    character.profile = payload.profile as CharacterProfile;
  }
  if (payload.attributes !== undefined) {
    character.attributes = payload.attributes as Record<string, number>;
  }
  if (payload.skills !== undefined) {
    character.skills = payload.skills as Record<string, number | string>;
  }
  if (payload.proficientSaves !== undefined) {
    character.proficientSaves = payload.proficientSaves;
  }
  if (payload.proficientSkills !== undefined) {
    character.proficientSkills = payload.proficientSkills;
  }
  if (payload.expertiseSkills !== undefined) {
    character.expertiseSkills = payload.expertiseSkills;
  }
  if (payload.attacks !== undefined) {
    character.attacks = payload.attacks as CharacterAttack[];
  }
  if (payload.features !== undefined) {
    character.features = payload.features as CharacterFeature[];
  }
  if (payload.inventory !== undefined) {
    character.inventory = payload.inventory as CharacterInventoryItem[];
  }
  if (payload.spellSlots !== undefined) {
    character.spellSlots = payload.spellSlots as Record<string, CharacterSpellSlot>;
  }
  if (payload.notes !== undefined) {
    character.notes = payload.notes;
  }
  if (payload.stats !== undefined) {
    // Merge preserva campos que o cliente não enviou (ex.: só currentHP).
    const merged = { ...toPlainStats(character.stats), ...payload.stats };
    validateStats(merged);
    character.stats = merged;
  }
}

export async function getMyCharacters(userId: string, tableId: string) {
  const table = await getTableOrThrow(tableId);
  assertUserInTableOrDm(userId, table);
  return Character.find({ tableId: table._id, ownerId: userId }).sort({ createdAt: 1 });
}

export async function getTableCharacters(userId: string, tableId: string) {
  const table = await getTableOrThrow(tableId);
  if (!isDM(userId, table)) {
    throw new ForbiddenError('Somente o Mestre pode ver todos os personagens.');
  }
  return Character.find({ tableId: table._id }).sort({ createdAt: 1 });
}

export async function createCharacter(
  userId: string,
  tableId: string,
  payload: CreateCharacterPayload,
  options: { ownerId?: string } = {}
) {
  const table = await getTableOrThrow(tableId);
  assertUserInTableOrDm(userId, table);
  const userIsDM = isDM(userId, table);

  // Dono padrão é quem criou. O Mestre pode criar para outro membro da mesa.
  let ownerId = userId;
  if (options.ownerId && options.ownerId !== userId) {
    if (!userIsDM) {
      throw new ForbiddenError('Somente o Mestre pode criar ficha para outro jogador.');
    }
    if (!isTableMember(options.ownerId, table)) {
      throw new ServiceError('O dono informado não faz parte desta mesa.');
    }
    ownerId = options.ownerId;
  }

  const name = sanitizeName(payload.name);
  validateStats(payload.stats);
  const system = await loadTableSystem(table);
  const attributes = system
    ? mergeWithSystemDefaultAttributes(system, payload.attributes)
    : payload.attributes ?? {};
  const systemKey = await resolveSystemKey(table, payload.systemKey, userIsDM);

  const character = new Character({
    name,
    ownerId: new Types.ObjectId(ownerId),
    tableId: table._id,
    avatarUrl: payload.avatarUrl,
    systemKey,
    profile: payload.profile,
    attributes,
    stats: payload.stats ?? {},
    skills: payload.skills ?? {},
    proficientSaves: payload.proficientSaves ?? [],
    proficientSkills: payload.proficientSkills ?? [],
    expertiseSkills: payload.expertiseSkills ?? [],
    attacks: payload.attacks ?? [],
    features: payload.features ?? [],
    inventory: payload.inventory ?? [],
    spellSlots: payload.spellSlots ?? {},
    notes: payload.notes,
  });
  await character.save();
  return character;
}

async function getCharacterOrThrow(characterId: string) {
  if (!Types.ObjectId.isValid(characterId)) {
    throw new NotFoundError('Personagem não encontrado.');
  }
  const character = await Character.findById(characterId);
  if (!character) {
    throw new NotFoundError('Personagem não encontrado.');
  }
  return character;
}

export type CharacterContext = {
  character: ICharacter;
  table: ITable;
};

/**
 * Resolve ficha -> mesa SEM confiar no tableId do payload (invariante de authz).
 */
export async function loadCharacterContext(characterId: string): Promise<CharacterContext> {
  const character = await getCharacterOrThrow(characterId);
  const table = await Table.findById(character.tableId);
  if (!table) {
    throw new NotFoundError('Mesa do personagem não encontrada.');
  }
  return { character, table };
}

export function assertCharacterBelongsToTable(character: ICharacter, tableId: string) {
  if (character.tableId.toString() !== tableId) {
    // FORBIDDEN evita revelar a existência de ficha de outra mesa.
    throw new ForbiddenError('Ação não permitida para esta mesa.');
  }
}

function assertCanMutateCharacter(userId: string | undefined, table: ITable, character: ICharacter) {
  assertAuthenticated(userId);
  const isOwner = character.ownerId.toString() === userId;
  if (!isOwner && !isDM(userId, table)) {
    throw new ForbiddenError('Você não tem permissão para editar este personagem.');
  }
}

async function applyCharacterUpdate(
  userId: string,
  table: ITable,
  character: ICharacter,
  payload: UpdateCharacterPayload
) {
  assertCanMutateCharacter(userId, table, character);

  if (payload.systemKey !== undefined && !isDM(userId, table)) {
    throw new ForbiddenError('Somente o Mestre pode alterar o sistema da ficha.');
  }
  if (payload.systemKey !== undefined) {
    character.systemKey = payload.systemKey;
  }

  assignCharacterFields(character, payload);
  await character.save();
  return character;
}

export async function updateCharacter(
  userId: string,
  tableId: string,
  characterId: string,
  payload: UpdateCharacterPayload
) {
  const { character, table } = await loadCharacterContext(characterId);
  assertCharacterBelongsToTable(character, tableId);
  return applyCharacterUpdate(userId, table, character, payload);
}

/** Atualiza a ficha já resolvida (usado pelos handlers realtime). */
export async function updateCharacterByContext(
  userId: string,
  context: CharacterContext,
  payload: UpdateCharacterPayload
) {
  return applyCharacterUpdate(userId, context.table, context.character, payload);
}

/** Atalho de PV: valida 0..maxHP sem tocar no resto do objeto stats. */
export async function updateCharacterHp(
  userId: string,
  characterId: string,
  currentHP: number,
  claimedTableId?: string
) {
  const context = await loadCharacterContext(characterId);
  if (claimedTableId !== undefined) {
    assertCharacterBelongsToTable(context.character, claimedTableId);
  }
  assertCanMutateCharacter(userId, context.table, context.character);

  const stats = { ...toPlainStats(context.character.stats), currentHP };
  validateStats(stats);
  context.character.stats = stats;
  await context.character.save();
  return context;
}

/** Tokens vinculados à ficha (todas as cenas da mesa). */
export async function findTokensLinkedToCharacter(characterId: string) {
  return Token.find({ characterId }).select('_id sceneId characterId tableId');
}

export async function deleteCharacter(userId: string, tableId: string, characterId: string) {
  const { character, table } = await loadCharacterContext(characterId);
  assertCharacterBelongsToTable(character, tableId);
  assertCanMutateCharacter(userId, table, character);

  const linkedTokens = await findTokensLinkedToCharacter(character._id.toString());
  await Token.updateMany({ characterId: character._id }, { $set: { characterId: null } });
  await character.deleteOne();
  return { success: true, tokens: linkedTokens };
}

/** Exclusão a partir de um contexto já autorizado (handlers realtime). */
export async function deleteCharacterByContext(userId: string, context: CharacterContext) {
  assertCanMutateCharacter(userId, context.table, context.character);
  const linkedTokens = await findTokensLinkedToCharacter(context.character._id.toString());
  await Token.updateMany({ characterId: context.character._id }, { $set: { characterId: null } });
  await context.character.deleteOne();
  return { success: true, tokens: linkedTokens };
}
