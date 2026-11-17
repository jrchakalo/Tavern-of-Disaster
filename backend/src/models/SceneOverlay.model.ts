import mongoose, { Schema, Document, Types } from 'mongoose';
import type { AuraPayload, PersistentMeasurementPayload } from '../socketHandlers/measurementStore.types';

/**
 * Overlay persistente de uma cena: medições persistentes + auras.
 *
 * O payload é guardado exatamente como chega do contrato realtime (sem
 * transformação). Documentos podem ficar com as duas listas vazias após um
 * `clear*`: isso é intencional para manter o upsert idempotente e a chave única
 * `{tableId, sceneId}` estável. A limpeza da mesa remove o documento inteiro.
 */
export interface ISceneOverlay extends Document {
  _id: Types.ObjectId;
  tableId: Types.ObjectId;
  sceneId: Types.ObjectId;
  measurements: PersistentMeasurementPayload[];
  auras: AuraPayload[];
  createdAt: Date;
  updatedAt: Date;
}

const SceneOverlaySchema = new Schema<ISceneOverlay>(
  {
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true },
    sceneId: { type: Schema.Types.ObjectId, ref: 'Scene', required: true },
    measurements: { type: [Schema.Types.Mixed], default: [] } as any,
    auras: { type: [Schema.Types.Mixed], default: [] } as any,
  },
  { timestamps: true }
);

SceneOverlaySchema.index({ tableId: 1, sceneId: 1 }, { unique: true });

export default mongoose.model<ISceneOverlay>('SceneOverlay', SceneOverlaySchema);
