import { Schema, model, Document, Types } from 'mongoose';

export interface IRoll extends Document {
  userId: Types.ObjectId;
  tableId: Types.ObjectId;
  expression: string;
  total: number;
  modifier: number;
  rolls: Array<{ die: number; value: number; kept: 'kept' | 'dropped' }>;
  metadata?: string;
  tags?: string[];
  characterId?: Types.ObjectId;
  tokenId?: Types.ObjectId;
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
      },
    ],
    metadata: { type: String },
    tags: [{ type: String }],
    characterId: { type: Schema.Types.ObjectId, ref: 'Character' },
    tokenId: { type: Schema.Types.ObjectId, ref: 'Token' },
  },
  { timestamps: true }
);

// Future steps will use this model to persist the dice roll history for auditing and analytics.
export default model<IRoll>('Roll', RollSchema);
