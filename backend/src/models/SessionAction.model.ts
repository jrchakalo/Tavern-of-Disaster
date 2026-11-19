import { Schema, model, Document, Types } from 'mongoose';

export type SessionActionType = 'system' | 'movement';

/**
 * Ação canônica da sessão (aba Ações do Histórico do Mestre).
 * Persistida no servidor para sobreviver a reload/reconexão/resync — o
 * histórico não pode viver apenas no `tableStore` do cliente.
 */
export interface ISessionAction extends Document {
  tableId: Types.ObjectId;
  type: SessionActionType;
  /** Texto pronto para exibição (pt-BR), no máximo 200 caracteres. */
  content: string;
  authorId?: Types.ObjectId | null;
  authorName?: string | null;
  /** Revisão da mesa no instante da ação (correlação com `sessionPatch`). */
  revision?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const SessionActionSchema = new Schema<ISessionAction>(
  {
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true, index: true },
    type: { type: String, enum: ['system', 'movement'], required: true },
    content: { type: String, required: true, maxlength: 200 },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: false, default: null },
    authorName: { type: String, required: false, default: null, maxlength: 80 },
    revision: { type: Number, required: false, default: null, min: 0 },
  },
  { timestamps: true }
);

SessionActionSchema.index({ tableId: 1, createdAt: -1 });
// Mesma retenção das rolagens: 7 dias no histórico do beta.
SessionActionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default model<ISessionAction>('SessionAction', SessionActionSchema);
