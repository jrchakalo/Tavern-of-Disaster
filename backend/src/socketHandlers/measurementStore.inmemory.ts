import {
  AuraPayload,
  IMeasurementStore,
  MeasurementPayload,
  PersistentMeasurementPayload,
} from './measurementStore.types';

export class InMemoryMeasurementStore implements IMeasurementStore {
  private readonly tableMeasurements: Record<string, Record<string, MeasurementPayload>> = {};
  private readonly tableActivityMs: Record<string, number> = {};
  private readonly persistentByTableScene: Record<string, Record<string, Record<string, PersistentMeasurementPayload>>> = {};
  private readonly aurasByTableScene: Record<string, Record<string, Record<string, AuraPayload>>> = {};

  private markActivity(tableId: string) {
    this.tableActivityMs[tableId] = Date.now();
  }

  setMeasurement(tableId: string, userId: string, measurement: MeasurementPayload): void {
    if (!this.tableMeasurements[tableId]) this.tableMeasurements[tableId] = {};
    this.tableMeasurements[tableId][userId] = measurement;
    this.markActivity(tableId);
  }

  getEphemeral(tableId: string): Record<string, MeasurementPayload> {
    return this.tableMeasurements[tableId] || {};
  }

  removeMeasurement(tableId: string, userId: string): void {
    if (this.tableMeasurements[tableId] && this.tableMeasurements[tableId][userId]) {
      delete this.tableMeasurements[tableId][userId];
      if (Object.keys(this.tableMeasurements[tableId]).length === 0) {
        delete this.tableMeasurements[tableId];
      }
      this.markActivity(tableId);
    }
  }

  clearMeasurementsForTable(tableId: string): void {
    if (this.tableMeasurements[tableId]) {
      delete this.tableMeasurements[tableId];
      this.markActivity(tableId);
    }
  }

  clearMeasurementsForScene(tableId: string, sceneId: string): void {
    const tableEntries = this.tableMeasurements[tableId];
    if (!tableEntries) return;
    let modified = false;
    Object.entries(tableEntries).forEach(([userId, measurement]) => {
      if (measurement.sceneId === sceneId) {
        delete tableEntries[userId];
        modified = true;
      }
    });
    if (modified) {
      if (Object.keys(tableEntries).length === 0) delete this.tableMeasurements[tableId];
      this.markActivity(tableId);
    }
  }

  getTablesForUser(userId: string): string[] {
    return Object.keys(this.tableMeasurements).filter((tableId) =>
      Boolean(this.tableMeasurements[tableId]?.[userId])
    );
  }

  clearAllForUser(userId: string): void {
    Object.keys(this.tableMeasurements).forEach((tableId) => {
      if (this.tableMeasurements[tableId]?.[userId]) {
        delete this.tableMeasurements[tableId][userId];
        if (Object.keys(this.tableMeasurements[tableId]).length === 0) {
          delete this.tableMeasurements[tableId];
        }
        this.markActivity(tableId);
      }
    });
  }

  addPersistent(tableId: string, sceneId: string, measurement: PersistentMeasurementPayload): void {
    if (!this.persistentByTableScene[tableId]) this.persistentByTableScene[tableId] = {};
    if (!this.persistentByTableScene[tableId][sceneId]) this.persistentByTableScene[tableId][sceneId] = {};
    this.persistentByTableScene[tableId][sceneId][measurement.id] = measurement;
    this.markActivity(tableId);
  }

  removePersistent(tableId: string, sceneId: string, measurementId: string): void {
    if (this.persistentByTableScene[tableId]?.[sceneId]) {
      delete this.persistentByTableScene[tableId][sceneId][measurementId];
      this.markActivity(tableId);
    }
  }

  listPersistents(tableId: string, sceneId: string): PersistentMeasurementPayload[] {
    return Object.values(this.persistentByTableScene[tableId]?.[sceneId] || {});
  }

  clearPersistentsForScene(tableId: string, sceneId: string): void {
    if (this.persistentByTableScene[tableId]?.[sceneId]) {
      this.persistentByTableScene[tableId][sceneId] = {};
      this.markActivity(tableId);
    }
  }

  upsertAura(aura: AuraPayload): void {
    if (!this.aurasByTableScene[aura.tableId]) this.aurasByTableScene[aura.tableId] = {};
    if (!this.aurasByTableScene[aura.tableId][aura.sceneId]) this.aurasByTableScene[aura.tableId][aura.sceneId] = {};
    this.aurasByTableScene[aura.tableId][aura.sceneId][aura.tokenId] = aura;
    this.markActivity(aura.tableId);
  }

  removeAura(tableId: string, sceneId: string, tokenId: string): void {
    if (this.aurasByTableScene[tableId]?.[sceneId]) {
      delete this.aurasByTableScene[tableId][sceneId][tokenId];
      this.markActivity(tableId);
    }
  }

  listAuras(tableId: string, sceneId: string): AuraPayload[] {
    return Object.values(this.aurasByTableScene[tableId]?.[sceneId] || {});
  }

  clearAurasForScene(tableId: string, sceneId: string): void {
    if (this.aurasByTableScene[tableId]?.[sceneId]) {
      this.aurasByTableScene[tableId][sceneId] = {};
      this.markActivity(tableId);
    }
  }

  clearAllForTable(tableId: string): void {
    delete this.tableMeasurements[tableId];
    delete this.persistentByTableScene[tableId];
    delete this.aurasByTableScene[tableId];
    delete this.tableActivityMs[tableId];
  }

  cleanupInactiveTables(maxIdleMs: number): void {
    if (!maxIdleMs || maxIdleMs <= 0) return;
    const now = Date.now();
    Object.entries(this.tableActivityMs).forEach(([tableId, lastActivity]) => {
      if (now - lastActivity > maxIdleMs) {
        this.clearAllForTable(tableId);
      }
    });
  }
}

export function createInMemoryMeasurementStore() {
  return new InMemoryMeasurementStore();
}
