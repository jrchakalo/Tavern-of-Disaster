import Token, { IToken } from '../models/Token.model';
import Scene, { IInitiativeEntry, IScene } from '../models/Scene.model';
import { ITable } from '../models/Table.model';
import { assertCondition, ServiceError } from './serviceErrors';
import { assertUserInTable, assertUserIsDM, getTableById } from './tableService';

type PopulatedToken = IToken & { ownerId: any };

export type TokenContext = {
  token: PopulatedToken;
  scene: IScene;
  table: ITable;
};

export type SceneContext = {
  scene: IScene;
  table: ITable;
};

export type InitiativeContext = SceneContext & {
  entry: IInitiativeEntry;
};

/**
 * Resolve token -> cena -> mesa SEM confiar no tableId do payload.
 * Lança NOT_FOUND se a entidade não existir e CONFLICT se os dados estiverem inconsistentes.
 */
export async function loadTokenContext(tokenId: string): Promise<TokenContext> {
  const token = (await Token.findById(tokenId).populate('ownerId', '_id username')) as PopulatedToken | null;
  assertCondition(!!token, 'Token não encontrado.', 404);
  assertCondition(!!token!.sceneId, 'Token não pertence a uma cena.', 404);
  const scene = await Scene.findById(token!.sceneId);
  assertCondition(!!scene, 'Cena do token não encontrada.', 404);

  const tokenTableId = token!.tableId?.toString();
  const sceneTableId = scene!.tableId?.toString();
  assertCondition(!!tokenTableId && tokenTableId === sceneTableId, 'Token e cena pertencem a mesas diferentes.', 409);
  assertCondition(!!tokenTableId, 'Token não pertence a uma mesa.', 409);

  const table = await getTableById(tokenTableId);
  assertCondition(!!table, 'Mesa do token não encontrada.', 404);

  return { token: token!, scene: scene!, table: table! };
}

/** Resolve cena -> mesa SEM confiar no tableId do payload. */
export async function loadSceneContext(sceneId: string): Promise<SceneContext> {
  const scene = await Scene.findById(sceneId);
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  const sceneTableId = scene!.tableId?.toString();
  assertCondition(!!sceneTableId, 'Cena não pertence a uma mesa.', 409);
  const table = await getTableById(sceneTableId);
  assertCondition(!!table, 'Mesa da cena não encontrada.', 404);
  return { scene: scene!, table: table! };
}

/** Resolve cena + entrada de iniciativa -> mesa. */
export async function loadInitiativeContext(sceneId: string, entryId: string): Promise<InitiativeContext> {
  const context = await loadSceneContext(sceneId);
  const entry = context.scene.initiative.find((item) => item._id?.toString() === entryId);
  assertCondition(!!entry, 'Entrada de iniciativa não encontrada.', 404);
  return { ...context, entry: entry! };
}

/**
 * Garante que a entidade pertence à mesa declarada pelo cliente.
 * Divergência vira FORBIDDEN para não revelar a existência de outra mesa.
 */
export function assertEntityBelongsToTable(
  entityTableId: string | null | undefined,
  claimedTableId: string | null | undefined
): void {
  assertCondition(!!claimedTableId, 'Mesa não informada.', 400);
  if (!entityTableId || entityTableId !== claimedTableId) {
    throw new ServiceError('Ação não permitida para esta mesa.', 403);
  }
}

/**
 * Carrega a mesa reivindicada e valida que o usuário é membro (e opcionalmente DM).
 * É o portão final de autorização para operações de mesa (não de entidade).
 */
export async function loadClaimedTable(
  userId: string | undefined,
  claimedTableId: string,
  options: { requireDM?: boolean } = {}
): Promise<ITable> {
  const table = await getTableById(claimedTableId);
  assertCondition(!!table, 'Mesa não encontrada.', 404);
  assertUserInTable(userId, table!);
  if (options.requireDM) {
    assertUserIsDM(userId, table!);
  }
  return table!;
}
