import mongoose, { Schema, Document, Types } from 'mongoose';

export const assetKinds = ['map', 'token', 'avatar'] as const;
export type AssetKind = (typeof assetKinds)[number];

export interface IAsset extends Document {
  _id: Types.ObjectId;
  /** Ausente em avatares: eles não pertencem a uma mesa. */
  tableId?: Types.ObjectId;
  ownerId: Types.ObjectId;
  kind: AssetKind;
  objectPath: string;
  publicUrl: string;
  bytes: number;
  mimeType: string;
  width: number;
  height: number;
  createdAt: Date;
  updatedAt: Date;
}

const AssetSchema: Schema<IAsset> = new Schema({
  tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: false },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: assetKinds, required: true },
  objectPath: { type: String, required: true },
  publicUrl: { type: String, required: true },
  bytes: { type: Number, required: true, min: 0, default: 0 },
  mimeType: { type: String, required: true, default: 'image/webp' },
  width: { type: Number, required: true, min: 0, default: 0 },
  height: { type: Number, required: true, min: 0, default: 0 },
}, {
  timestamps: true,
});

AssetSchema.index({ tableId: 1, kind: 1 });
AssetSchema.index({ publicUrl: 1 });
AssetSchema.index({ createdAt: 1 });

export default mongoose.model<IAsset>('Asset', AssetSchema);
