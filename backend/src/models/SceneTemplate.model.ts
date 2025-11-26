import { Schema, model, Document, Types } from 'mongoose';

export interface ISceneTemplate extends Document {
  ownerId: Types.ObjectId;
  systemId?: Types.ObjectId | null;
  name: string;
  mapUrl: string;
  gridWidth?: number;
  gridHeight?: number;
  type?: 'battlemap' | 'image';
  defaultMetersPerSquare?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const SceneTemplateSchema = new Schema<ISceneTemplate>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  systemId: { type: Schema.Types.ObjectId, ref: 'System', default: null },
  name: { type: String, required: true, trim: true },
  mapUrl: { type: String, required: true },
  gridWidth: { type: Number, default: 30 },
  gridHeight: { type: Number, default: 30 },
  type: { type: String, enum: ['battlemap', 'image'], default: 'battlemap' },
  defaultMetersPerSquare: { type: Number, default: 1.5 },
}, {
  timestamps: true,
});

export default model<ISceneTemplate>('SceneTemplate', SceneTemplateSchema);
