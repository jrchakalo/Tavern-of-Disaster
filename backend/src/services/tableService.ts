import { Types, PopulateOptions } from 'mongoose';
import Table, { ITable, tableStatuses } from '../models/Table.model';
import Scene from '../models/Scene.model';
import Token from '../models/Token.model';
import { ServiceError, assertCondition } from './serviceErrors';

type HydratedTable = ITable & { save: () => Promise<ITable> };

export type TablePopulate = string | PopulateOptions;

export async function getTableById(tableId: string, populate: TablePopulate[] = []): Promise<ITable | null> {
  if (!Types.ObjectId.isValid(tableId)) {
    throw new ServiceError('ID de mesa inválido.', 400);
  }
  let query = Table.findById(tableId);
  populate.forEach((field) => {
    // cast to any to satisfy mongoose overloads that don't accept plain string in these typings
    query = query.populate(field as any);
  });
  return query.exec();
}

export function assertUserInTable(userId: string | undefined, table: ITable) {
  assertCondition(!!userId, 'Usuário não autenticado.', 401);
  const isDM = table.dm.toString() === userId;
  const isPlayer = table.players.some((playerId) => playerId.toString() === userId);
  assertCondition(isDM || isPlayer, 'Usuário não faz parte desta mesa.', 403);
}

export function assertUserIsDM(userId: string | undefined, table: ITable) {
  assertCondition(!!userId, 'Usuário não autenticado.', 401);
  assertCondition(table.dm.toString() === userId, 'Apenas o Mestre pode executar esta ação.', 403);
}

export function isUserInTable(userId: string | undefined, table: ITable) {
  if (!userId) return false;
  return table.dm.toString() === userId || table.players.some((playerId) => playerId.toString() === userId);
}

export function isUserDM(userId: string | undefined, table: ITable) {
  if (!userId) return false;
  return table.dm.toString() === userId;
}

export async function addPlayerToTable(table: HydratedTable, playerId: string): Promise<ITable> {
  const alreadyInTable = table.players.some((id) => id.toString() === playerId) || table.dm.toString() === playerId;
  if (alreadyInTable) {
    return table;
  }
  table.players.push(new Types.ObjectId(playerId));
  await table.save();
  return table;
}

export async function removePlayerFromTable(table: HydratedTable, playerId: string): Promise<ITable> {
  const beforeLength = table.players.length;
  table.players = table.players.filter((player) => player.toString() !== playerId);
  assertCondition(beforeLength !== table.players.length, 'Jogador não encontrado na mesa.', 404);
  await table.save();
  return table;
}

export async function updateTableStatus(
  table: HydratedTable,
  newStatus: ITable['status'],
  pauseSeconds?: number
): Promise<ITable> {
  assertCondition(tableStatuses.includes(newStatus), 'Status inválido.', 400);
  table.status = newStatus;
  if (newStatus === 'PAUSED') {
    const seconds = Math.max(0, Math.floor(Number(pauseSeconds) || 0));
    if (seconds > 0) {
      (table as any).pauseUntil = new Date(Date.now() + seconds * 1000);
    } else {
      (table as any).pauseUntil = null;
    }
  } else {
    (table as any).pauseUntil = null;
  }
  await table.save();
  return table;
}

export async function deleteTableAndDependents(tableId: string) {
  const table = await Table.findById(tableId);
  assertCondition(!!table, 'Mesa não encontrada.', 404);
  const scenes = await Scene.find({ tableId: table!._id });
  for (const sc of scenes) {
    await Token.deleteMany({ sceneId: sc._id });
  }
  await Scene.deleteMany({ tableId: table!._id });
  await Table.findByIdAndDelete(tableId);
}
