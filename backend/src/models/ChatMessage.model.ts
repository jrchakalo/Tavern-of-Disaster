import { Schema, model, Document, Types } from 'mongoose';

export type ChatMessageKind = 'user' | 'system';

export interface IChatMessage extends Document {
  tableId: Types.ObjectId;
  userId: Types.ObjectId;
  username: string;
  text: string;
  mentions: string[];
  kind: ChatMessageKind;
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true, trim: true, maxlength: 80 },
    text: { type: String, required: true, maxlength: 1000 },
    mentions: { type: [String], default: [] },
    kind: { type: String, enum: ['user', 'system'], default: 'user' },
  },
  { timestamps: true }
);

ChatMessageSchema.index({ tableId: 1, createdAt: -1 });
// Retenção de 7 dias (histórico do beta).
ChatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default model<IChatMessage>('ChatMessage', ChatMessageSchema);
