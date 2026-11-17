import { Schema, model, Document, Types } from 'mongoose';

export interface ITokenTemplate extends Document {
  ownerId: Types.ObjectId;
  systemId?: Types.ObjectId | null;
  name: string;
  imageUrl?: string;
  size?: string;
  color?: string;
  tags?: string[];
  baseMovement?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const TokenTemplateSchema = new Schema<ITokenTemplate>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  systemId: { type: Schema.Types.ObjectId, ref: 'System', default: null },
  name: { type: String, required: true, trim: true },
  imageUrl: { type: String, default: '' },
  size: { type: String, default: 'Pequeno/Médio' },
  color: { type: String, default: '' },
  tags: [{ type: String }],
  baseMovement: { type: Number },
}, {
  timestamps: true,
});

TokenTemplateSchema.index({ ownerId: 1, name: 1 });

export default model<ITokenTemplate>('TokenTemplate', TokenTemplateSchema);
