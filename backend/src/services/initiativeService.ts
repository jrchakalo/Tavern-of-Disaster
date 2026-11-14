import Scene, { IInitiativeEntry, IScene } from '../models/Scene.model';
import Table, { ITable } from '../models/Table.model';
import Token, { IToken } from '../models/Token.model';
import { assertCondition, ServiceError } from './serviceErrors';
import { resetMovementForScene } from './tokenService';

type HydratedScene = IScene & { save: () => Promise<IScene> };

export async function addTokenToInitiative(sceneId: string, token: IToken) {
  const scene = (await Scene.findById(sceneId)) as HydratedScene | null;
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  const alreadyExists = scene!.initiative.some((entry: IInitiativeEntry) => entry.tokenId?.toString() === token._id.toString());
  assertCondition(!alreadyExists, 'Token já está na iniciativa.', 400);
  scene!.initiative.push({
    characterName: token.name,
    tokenId: token._id,
    characterId: token.characterId ?? undefined,
    isCurrentTurn: false,
  } as IInitiativeEntry);
  scene!.turnVersion = (scene!.turnVersion ?? 0) + 1;
  await scene!.save();
  return scene!.initiative;
}

export async function addManualEntry(sceneId: string, entry: IInitiativeEntry) {
  const scene = await Scene.findById(sceneId);
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  scene!.initiative.push(entry);
  scene!.turnVersion = (scene!.turnVersion ?? 0) + 1;
  await scene!.save();
  return scene!.initiative;
}

async function ensureUserCanAdvance(
  table: ITable,
  scene: IScene,
  userId: string | undefined,
  isDM: boolean
) {
  assertCondition(!!userId, 'Usuário não autenticado.', 401);
  if (isDM) return;
  const currentEntry = scene.initiative.find((entry) => entry.isCurrentTurn);
  assertCondition(!!currentEntry?.tokenId, 'Apenas o Mestre pode iniciar a rodada.', 403);
  const currentToken = await Token.findById(currentEntry!.tokenId);
  assertCondition(!!currentToken, 'Token da entrada atual não encontrado.', 404);
  assertCondition(
    currentToken!.ownerId?.toString() === userId,
    'Apenas o dono do turno atual pode avançar o turno.',
    403
  );
}

/**
 * Avança o turno de forma atômica usando `Scene.turnVersion` como CAS.
 * Duas chamadas concorrentes: uma vence, a outra recebe CONFLICT (409).
 */
export async function advanceTurn(table: ITable, scene: IScene, userId: string | undefined) {
  assertCondition(scene.initiative.length > 0, 'Iniciativa vazia.', 400);
  const isDM = table.dm.toString() === userId;
  await ensureUserCanAdvance(table, scene, userId, isDM);

  const hydratedScene = scene as HydratedScene;

  let currentTurnIndex = hydratedScene.initiative.findIndex((entry) => entry.isCurrentTurn);
  if (currentTurnIndex === -1) {
    currentTurnIndex = hydratedScene.initiative.length - 1;
  }

  // Garante exatamente zero ou uma entrada atual.
  hydratedScene.initiative.forEach((entry) => {
    entry.isCurrentTurn = false;
  });

  const nextTurnIndex = (currentTurnIndex + 1) % hydratedScene.initiative.length;
  const isNewRound = nextTurnIndex === 0;

  hydratedScene.initiative[nextTurnIndex].isCurrentTurn = true;

  const nextInitiative = hydratedScene.initiative.map((entry) => ({
    _id: entry._id,
    characterName: entry.characterName,
    tokenId: entry.tokenId,
    characterId: entry.characterId,
    isCurrentTurn: entry.isCurrentTurn,
  }));

  const turnVersion = (hydratedScene as any).turnVersion ?? 0;
  const updated = await Scene.findOneAndUpdate(
    { _id: hydratedScene._id, turnVersion },
    { $set: { initiative: nextInitiative }, $inc: { turnVersion: 1 } },
    { new: true }
  );

  if (!updated) {
    throw new ServiceError('O turno já foi avançado por outro cliente.', 409);
  }

  if (isNewRound) {
    await resetMovementForScene(hydratedScene._id.toString());
  }

  return { initiative: updated.initiative, newRound: isNewRound };
}

export async function resetInitiative(sceneId: string) {
  const scene = await Scene.findByIdAndUpdate(
    sceneId,
    { $set: { initiative: [] }, $inc: { turnVersion: 1 } },
    { new: true }
  );
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  return scene!.initiative;
}

export async function removeInitiativeEntry(sceneId: string, entryId: string, deleteToken = false) {
  const scene = (await Scene.findById(sceneId)) as HydratedScene | null;
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  const entry = scene!.initiative.find((item: IInitiativeEntry) => item._id?.toString() === entryId);
  assertCondition(!!entry, 'Entrada não encontrada.', 404);
  scene!.initiative = scene!.initiative.filter((item: IInitiativeEntry) => item._id?.toString() !== entryId);
  scene!.turnVersion = (scene!.turnVersion ?? 0) + 1;
  await scene!.save();
  let removedTokenId: string | undefined;
  if (deleteToken && entry!.tokenId) {
    removedTokenId = entry!.tokenId.toString();
    await Token.findByIdAndDelete(entry!.tokenId);
  }
  return { initiative: scene!.initiative, removedTokenId };
}

export type RequestedInitiativeOrder = Array<{
  _id?: string;
  tokenId?: string;
  characterId?: string;
  characterName?: string;
  isCurrentTurn?: boolean;
}>;

/**
 * Valida a ordem enviada pelo cliente contra a iniciativa existente e
 * reconstrói as entradas a partir dos dados do servidor. O cliente só pode
 * decidir a posição e qual entrada está ativa (no máximo uma). Identidade
 * (token/personagem) e nome nunca vêm do payload.
 */
export function buildReorderedInitiative(
  scene: IScene,
  requested: RequestedInitiativeOrder
): IInitiativeEntry[] {
  assertCondition(Array.isArray(requested) && requested.length > 0, 'Ordem de iniciativa inválida.', 400);
  assertCondition(
    requested.length === scene.initiative.length,
    'Ordem de iniciativa inválida: quantidade de entradas divergente.',
    400
  );

  const serverEntries = new Map<string, IInitiativeEntry>();
  scene.initiative.forEach((entry) => {
    const id = entry._id?.toString();
    if (id) serverEntries.set(id, entry);
  });

  const seen = new Set<string>();
  let currentTurnCount = 0;
  const rebuilt: IInitiativeEntry[] = [];

  for (const item of requested) {
    const id = item?._id?.toString();
    assertCondition(!!id, 'Ordem de iniciativa inválida: entrada sem identificador.', 400);
    assertCondition(!seen.has(id!), 'Ordem de iniciativa inválida: entrada duplicada.', 400);
    seen.add(id!);

    const serverEntry = serverEntries.get(id!);
    assertCondition(!!serverEntry, 'Ordem de iniciativa inválida: entrada desconhecida.', 400);

    if (item.tokenId !== undefined) {
      assertCondition(
        item.tokenId === (serverEntry!.tokenId?.toString() ?? ''),
        'Ordem de iniciativa inválida: token não pertence à entrada.',
        400
      );
    }
    if (item.characterId !== undefined) {
      assertCondition(
        item.characterId === (serverEntry!.characterId?.toString() ?? ''),
        'Ordem de iniciativa inválida: personagem não pertence à entrada.',
        400
      );
    }

    const isCurrentTurn = !!item.isCurrentTurn;
    if (isCurrentTurn) currentTurnCount += 1;

    rebuilt.push({
      _id: serverEntry!._id,
      characterName: serverEntry!.characterName,
      tokenId: serverEntry!.tokenId,
      characterId: serverEntry!.characterId,
      isCurrentTurn,
    });
  }

  assertCondition(
    currentTurnCount <= 1,
    'Ordem de iniciativa inválida: mais de uma entrada atual.',
    400
  );

  return rebuilt;
}

export async function reorderInitiative(sceneId: string, newOrder: IInitiativeEntry[]) {
  const scene = await Scene.findByIdAndUpdate(
    sceneId,
    { $set: { initiative: newOrder }, $inc: { turnVersion: 1 } },
    { new: true }
  );
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  return scene!.initiative;
}

export async function editInitiativeEntry(sceneId: string, entryId: string, newName: string) {
  const scene = (await Scene.findById(sceneId)) as HydratedScene | null;
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  const entry = scene!.initiative.find((item: IInitiativeEntry) => item._id?.toString() === entryId);
  assertCondition(!!entry, 'Entrada não encontrada.', 404);
  entry!.characterName = newName;
  if (entry!.tokenId) {
    await Token.findByIdAndUpdate(entry!.tokenId, { name: newName });
  }
  scene!.turnVersion = (scene!.turnVersion ?? 0) + 1;
  await scene!.save();
  return scene!.initiative;
}

export async function syncInitiativeNameWithToken(sceneId: string, tokenId: string, newName: string) {
  const scene = (await Scene.findById(sceneId)) as HydratedScene | null;
  if (!scene) return;
  let changed = false;
  scene.initiative.forEach((entry: IInitiativeEntry) => {
    if (entry.tokenId?.toString() === tokenId) {
      entry.characterName = newName;
      changed = true;
    }
  });
  if (changed) {
    await scene.save();
  }
  return changed ? scene.initiative : undefined;
}

export async function getSceneAndTable(tableId: string, sceneId: string) {
  const table = await Table.findById(tableId);
  const scene = await Scene.findById(sceneId);
  assertCondition(!!table, 'Mesa não encontrada.', 404);
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  return { table: table!, scene: scene! };
}
