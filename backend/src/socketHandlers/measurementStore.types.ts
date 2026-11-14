export type MeasurementShape = 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';

export type MaybePromise<T> = T | Promise<T>;

export type MeasurementPayload = {
  userId: string;
  username: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance: string;
  color: string;
  sceneId: string;
  type?: MeasurementShape;
  affectedSquares?: string[];
};

export type PersistentMeasurementPayload = MeasurementPayload & { id: string };

export type AuraPayload = {
  id: string;
  tokenId: string;
  sceneId: string;
  tableId: string;
  name: string;
  color: string;
  radiusMeters: number;
  ownerId: string;
  difficultTerrain?: boolean;
};

export interface IMeasurementStore {
  setMeasurement(tableId: string, userId: string, measurement: MeasurementPayload): MaybePromise<void>;
  getEphemeral(tableId: string): MaybePromise<Record<string, MeasurementPayload>>;
  removeMeasurement(tableId: string, userId: string): MaybePromise<void>;
  clearMeasurementsForTable(tableId: string): MaybePromise<void>;
  clearMeasurementsForScene(tableId: string, sceneId: string): MaybePromise<void>;
  getTablesForUser(userId: string): MaybePromise<string[]>;
  clearAllForUser(userId: string): MaybePromise<void>;
  addPersistent(tableId: string, sceneId: string, measurement: PersistentMeasurementPayload): MaybePromise<void>;
  removePersistent(tableId: string, sceneId: string, measurementId: string): MaybePromise<void>;
  listPersistents(tableId: string, sceneId: string): MaybePromise<PersistentMeasurementPayload[]>;
  clearPersistentsForScene(tableId: string, sceneId: string): MaybePromise<void>;
  upsertAura(aura: AuraPayload): MaybePromise<void>;
  removeAura(tableId: string, sceneId: string, tokenId: string): MaybePromise<void>;
  listAuras(tableId: string, sceneId: string): MaybePromise<AuraPayload[]>;
  clearAurasForScene(tableId: string, sceneId: string): MaybePromise<void>;
  clearAllForTable(tableId: string): MaybePromise<void>;
  cleanupInactiveTables?(maxIdleMs: number): MaybePromise<void>;
}
