import { Schema, model, Document, Types } from 'mongoose';

export interface CharacterStats {
  currentHP?: number;
  maxHP?: number;
  defense?: number;
  baseInitiative?: number;
}

export interface ICharacter extends Document {
  ownerId: Types.ObjectId;
  tableId: Types.ObjectId;
  name: string;
  avatarUrl?: string;
  attributes?: Record<string, number>;
  stats?: CharacterStats;
  skills?: Record<string, number | string>;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CharacterSchema = new Schema<ICharacter>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true, index: true },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String },
    attributes: { type: Map, of: Number, default: {} },
    stats: {
      currentHP: { type: Number, min: 0 },
      maxHP: { type: Number, min: 0 },
      defense: { type: Number, min: 0 },
      baseInitiative: { type: Number },
    },
    skills: { type: Map, of: Schema.Types.Mixed, default: {} },
    notes: { type: String },
  },
  { timestamps: true }
);

CharacterSchema.index({ ownerId: 1, tableId: 1 });

export default model<ICharacter>('Character', CharacterSchema);
