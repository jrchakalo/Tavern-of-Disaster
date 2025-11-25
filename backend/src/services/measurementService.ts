import { nanoid } from 'nanoid';
import Table from '../models/Table.model';
import Scene, { IInitiativeEntry } from '../models/Scene.model';
import Token from '../models/Token.model';
import {
  setMeasurement,
  removeMeasurement,
  clearMeasurementsForTable,
  clearAllForUser,
  getTablesForUser,
  addPersistent,
  removePersistent,
  listPersistents,
  upsertAura,
  removeAura,
  listAuras,
  clearPersistentsForScene,
  Measurement,
  PersistentMeasurement,
  Aura,
  clearAurasForScene,
} from '../socketHandlers/measurementStore';
import { assertCondition } from './serviceErrors';

export type AuthUser = { id: string; username: string };

async function loadTable(tableId: string) {
  const table = await Table.findById(tableId).populate('dm', '_id username').populate('activeScene');
  assertCondition(!!table, 'Mesa não encontrada.', 404);
  return table!;
}

async function loadScene(sceneId: string) {
  const scene = await Scene.findById(sceneId);
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  return scene!;
}

async function isUserTurnOwner(userId: string, sceneId: string) {
  const scene = await Scene.findById(sceneId);
  if (!scene) return false;
  const currentEntry = scene.initiative.find((entry: IInitiativeEntry) => entry.isCurrentTurn);
  if (!currentEntry?.tokenId) return false;
  const token = await Token.findById(currentEntry.tokenId);
  if (!token) return false;
  return token.ownerId?.toString() === userId;
}

export async function canUserMeasure(userId: string, tableId: string, sceneId: string) {
  const table = await loadTable(tableId);
  const isDM = table.dm._id.toString() === userId;
  if (isDM) return true;
  if (!table.activeScene || table.activeScene._id.toString() !== sceneId) return false;
  return isUserTurnOwner(userId, sceneId);
}

export async function shareEphemeralMeasurement(
  user: AuthUser,
  tableId: string,
  sceneId: string,
  measurement: Omit<Measurement, 'userId' | 'username'>
) {
  const table = await loadTable(tableId);
  if (!table.activeScene || table.activeScene._id.toString() !== sceneId) {
    return null;
  }
  const isDM = table.dm._id.toString() === user.id;
  const allowed = isDM || (await isUserTurnOwner(user.id, sceneId));
  if (!allowed) return null;
  const color = isDM ? '#3c096c' : measurement.color || '#ff8c00';
  const payload: Measurement = {
    userId: user.id,
    username: user.username,
    color,
    sceneId,
    start: measurement.start,
    end: measurement.end,
    distance: measurement.distance,
    type: measurement.type,
    affectedSquares: measurement.affectedSquares,
  };
  setMeasurement(tableId, user.id, payload);
  return payload;
}

export function removeEphemeralMeasurement(tableId: string, userId: string) {
  removeMeasurement(tableId, userId);
}

export function cleanupUserMeasurements(userId: string) {
  const tables = getTablesForUser(userId);
  tables.forEach((tableId) => removeMeasurement(tableId, userId));
  clearAllForUser(userId);
  return tables;
}

export function clearEphemeralMeasurements(tableId: string) {
  clearMeasurementsForTable(tableId);
}

export async function addPersistentMeasurement(user: AuthUser, tableId: string, sceneId: string, payload: Measurement & { id?: string }) {
  const table = await loadTable(tableId);
  const isDM = table.dm._id.toString() === user.id;
  const allowed = isDM || (await isUserTurnOwner(user.id, sceneId));
  assertCondition(allowed, 'Sem permissão para adicionar medição persistente.', 403);
  const color = isDM ? '#3c096c' : payload.color || '#ff8c00';
  const id = payload.id || nanoid(8);
  const persistent: PersistentMeasurement = {
    ...payload,
    id,
    userId: user.id,
    username: user.username,
    color,
    sceneId,
  };
  addPersistent(tableId, sceneId, persistent);
  return persistent;
}

export async function removePersistentMeasurement(user: AuthUser, tableId: string, sceneId: string, measurementId: string) {
  const table = await loadTable(tableId);
  const isDM = table.dm._id.toString() === user.id;
  const items = listPersistents(tableId, sceneId);
  const item = items.find((i) => i.id === measurementId);
  assertCondition(!!item, 'Medição não encontrada.', 404);
  assertCondition(isDM || item!.userId === user.id, 'Sem permissão para remover medição.', 403);
  removePersistent(tableId, sceneId, measurementId);
}

export async function clearAllMeasurements(tableId: string, sceneId?: string) {
  clearMeasurementsForTable(tableId);
  if (sceneId) {
    clearPersistentsForScene(tableId, sceneId);
    clearAurasForScene(tableId, sceneId);
  }
}

export async function upsertTokenAura(user: AuthUser, tableId: string, sceneId: string, tokenId: string, data: { name: string; color: string; radiusMeters: number; difficultTerrain?: boolean }) {
  const table = await loadTable(tableId);
  const token = await Token.findById(tokenId);
  assertCondition(!!token, 'Token não encontrado.', 404);
  const isDM = table.dm._id.toString() === user.id;
  const isOwner = token!.ownerId?.toString() === user.id;
  const isTurnOwner = await isUserTurnOwner(user.id, sceneId);
  assertCondition(isDM || isOwner || isTurnOwner, 'Sem permissão para editar aura.', 403);
  const aura: Aura = {
    id: tokenId,
    tokenId,
    tableId,
    sceneId,
    ownerId: token!.ownerId?.toString() || user.id,
    name: data.name?.trim() || 'Aura',
    color: data.color,
    radiusMeters: Math.max(0, data.radiusMeters || 0),
    difficultTerrain: !!data.difficultTerrain,
  };
  upsertAura(aura);
  return aura;
}

export async function removeTokenAura(user: AuthUser, tableId: string, sceneId: string, tokenId: string) {
  const table = await loadTable(tableId);
  const isDM = table.dm._id.toString() === user.id;
  assertCondition(isDM, 'Apenas o Mestre pode remover auras.', 403);
  removeAura(tableId, sceneId, tokenId);
}

export function listScenePersistents(tableId: string, sceneId: string) {
  return listPersistents(tableId, sceneId);
}

export function listSceneAuras(tableId: string, sceneId: string) {
  return listAuras(tableId, sceneId);
}

export { getTablesForUser };
