import Scene, { IInitiativeEntry, IScene } from '../models/Scene.model';
import Table, { ITable } from '../models/Table.model';
import Token, { IToken } from '../models/Token.model';
import { assertCondition } from './serviceErrors';
import { resetMovementForScene } from './tokenService';

type HydratedScene = IScene & { save: () => Promise<IScene> };

export async function addTokenToInitiative(sceneId: string, token: IToken) {
  const scene = (await Scene.findById(sceneId)) as HydratedScene | null;
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  const alreadyExists = scene!.initiative.some((entry: IInitiativeEntry) => entry.tokenId?.toString() === token._id.toString());
  assertCondition(!alreadyExists, 'Token já está na iniciativa.', 400);
  scene!.initiative.push({ characterName: token.name, tokenId: token._id, isCurrentTurn: false } as IInitiativeEntry);
  await scene!.save();
  return scene!.initiative;
}

export async function addManualEntry(sceneId: string, entry: IInitiativeEntry) {
  const scene = await Scene.findById(sceneId);
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  scene!.initiative.push(entry);
  await scene!.save();
  return scene!.initiative;
}

function ensureUserCanAdvance(table: ITable, scene: IScene, userId: string | undefined, isDM: boolean) {
  assertCondition(!!userId, 'Usuário não autenticado.', 401);
  if (isDM) return;
  const currentEntry = scene.initiative.find((entry) => entry.isCurrentTurn);
  assertCondition(!!currentEntry?.tokenId, 'Apenas o Mestre pode iniciar a rodada.', 403);
}

export async function advanceTurn(table: ITable, scene: IScene, userId: string | undefined) {
  assertCondition(scene.initiative.length > 0, 'Iniciativa vazia.', 400);
  const isDM = table.dm.toString() === userId;
  ensureUserCanAdvance(table, scene, userId, isDM);

  const hydratedScene = scene as HydratedScene;

  let currentTurnIndex = hydratedScene.initiative.findIndex((entry) => entry.isCurrentTurn);
  if (currentTurnIndex === -1) {
    currentTurnIndex = hydratedScene.initiative.length - 1;
  } else {
    hydratedScene.initiative[currentTurnIndex].isCurrentTurn = false;
  }

  const nextTurnIndex = (currentTurnIndex + 1) % hydratedScene.initiative.length;
  const isNewRound = nextTurnIndex === 0;

  hydratedScene.initiative[nextTurnIndex].isCurrentTurn = true;
  await hydratedScene.save();

  if (isNewRound) {
    await resetMovementForScene(hydratedScene._id.toString());
  }

  return { initiative: hydratedScene.initiative, newRound: isNewRound };
}

export async function resetInitiative(sceneId: string) {
  const scene = await Scene.findByIdAndUpdate(sceneId, { initiative: [] }, { new: true });
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  return scene!.initiative;
}

export async function removeInitiativeEntry(sceneId: string, entryId: string, deleteToken = false) {
  const scene = (await Scene.findById(sceneId)) as HydratedScene | null;
  assertCondition(!!scene, 'Cena não encontrada.', 404);
  const entry = scene!.initiative.find((item: IInitiativeEntry) => item._id?.toString() === entryId);
  assertCondition(!!entry, 'Entrada não encontrada.', 404);
  scene!.initiative = scene!.initiative.filter((item: IInitiativeEntry) => item._id?.toString() !== entryId);
  await scene!.save();
  let removedTokenId: string | undefined;
  if (deleteToken && entry!.tokenId) {
    removedTokenId = entry!.tokenId.toString();
    await Token.findByIdAndDelete(entry!.tokenId);
  }
  return { initiative: scene!.initiative, removedTokenId };
}

export async function reorderInitiative(sceneId: string, newOrder: IInitiativeEntry[]) {
  const scene = await Scene.findByIdAndUpdate(sceneId, { initiative: newOrder }, { new: true });
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
