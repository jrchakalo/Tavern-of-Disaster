import mongoose, { Schema, Document, Types } from "mongoose";

export interface IToken extends Document {
    _id: Types.ObjectId;
    squareId: string;
    color: string;
    ownerId: string;
    name: string;
    imageUrl?: string;
    tableId: Types.ObjectId;
    sceneId?: Types.ObjectId; 
}

const TokenSchema: Schema = new Schema({
    squareId: { type: String, required: true, index: true },
    color: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, default: 'Token' }, 
    imageUrl: { type: String, required: false }, 
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true, index:true },
    sceneId: { type: Schema.Types.ObjectId, ref: 'Scene', required: true, index: true },
}, {
    timestamps: true
});

export default mongoose.model<IToken>("Token", TokenSchema);