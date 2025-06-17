import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  username: string;
  email: string;
  passwordHash: string; // Salva o hash, não a senha
}

const UserSchema: Schema<IUser> = new Schema({
  username: {
    type: String,
    required: true,
    unique: true, // Cada nome de usuário deve ser único
    trim: true,   // Remove espaços em branco do início e fim
  },
  email: {
    type: String,
    required: true,
    unique: true, // Cada email deve ser único
    trim: true,
    lowercase: true, // Salva o email em minúsculas
  },
  passwordHash: {
    type: String,
    required: true,
  }
}, {
  timestamps: true
});

export default mongoose.model<IUser>('User', UserSchema);