import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IScene extends Document {
  _id: Types.ObjectId;
  tableId: Types.ObjectId; 
  name: string; 
  imageUrl?: string;
  gridSize?: number; // Tamanho da grade, se necessário
  // No futuro: tokens: [{ tokenId, positionX, positionY }]
}

const SceneSchema: Schema<IScene> = new Schema({
  tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true, index: true },
  name: { type: String, required: true, default: 'Cena Padrão' },
  imageUrl: { type: String, required: false },
  gridSize: { type: Number, default: 30, required: true },
}, {
  timestamps: true
});

export default mongoose.model<IScene>('Scene', SceneSchema);