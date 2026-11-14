import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  username: string;
  email: string;
  passwordHash: string; // Salva o hash, não a senha
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  preferredSystemId?: Types.ObjectId | null;
  measurementColor?: string;
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
  },
  displayName: {
    type: String,
    trim: true,
    maxlength: 80,
  },
  avatarUrl: {
    type: String,
    trim: true,
    maxlength: 512,
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 1024,
  },
  preferredSystemId: {
    type: Schema.Types.ObjectId,
    ref: 'System',
    default: null,
  },
  measurementColor: {
    type: String,
    trim: true,
    maxlength: 20,
    validate: {
      validator(value: string | undefined | null) {
        if (!value) return true;
        return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
      },
      message: 'measurementColor deve ser um hex válido (#RGB ou #RRGGBB).',
    },
  },
}, {
  timestamps: true
});

export default mongoose.model<IUser>('User', UserSchema);