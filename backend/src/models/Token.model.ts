import mongoose, { Schema, Document, Types } from "mongoose";

export interface IToken extends Document {
    _id: Types.ObjectId;
    squareId: string;
    color: string;
    ownerId: Types.ObjectId;
    name: string;
    imageUrl?: string;
    tableId: Types.ObjectId;
    sceneId?: Types.ObjectId; 
    movement: number;
    remainingMovement: number;
    previousSquareId?: string;
}

const TokenSchema: Schema = new Schema({
    squareId: { type: String, required: true, index: true },
    color: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, default: 'Token' }, 
    imageUrl: { type: String, required: false }, 
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true, index:true },
    sceneId: { type: Schema.Types.ObjectId, ref: 'Scene', required: true, index: true },
    movement: { type: Number, required: true, default: 9 },
    remainingMovement: { type: Number, required: true, default: 9 },
    previousSquareId: { type: String, required: false },
}, {
    timestamps: true
});

export default mongoose.model<IToken>("Token", TokenSchema);