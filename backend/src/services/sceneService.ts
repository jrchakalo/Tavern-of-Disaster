import { Types } from 'mongoose';
import Scene, { IScene } from '../models/Scene.model';
import Table, { ITable } from '../models/Table.model';
import Token from '../models/Token.model';
import { assertCondition } from './serviceErrors';

type HydratedTable = ITable & { save: () => Promise<ITable>; populate: (path: string) => Promise<ITable> };

export type ScenePayload = {
  name?: string;
  imageUrl?: string;
  gridWidth?: number;
  gridHeight?: number;
  type?: 'battlemap' | 'image';
};

export async function createDefaultScene(tableId: Types.ObjectId): Promise<IScene> {
  const defaultScene = new Scene({
    tableId,
    name: 'Primeira Cena',
    imageUrl: '',
  });
  await defaultScene.save();
  return defaultScene;
}

export async function createScene(table: HydratedTable, payload: ScenePayload): Promise<IScene> {
  assertCondition(table != null, 'Mesa não encontrada.', 404);
  const scene = new Scene({
    tableId: table._id,
    name: payload.name || 'Nova Cena',
    imageUrl: payload.imageUrl || '',
    gridWidth: payload.gridWidth || 30,
    gridHeight: payload.gridHeight || 30,
    type: payload.type || 'battlemap',
  });
  await scene.save();
  table.scenes.push(scene._id as Types.ObjectId);
  await table.save();
  return scene;
}

export async function renameScene(sceneId: string, name: string): Promise<IScene> {
  assertCondition(!!name && name.trim().length > 0, 'Nome inválido.', 400);
  const updated = await Scene.findByIdAndUpdate(sceneId, { name: name.trim() }, { new: true });
  assertCondition(!!updated, 'Cena não encontrada.', 404);
  return updated!;
}

export async function deleteScene(table: HydratedTable, sceneId: string) {
  const sceneBelongsToTable = table.scenes.some((scene) => scene.toString() === sceneId);
  assertCondition(sceneBelongsToTable, 'Cena não pertence a esta mesa.', 404);

  const updatedScenes = table.scenes.filter((scene) => scene.toString() !== sceneId);
  table.scenes = updatedScenes as any;
  if (table.activeScene?.toString() === sceneId) {
    table.activeScene = updatedScenes.length > 0 ? (updatedScenes[0] as any) : undefined;
  }
  await table.save();

  await Scene.findByIdAndDelete(sceneId);
  await Token.deleteMany({ sceneId });
  return { activeScene: table.activeScene || null, scenes: table.scenes };
}

export async function reorderScenes(table: HydratedTable, orderedSceneIds: string[]): Promise<ITable> {
  const everySceneBelongs = orderedSceneIds.every((sceneId) => table.scenes.some((scene) => scene.toString() === sceneId));
  assertCondition(everySceneBelongs, 'Lista de cenas inválida.', 400);
  table.scenes = orderedSceneIds.map((id) => new Types.ObjectId(id));
  await table.save();
  await table.populate('scenes');
  return table;
}

export async function setActiveScene(tableId: string, sceneId: string) {
  const table = await Table.findById(tableId);
  assertCondition(!!table, 'Mesa não encontrada.', 404);
  const sceneBelongs = table!.scenes.some((scene: Types.ObjectId) => scene.toString() === sceneId);
  assertCondition(sceneBelongs, 'Cena não pertence à mesa.', 404);
  table!.activeScene = new Types.ObjectId(sceneId) as any;
  await table!.save();
}

export async function updateSceneGridDimensions(sceneId: string, newGridWidth: number, newGridHeight: number) {
  assertCondition(newGridWidth > 0 && newGridHeight > 0, 'Dimensões inválidas.', 400);
  await Scene.findByIdAndUpdate(sceneId, { gridWidth: newGridWidth, gridHeight: newGridHeight });
}

export async function updateSceneScale(sceneId: string, metersPerSquare: number) {
  assertCondition(metersPerSquare > 0, 'Escala inválida.', 400);
  await Scene.findByIdAndUpdate(sceneId, { metersPerSquare });
}

export async function updateSceneMap(sceneId: string, mapUrl: string) {
  return Scene.findByIdAndUpdate(sceneId, { imageUrl: mapUrl }, { new: true });
}

export async function getSceneWithTokens(sceneId: string) {
  const scene = await Scene.findById(sceneId);
  if (!scene) return { activeScene: null, tokens: [] };
  const tokens = await Token.find({ sceneId }).populate('ownerId', '_id username');
  return { activeScene: scene, tokens };
}
