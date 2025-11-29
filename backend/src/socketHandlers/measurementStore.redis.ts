import type Redis from 'ioredis';
import {
  AuraPayload,
  IMeasurementStore,
  MeasurementPayload,
  PersistentMeasurementPayload,
} from './measurementStore.types';

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function serialize(data: unknown) {
  return JSON.stringify(data);
}

export type RedisMeasurementStoreOptions = {
  prefix?: string;
};

export class RedisMeasurementStore implements IMeasurementStore {
  private readonly prefix: string;

  constructor(private readonly client: Redis, options: RedisMeasurementStoreOptions = {}) {
    this.prefix = options.prefix ?? 'tod';
  }

  private key(parts: string[]) {
    return `${this.prefix}:${parts.join(':')}`;
  }

  private ephemeralKey(tableId: string) {
    return this.key(['measurements', 'table', tableId]);
  }

  private userIndexKey(userId: string) {
    return this.key(['measurements', 'user', userId]);
  }

  private activityKey(tableId: string) {
    return this.key(['measurements', 'activity', tableId]);
  }

  private persistentsKey(tableId: string, sceneId: string) {
    return this.key(['persistents', tableId, sceneId]);
  }

  private aurasKey(tableId: string, sceneId: string) {
    return this.key(['auras', tableId, sceneId]);
  }

  private async scanKeys(pattern: string) {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, found] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== '0');
    return keys;
  }

  private async touchActivity(tableId: string) {
    await this.client.set(this.activityKey(tableId), Date.now().toString());
  }

  async setMeasurement(tableId: string, userId: string, measurement: MeasurementPayload): Promise<void> {
    const pipeline = this.client.multi();
    pipeline.hset(this.ephemeralKey(tableId), userId, serialize(measurement));
    pipeline.sadd(this.userIndexKey(userId), tableId);
    pipeline.set(this.activityKey(tableId), Date.now().toString());
    await pipeline.exec();
  }

  async getEphemeral(tableId: string): Promise<Record<string, MeasurementPayload>> {
    const raw = await this.client.hgetall(this.ephemeralKey(tableId));
    const result: Record<string, MeasurementPayload> = {};
    Object.entries(raw).forEach(([userId, payload]) => {
      const parsed = safeParse<MeasurementPayload>(payload);
      if (parsed) result[userId] = parsed;
    });
    return result;
  }

  async removeMeasurement(tableId: string, userId: string): Promise<void> {
    const pipeline = this.client.multi();
    pipeline.hdel(this.ephemeralKey(tableId), userId);
    pipeline.srem(this.userIndexKey(userId), tableId);
    pipeline.set(this.activityKey(tableId), Date.now().toString());
    await pipeline.exec();
  }

  async clearMeasurementsForTable(tableId: string): Promise<void> {
    const key = this.ephemeralKey(tableId);
    const users = await this.client.hkeys(key);
    const pipeline = this.client.multi();
    pipeline.del(key);
    users.forEach((userId) => pipeline.srem(this.userIndexKey(userId), tableId));
    pipeline.del(this.activityKey(tableId));
    await pipeline.exec();
  }

  async clearMeasurementsForScene(tableId: string, sceneId: string): Promise<void> {
    const key = this.ephemeralKey(tableId);
    const entries = await this.client.hgetall(key);
    const pipeline = this.client.multi();
    let modified = false;
    Object.entries(entries).forEach(([userId, raw]) => {
      const parsed = safeParse<MeasurementPayload>(raw);
      if (parsed?.sceneId === sceneId) {
        pipeline.hdel(key, userId);
        pipeline.srem(this.userIndexKey(userId), tableId);
        modified = true;
      }
    });
    if (!modified) return;
    pipeline.set(this.activityKey(tableId), Date.now().toString());
    await pipeline.exec();
  }

  async getTablesForUser(userId: string): Promise<string[]> {
    return this.client.smembers(this.userIndexKey(userId));
  }

  async clearAllForUser(userId: string): Promise<void> {
    const tables = await this.getTablesForUser(userId);
    await Promise.all(tables.map((tableId) => this.removeMeasurement(tableId, userId)));
    await this.client.del(this.userIndexKey(userId));
  }

  async addPersistent(tableId: string, sceneId: string, measurement: PersistentMeasurementPayload): Promise<void> {
    await this.client.hset(this.persistentsKey(tableId, sceneId), measurement.id, serialize(measurement));
    await this.touchActivity(tableId);
  }

  async removePersistent(tableId: string, sceneId: string, measurementId: string): Promise<void> {
    await this.client.hdel(this.persistentsKey(tableId, sceneId), measurementId);
    await this.touchActivity(tableId);
  }

  async listPersistents(tableId: string, sceneId: string): Promise<PersistentMeasurementPayload[]> {
    const raw = await this.client.hgetall(this.persistentsKey(tableId, sceneId));
    return Object.values(raw)
      .map((payload) => safeParse<PersistentMeasurementPayload>(payload))
      .filter((item): item is PersistentMeasurementPayload => Boolean(item));
  }

  async clearPersistentsForScene(tableId: string, sceneId: string): Promise<void> {
    await this.client.del(this.persistentsKey(tableId, sceneId));
    await this.touchActivity(tableId);
  }

  async upsertAura(aura: AuraPayload): Promise<void> {
    await this.client.hset(this.aurasKey(aura.tableId, aura.sceneId), aura.tokenId, serialize(aura));
    await this.touchActivity(aura.tableId);
  }

  async removeAura(tableId: string, sceneId: string, tokenId: string): Promise<void> {
    await this.client.hdel(this.aurasKey(tableId, sceneId), tokenId);
    await this.touchActivity(tableId);
  }

  async listAuras(tableId: string, sceneId: string): Promise<AuraPayload[]> {
    const raw = await this.client.hgetall(this.aurasKey(tableId, sceneId));
    return Object.values(raw)
      .map((payload) => safeParse<AuraPayload>(payload))
      .filter((item): item is AuraPayload => Boolean(item));
  }

  async clearAurasForScene(tableId: string, sceneId: string): Promise<void> {
    await this.client.del(this.aurasKey(tableId, sceneId));
    await this.touchActivity(tableId);
  }

  async clearAllForTable(tableId: string): Promise<void> {
    await this.clearMeasurementsForTable(tableId);
    const persistentKeys = await this.scanKeys(this.key(['persistents', tableId, '*']));
    const auraKeys = await this.scanKeys(this.key(['auras', tableId, '*']));
    const keysToDelete = [...persistentKeys, ...auraKeys];
    if (keysToDelete.length) {
      await this.client.del(...keysToDelete);
    }
  }

  async cleanupInactiveTables(maxIdleMs: number): Promise<void> {
    if (!maxIdleMs || maxIdleMs <= 0) return;
    const activityPattern = this.key(['measurements', 'activity', '*']);
    const keys = await this.scanKeys(activityPattern);
    const now = Date.now();
    await Promise.all(keys.map(async (key) => {
      const lastActivityRaw = await this.client.get(key);
      const lastActivity = lastActivityRaw ? Number(lastActivityRaw) : 0;
      const tableId = key.split(':').pop() || '';
      if (tableId && lastActivity && now - lastActivity > maxIdleMs) {
        await this.clearAllForTable(tableId);
      }
    }));
  }
}

export function createRedisMeasurementStore(client: Redis, options?: RedisMeasurementStoreOptions) {
  return new RedisMeasurementStore(client, options);
}
