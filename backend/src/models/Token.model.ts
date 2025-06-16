import mongoose, { Schema, Document, Types } from "mongoose";

export interface IToken extends Document {
    _id: Types.ObjectId;
    squareId: string;
    color: string;
    ownerSocketId: string;
    name: string;
    imageUrl?: string;
}

const TokenSchema: Schema = new Schema({
    squareId: { type: String, required: true, unique: true, index: true },
    color: { type: String, required: true },
    ownerSocketId: { type: String, required: true },
    name: { type: String, required: true, default: 'Token' }, 
    imageUrl: { type: String, required: false }, 
}, {
    timestamps: true
});

export default mongoose.model<IToken>("Token", TokenSchema);