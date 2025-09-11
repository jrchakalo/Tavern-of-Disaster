// Centraliza o armazenamento em memória de medições por mesa/cena
// Chave: tableId -> userId -> measurement
export type Measurement = {
  userId: string;
  username: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance: string;
  color: string;
  type?: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
  affectedSquares?: string[];
  sceneId: string;
};

const tableMeasurements: Record<string, Record<string, Measurement>> = {};

// Persistentes por mesa e cena
export type PersistentMeasurement = Measurement & { id: string };
const persistentByTableScene: Record<string, Record<string, Record<string, PersistentMeasurement>>> = {};

export function setMeasurement(tableId: string, userId: string, measurement: Measurement) {
  if (!tableMeasurements[tableId]) tableMeasurements[tableId] = {};
  tableMeasurements[tableId][userId] = measurement;
}

export function removeMeasurement(tableId: string, userId: string) {
  if (tableMeasurements[tableId] && tableMeasurements[tableId][userId]) {
    delete tableMeasurements[tableId][userId];
  }
}

export function clearMeasurementsForTable(tableId: string) {
  if (tableMeasurements[tableId]) {
    tableMeasurements[tableId] = {};
  }
}

export function clearAllForUser(userId: string) {
  Object.keys(tableMeasurements).forEach(tid => {
    if (tableMeasurements[tid] && tableMeasurements[tid][userId]) {
      delete tableMeasurements[tid][userId];
    }
  });
}

export function getTablesForUser(userId: string): string[] {
  const tables: string[] = [];
  Object.keys(tableMeasurements).forEach(tid => {
    if (tableMeasurements[tid] && tableMeasurements[tid][userId]) tables.push(tid);
  });
  return tables;
}

export function getMeasurementsForTable(tableId: string): Record<string, Measurement> {
  return tableMeasurements[tableId] || {};
}

// --- Persistentes ---
export function addPersistent(tableId: string, sceneId: string, m: PersistentMeasurement) {
  if (!persistentByTableScene[tableId]) persistentByTableScene[tableId] = {};
  if (!persistentByTableScene[tableId][sceneId]) persistentByTableScene[tableId][sceneId] = {};
  persistentByTableScene[tableId][sceneId][m.id] = m;
}

export function removePersistent(tableId: string, sceneId: string, id: string) {
  if (persistentByTableScene[tableId] && persistentByTableScene[tableId][sceneId]) {
    delete persistentByTableScene[tableId][sceneId][id];
  }
}

export function listPersistents(tableId: string, sceneId: string): PersistentMeasurement[] {
  return Object.values(persistentByTableScene[tableId]?.[sceneId] || {});
}

export function clearPersistentsForScene(tableId: string, sceneId: string) {
  if (persistentByTableScene[tableId] && persistentByTableScene[tableId][sceneId]) {
    persistentByTableScene[tableId][sceneId] = {};
  }
}

// --- Token-anchored Auras ---
export type Aura = {
  id: string; // we will commonly use tokenId as id for uniqueness per token
  tokenId: string;
  sceneId: string;
  tableId: string;
  name: string;
  color: string;
  radiusMeters: number;
  ownerId: string; // user who created/controls this aura
  difficultTerrain?: boolean; // optional flag for DM tools
};

// Store per table -> scene -> tokenId -> Aura
const aurasByTableScene: Record<string, Record<string, Record<string, Aura>>> = {};

export function upsertAura(a: Aura) {
  if (!aurasByTableScene[a.tableId]) aurasByTableScene[a.tableId] = {};
  if (!aurasByTableScene[a.tableId][a.sceneId]) aurasByTableScene[a.tableId][a.sceneId] = {};
  aurasByTableScene[a.tableId][a.sceneId][a.tokenId] = a;
}

export function removeAura(tableId: string, sceneId: string, tokenId: string) {
  if (aurasByTableScene[tableId] && aurasByTableScene[tableId][sceneId]) {
    delete aurasByTableScene[tableId][sceneId][tokenId];
  }
}

export function listAuras(tableId: string, sceneId: string): Aura[] {
  return Object.values(aurasByTableScene[tableId]?.[sceneId] || {});
}

export function clearAurasForScene(tableId: string, sceneId: string) {
  if (aurasByTableScene[tableId] && aurasByTableScene[tableId][sceneId]) {
    aurasByTableScene[tableId][sceneId] = {};
  }
}
