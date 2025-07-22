import mongoose, { Schema, Document, Types } from 'mongoose';

export const tableStatuses = ['PREPARING', 'LIVE', 'ENDED'];

export interface ITable extends Document {
  _id: Types.ObjectId;
  name: string;
  dm: Types.ObjectId; // Referência ao ID do usuário que é o Mestre
  players: Types.ObjectId[]; // Uma lista de IDs de usuários que são jogadores
  inviteCode: string; // Um código único para convidar outros jogadores
  activeScene?: Types.ObjectId;
  scenes: Types.ObjectId[];
  status: string;
}

const TableSchema: Schema<ITable> = new Schema({
  name: { type: String, required: true, trim: true },
  dm: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  players: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  inviteCode: { type: String, required: true, unique: true },
  activeScene: { type: Schema.Types.ObjectId, ref: 'Scene', required: false },
  scenes: [{ type: Schema.Types.ObjectId, ref: 'Scene' }],
  status: { 
    type: String,
    enum: tableStatuses,
    default: 'PREPARING', // Toda nova mesa começa em modo de preparação
  },
}, {
  timestamps: true
});

export default mongoose.model<ITable>('Table', TableSchema);