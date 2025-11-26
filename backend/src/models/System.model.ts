import { Schema, model, Document } from 'mongoose';

export type AttributeType = 'number' | 'text' | 'boolean';
export type DiagonalRule = '5-10-5' | '5' | 'euclidean';

export interface ISystem extends Document {
  key: string;
  name: string;
  description?: string;
  defaultAttributes?: Array<{
    key: string;
    label: string;
    type: AttributeType;
  }>;
  movementRules?: {
    baseSpeedFeet?: number;
    diagonalRule?: DiagonalRule;
    gridSizeFeet?: number;
  };
  dicePresets?: Array<{
    key: string;
    label: string;
    expression: string;
    category?: string;
  }>;
  docsUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const SystemSchema = new Schema<ISystem>({
  key: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  defaultAttributes: [{
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ['number', 'text', 'boolean'], default: 'number' },
  }],
  movementRules: {
    baseSpeedFeet: { type: Number },
    diagonalRule: { type: String, enum: ['5-10-5', '5', 'euclidean'] },
    gridSizeFeet: { type: Number },
  },
  dicePresets: [{
    key: { type: String, required: true },
    label: { type: String, required: true },
    expression: { type: String, required: true },
    category: { type: String },
  }],
  docsUrl: { type: String, default: null },
}, {
  timestamps: true,
});

SystemSchema.index({ key: 1 }, { unique: true });

export default model<ISystem>('System', SystemSchema);
