import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInitiativeEntry {
  _id: Types.ObjectId; // Cada entrada terá um ID único para facilitar a reordenação e exclusão
  characterName: string;
  tokenId?: Types.ObjectId;
  isCurrentTurn: boolean;
}

export interface IScene extends Document {
  _id: Types.ObjectId;
  tableId: Types.ObjectId; 
  name: string; 
  imageUrl?: string;
  gridSize?: number; // Tamanho da grade, se necessário
  type: 'battlemap' | 'image';
  initiative: IInitiativeEntry[];
}

const InitiativeEntrySchema: Schema<IInitiativeEntry> = new Schema({
  characterName: { type: String, required: true },
  tokenId: { type: Schema.Types.ObjectId, ref: 'Token', required: false },
  isCurrentTurn: { type: Boolean, default: false },
});

const SceneSchema: Schema<IScene> = new Schema({
  tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true, index: true },
  name: { type: String, required: true, default: 'Cena Padrão' },
  imageUrl: { type: String, required: false },
  gridSize: { type: Number, default: 30 },
  type: { 
    type: String, 
    enum: ['battlemap', 'image'], 
    default: 'battlemap'
  },
  initiative: [InitiativeEntrySchema],
}, {
  timestamps: true
});

export default mongoose.model<IScene>('Scene', SceneSchema);