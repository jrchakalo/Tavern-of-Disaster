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
  // LEGADO: gridSize antigo (mantido para retrocompatibilidade). Use gridWidth/gridHeight daqui pra frente.
  gridSize?: number; 
  // NOVO: largura (número de colunas) da grade para suportar grids retangulares mantendo células quadradas
  gridWidth?: number;
  // NOVO: altura (número de linhas) da grade
  gridHeight?: number;
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
  // Mantemos gridSize como campo opcional (legado) – será usado como fallback se width/height não existirem
  gridSize: { type: Number, default: 30 },
  // Novos campos para permitir grids retangulares (ex: 50x30). Cada célula continua quadrada.
  gridWidth: { type: Number, default: 30 },
  gridHeight: { type: Number, default: 30 },
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