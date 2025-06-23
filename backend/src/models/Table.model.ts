import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITable extends Document {
  _id: Types.ObjectId;
  name: string;
  dm: Types.ObjectId; // Referência ao ID do usuário que é o Mestre
  players: Types.ObjectId[]; // Uma lista de IDs de usuários que são jogadores
  inviteCode: string; // Um código único para convidar outros jogadores
}

const TableSchema: Schema<ITable> = new Schema({
  name: { type: String, required: true, trim: true },
  dm: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  players: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  inviteCode: { type: String, required: true, unique: true },
}, {
  timestamps: true
});

export default mongoose.model<ITable>('Table', TableSchema);