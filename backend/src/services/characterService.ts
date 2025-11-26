import { Types } from 'mongoose';
import Character, { ICharacter, CharacterStats } from '../models/Character.model';
import Table, { ITable } from '../models/Table.model';
import System, { ISystem } from '../models/System.model';
import { ServiceError } from './serviceErrors';

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

function assertUserInTableOrDm(userId: string | undefined, table: ITable) {
  assertAuthenticated(userId);
  const belongs = isDM(userId, table) || table.players.some((player) => player.toString() === userId);
  if (!belongs) {
    throw new ForbiddenError('Usuário não faz parte desta mesa.');
  }
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
  return System.findById(table.systemId).select('defaultAttributes');
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

export type CharacterPayload = {
  name?: string;
  avatarUrl?: string;
  attributes?: Record<string, number>;
  stats?: CharacterStats;
  skills?: Record<string, number | string>;
  notes?: string;
};

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

export async function createCharacter(userId: string, tableId: string, payload: CharacterPayload) {
  const table = await getTableOrThrow(tableId);
  assertUserInTableOrDm(userId, table);
  const name = sanitizeName(payload.name);
  validateStats(payload.stats);
  const system = await loadTableSystem(table);
  const attributes = system
    ? mergeWithSystemDefaultAttributes(system, payload.attributes)
    : payload.attributes ?? {};

  const character = new Character({
    name,
    ownerId: new Types.ObjectId(userId),
    tableId: table._id,
    avatarUrl: payload.avatarUrl,
    attributes,
    stats: payload.stats ?? {},
    skills: payload.skills ?? {},
    notes: payload.notes,
  });
  await character.save();
  return character;
}

async function getCharacterOrThrow(characterId: string) {
  const character = await Character.findById(characterId);
  if (!character) {
    throw new NotFoundError('Personagem não encontrado.');
  }
  return character;
}

function assertCanMutateCharacter(userId: string | undefined, table: ITable, character: ICharacter) {
  assertAuthenticated(userId);
  const isOwner = character.ownerId.toString() === userId;
  if (!isOwner && !isDM(userId, table)) {
    throw new ForbiddenError('Você não tem permissão para editar este personagem.');
  }
}

export async function updateCharacter(userId: string, tableId: string, characterId: string, payload: CharacterPayload) {
  const character = await getCharacterOrThrow(characterId);
  if (character.tableId.toString() !== tableId) {
    throw new ServiceError('Personagem não pertence à mesa informada.', 400);
  }
  const table = await getTableOrThrow(tableId);
  assertCanMutateCharacter(userId, table, character);

  if (payload.name !== undefined) {
    character.name = sanitizeName(payload.name);
  }
  if (payload.avatarUrl !== undefined) {
    character.avatarUrl = payload.avatarUrl;
  }
  if (payload.attributes !== undefined) {
    character.attributes = payload.attributes as any;
  }
  if (payload.skills !== undefined) {
    character.skills = payload.skills as any;
  }
  if (payload.notes !== undefined) {
    character.notes = payload.notes;
  }
  if (payload.stats !== undefined) {
    validateStats(payload.stats);
    character.stats = payload.stats;
  }

  await character.save();
  return character;
}

export async function deleteCharacter(userId: string, tableId: string, characterId: string) {
  const character = await getCharacterOrThrow(characterId);
  if (character.tableId.toString() !== tableId) {
    throw new ServiceError('Personagem não pertence à mesa informada.', 400);
  }
  const table = await getTableOrThrow(tableId);
  assertCanMutateCharacter(userId, table, character);
  await character.deleteOne();
  return { success: true };
}
