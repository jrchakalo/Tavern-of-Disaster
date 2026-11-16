import SceneOverlay from '../models/SceneOverlay.model';
import {
  AuraPayload,
  IMeasurementStore,
  PersistentMeasurementPayload,
} from './measurementStore.types';

const PERSISTENT_FIELDS = [
  'addPersistent',
  'removePersistent',
  'listPersistents',
  'clearPersistentsForScene',
  'upsertAura',
  'removeAura',
  'listAuras',
  'clearAurasForScene',
  'clearAllForTable',
] as const;

/**
 * Metade persistente/aura do `IMeasurementStore`: o Mongo é a fonte da verdade.
 * Medições efêmeras continuam no store em memória.
 */
export class MongoMeasurementStore
  implements Pick<IMeasurementStore, (typeof PERSISTENT_FIELDS)[number]>
{
  async addPersistent(
    tableId: string,
    sceneId: string,
    measurement: PersistentMeasurementPayload
  ): Promise<void> {
    await SceneOverlay.updateOne(
      { tableId, sceneId },
      { $push: { measurements: measurement } },
      { upsert: true }
    ).exec();
  }

  async removePersistent(tableId: string, sceneId: string, measurementId: string): Promise<void> {
    await SceneOverlay.updateOne(
      { tableId, sceneId },
      { $pull: { measurements: { id: measurementId } } }
    ).exec();
  }

  async listPersistents(
    tableId: string,
    sceneId: string
  ): Promise<PersistentMeasurementPayload[]> {
    const overlay = await SceneOverlay.findOne({ tableId, sceneId }).lean().exec();
    return (overlay?.measurements as PersistentMeasurementPayload[] | undefined) ?? [];
  }

  async clearPersistentsForScene(tableId: string, sceneId: string): Promise<void> {
    await SceneOverlay.updateOne({ tableId, sceneId }, { $set: { measurements: [] } }).exec();
  }

  /**
   * Substitui a aura do token no mesmo array — atômico via pipeline, para não
   * duplicar entradas em upserts concorrentes. Timestamps são explícitos porque
   * o Mongoose não injeta `createdAt`/`updatedAt` em updates por pipeline.
   */
  async upsertAura(aura: AuraPayload): Promise<void> {
    const { tableId, sceneId, tokenId } = aura;
    const now = new Date();
    const pipeline = [
      {
        $set: {
          measurements: { $ifNull: ['$measurements', []] },
          auras: {
            $concatArrays: [
              {
                $filter: {
                  input: { $ifNull: ['$auras', []] },
                  as: 'existing',
                  cond: { $ne: ['$$existing.tokenId', tokenId] },
                },
              },
              [aura],
            ],
          },
          createdAt: { $ifNull: ['$createdAt', now] },
          updatedAt: now,
        },
      },
    ];
    await SceneOverlay.updateOne({ tableId, sceneId }, pipeline, {
      upsert: true,
      timestamps: false,
    }).exec();
  }

  async removeAura(tableId: string, sceneId: string, tokenId: string): Promise<void> {
    await SceneOverlay.updateOne(
      { tableId, sceneId },
      { $pull: { auras: { tokenId } } }
    ).exec();
  }

  async listAuras(tableId: string, sceneId: string): Promise<AuraPayload[]> {
    const overlay = await SceneOverlay.findOne({ tableId, sceneId }).lean().exec();
    return (overlay?.auras as AuraPayload[] | undefined) ?? [];
  }

  async clearAurasForScene(tableId: string, sceneId: string): Promise<void> {
    await SceneOverlay.updateOne({ tableId, sceneId }, { $set: { auras: [] } }).exec();
  }

  /** Remove todos os overlays da mesa (todas as cenas). */
  async clearAllForTable(tableId: string): Promise<void> {
    await SceneOverlay.deleteMany({ tableId }).exec();
  }
}

export function createMongoMeasurementStore() {
  return new MongoMeasurementStore();
}
