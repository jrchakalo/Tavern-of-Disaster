import { Schema, model, Document, Types } from 'mongoose';

export interface IRoll extends Document {
  userId: Types.ObjectId;
  tableId: Types.ObjectId;
  expression: string;
  total: number;
  modifier: number;
  rolls: Array<{ die: number; value: number; kept: 'kept' | 'dropped'; explosions?: number }>;
  metadata?: string;
  tags?: string[];
  characterId?: Types.ObjectId;
  tokenId?: Types.ObjectId;
  /** Revisão da mesa no instante da rolagem (para reconstruir o log no snapshot). */
  revision?: number;
  createdAt: Date;
  updatedAt: Date;
}

const RollSchema = new Schema<IRoll>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true },
    expression: { type: String, required: true },
    total: { type: Number, required: true },
    modifier: { type: Number, default: 0 },
    rolls: [
      {
        die: { type: Number, required: true },
        value: { type: Number, required: true },
        kept: { type: String, enum: ['kept', 'dropped'], default: 'kept' },
        explosions: { type: Number, min: 0, default: undefined },
      },
    ],
    metadata: { type: String },
    tags: [{ type: String }],
    characterId: { type: Schema.Types.ObjectId, ref: 'Character' },
    tokenId: { type: Schema.Types.ObjectId, ref: 'Token' },
    revision: { type: Number, min: 0 },
  },
  { timestamps: true }
);

RollSchema.index({ tableId: 1, createdAt: -1 });
RollSchema.index({ userId: 1, tableId: 1, createdAt: -1 });
// Retenção de 7 dias (Atlas M0 / histórico do beta).
RollSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default model<IRoll>('Roll', RollSchema);
