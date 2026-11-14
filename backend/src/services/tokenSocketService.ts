import { addTokenToInitiative, syncInitiativeNameWithToken } from './initiativeService';
import { assertUserInTable, assertUserIsDM } from './tableService';
import {
  createToken,
  moveToken,
  undoLastMove,
  updateToken,
  TokenUpdatePayload,
} from './tokenService';
import { assertCondition } from './serviceErrors';
import {
  assertEntityBelongsToTable,
  loadSceneContext,
  loadTokenContext,
} from './authorizationService';

type PopulatedOwnerToken = {
  ownerId?: any;
  _id: any;
  tableId: any;
  sceneId?: any;
  squareId: string;
  size: string;
  canOverlap: boolean;
  remainingMovement: number;
  movement: number;
  moveHistory?: string[];
};

function ownerIdOf(token: PopulatedOwnerToken): string | undefined {
  const owner = token.ownerId;
  if (!owner) return undefined;
  if (owner._id) return owner._id.toString();
  return owner.toString?.();
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
  const { scene, table } = await loadSceneContext(payload.sceneId);
  assertEntityBelongsToTable(table._id.toString(), payload.tableId);
  assertUserIsDM(userId, table);
  if (payload.ownerId) {
    assertUserInTable(payload.ownerId, table);
  }
  const createdToken = await createToken({
    ...payload,
    tableId: table._id.toString(),
    sceneId: scene._id.toString(),
    ownerId: payload.ownerId || userId,
  });
  const initiative = await addTokenToInitiative(scene._id.toString(), createdToken as any);
  return { token: createdToken, initiative };
}

function ensureMovePermission(
  userId: string,
  tokenOwnerId: string | undefined,
  tableDmId: string,
  isCurrentTurnOwner: boolean
) {
  const isDM = tableDmId === userId;
  const isOwner = tokenOwnerId === userId;
  if (isDM) return;
  assertCondition(!!tokenOwnerId, 'Token sem dono só pode ser movido pelo Mestre.', 403);
  assertCondition(isOwner, 'Você não tem permissão para mover este token.', 403);
  assertCondition(isCurrentTurnOwner, 'Você só pode mover no seu turno.', 403);
}

export async function moveTokenForUser(
  userId: string,
  data: { tableId: string; tokenId: string; targetSquareId: string }
) {
  const { tableId, tokenId, targetSquareId } = data;
  assertCondition(!!tokenId && !!targetSquareId, 'Dados inválidos para mover token.', 400);
  const { token, scene, table } = await loadTokenContext(tokenId);
  assertEntityBelongsToTable(table._id.toString(), tableId);
  assertUserInTable(userId, table);

  const currentEntry = scene.initiative.find((entry) => entry.isCurrentTurn);
  const isCurrentTurnOwner = currentEntry?.tokenId?.toString() === token._id.toString();
  ensureMovePermission(userId, ownerIdOf(token as any), table.dm.toString(), !!isCurrentTurnOwner);

  const oldSquareId = token.squareId;
  if (oldSquareId === targetSquareId) {
    return { updated: token, oldSquareId };
  }
  const updated = await moveToken(token as any, targetSquareId, scene, token.canOverlap);
  return { updated, oldSquareId };
}

export async function assignTokenOwnerForTable(
  userId: string,
  data: { tableId: string; tokenId: string; newOwnerId: string }
) {
  const { tableId, tokenId, newOwnerId } = data;
  const { table } = await loadTokenContext(tokenId);
  assertEntityBelongsToTable(table._id.toString(), tableId);
  assertUserIsDM(userId, table);
  assertUserInTable(newOwnerId, table);
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
  const { table } = await loadTokenContext(tokenId);
  assertEntityBelongsToTable(table._id.toString(), tableId);
  assertUserIsDM(userId, table);
  if (data.ownerId) {
    assertUserInTable(data.ownerId, table);
  }
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
  const { token, scene, table } = await loadTokenContext(tokenId);
  assertEntityBelongsToTable(table._id.toString(), tableId);
  assertUserInTable(userId, table);
  const isDM = table.dm.toString() === userId;
  const isOwner = ownerIdOf(token as any) === userId;
  assertCondition(isDM || isOwner, 'Sem permissão para desfazer movimento.', 403);
  const previousSquare = token.squareId;
  const updated = await undoLastMove(token as any, scene);
  return { updated, previousSquare };
}
