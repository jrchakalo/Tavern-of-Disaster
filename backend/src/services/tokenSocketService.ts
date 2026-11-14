import Token from '../models/Token.model';
import Scene from '../models/Scene.model';
import { addTokenToInitiative, syncInitiativeNameWithToken } from './initiativeService';
import { getTableById, assertUserIsDM } from './tableService';
import {
  createToken,
  moveToken,
  undoLastMove,
  updateToken,
  TokenUpdatePayload,
} from './tokenService';
import { ServiceError, assertCondition } from './serviceErrors';

async function loadToken(tokenId: string) {
  const token = await Token.findById(tokenId).populate('ownerId', '_id username');
  if (!token) throw new ServiceError('Token não encontrado.', 404);
  return token;
}

async function loadScene(sceneId: string | undefined | null) {
  if (!sceneId) throw new ServiceError('Cena não encontrada.', 404);
  const scene = await Scene.findById(sceneId);
  if (!scene) throw new ServiceError('Cena não encontrada.', 404);
  return scene;
}

export type PlaceTokenPayload = {
  tableId: string;
  sceneId: string;
  squareId: string;
  name: string;
  imageUrl?: string;
  movement?: number;
  remainingMovement?: number;
  ownerId?: string;
  size: string;
  canOverlap?: boolean;
  characterId?: string | null;
};

export async function placeTokenForTable(userId: string, payload: PlaceTokenPayload) {
  const table = await getTableById(payload.tableId);
  assertCondition(!!table, 'Mesa não encontrada.', 404);
  assertUserIsDM(userId, table!);
  const createdToken = await createToken({
    ...payload,
    ownerId: payload.ownerId || userId,
  });
  const initiative = await addTokenToInitiative(payload.sceneId, createdToken as any);
  return { token: createdToken, initiative };
}

function ensureMovePermission(userId: string, tokenOwnerId: string | undefined, tableDmId: string, isCurrentTurnOwner: boolean) {
  const isDM = tableDmId === userId;
  const isOwner = tokenOwnerId === userId;
  if (isDM) return;
  assertCondition(isOwner, 'Você não tem permissão para mover este token.', 403);
  assertCondition(isCurrentTurnOwner, 'Você só pode mover no seu turno.', 403);
}

export async function moveTokenForUser(userId: string, data: { tableId: string; tokenId: string; targetSquareId: string }) {
  const { tableId, tokenId, targetSquareId } = data;
  assertCondition(!!tokenId && !!targetSquareId, 'Dados inválidos para mover token.', 400);
  const table = await getTableById(tableId);
  assertCondition(!!table, 'Mesa não encontrada.', 404);
  const token = await loadToken(tokenId);
  const scene = await loadScene(token.sceneId?.toString());
  const currentEntry = scene.initiative.find((entry) => entry.isCurrentTurn);
  const isCurrentTurnOwner = currentEntry?.tokenId?.toString() === token._id.toString();
  ensureMovePermission(userId, token.ownerId?.toString(), table!.dm.toString(), !!isCurrentTurnOwner);
  const oldSquareId = token.squareId;
  if (oldSquareId === targetSquareId) {
    return { updated: token, oldSquareId };
  }
  const updated = await moveToken(token as any, targetSquareId, scene, token.canOverlap);
  return { updated, oldSquareId };
}

export async function assignTokenOwnerForTable(userId: string, data: { tableId: string; tokenId: string; newOwnerId: string }) {
  const { tableId, tokenId, newOwnerId } = data;
  const table = await getTableById(tableId);
  assertCondition(!!table, 'Mesa não encontrada.', 404);
  assertUserIsDM(userId, table!);
  const updated = await updateToken(tokenId, { ownerId: newOwnerId });
  return updated;
}

export async function editTokenForTable(userId: string, data: {
  tableId: string;
  tokenId: string;
  name?: string;
  movement?: number;
  imageUrl?: string;
  ownerId?: string;
  size?: string;
  resetRemainingMovement?: boolean;
  canOverlap?: boolean;
  characterId?: string | null;
}) {
  const { tableId, tokenId } = data;
  const table = await getTableById(tableId);
  assertCondition(!!table, 'Mesa não encontrada.', 404);
  assertUserIsDM(userId, table!);
  const updates: TokenUpdatePayload = {};
  if (typeof data.name === 'string' && data.name.trim()) updates.name = data.name.trim();
  if (typeof data.movement === 'number' && data.movement > 0) updates.movement = data.movement;
  if (typeof data.imageUrl === 'string') updates.imageUrl = data.imageUrl.trim();
  if (typeof data.ownerId === 'string' && data.ownerId) updates.ownerId = data.ownerId;
  if (typeof data.size === 'string' && data.size) updates.size = data.size;
  if (typeof data.canOverlap === 'boolean') updates.canOverlap = data.canOverlap;
  if (data.characterId !== undefined) {
    updates.characterId = data.characterId;
  }
  const updated = await updateToken(tokenId, updates, { resetRemainingMovement: !!data.resetRemainingMovement });
  if (!updated) return null;
  let updatedInitiative;
  if (updates.name && updated.sceneId) {
    updatedInitiative = await syncInitiativeNameWithToken(updated.sceneId.toString(), updated._id.toString(), updates.name);
  }
  return { updated, initiative: updatedInitiative };
}

export async function undoTokenMoveForUser(userId: string, data: { tableId: string; tokenId: string }) {
  const { tableId, tokenId } = data;
  const table = await getTableById(tableId);
  assertCondition(!!table, 'Mesa não encontrada.', 404);
  const token = await loadToken(tokenId);
  const isDM = table!.dm.toString() === userId;
  const isOwner = token.ownerId?.toString() === userId;
  assertCondition(isDM || isOwner, 'Sem permissão para desfazer movimento.', 403);
  const scene = await loadScene(token.sceneId?.toString());
  const previousSquare = token.squareId;
  const updated = await undoLastMove(token as any, scene);
  return { updated, previousSquare };
}
