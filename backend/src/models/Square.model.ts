import e from "express";
import mongoose, {Schema, Document} from "mongoose";

// Interface para o documento do MongoDB
export interface ISquare extends Document {
    squareId: string;
    color: string;
}

const SquareSchema: Schema = new Schema({
    squareId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    color: {
        type: String,
        required: true,
    },
}, {
    timestamps: true // Adiciona createdAt e updatedAt
});

export default mongoose.model<ISquare>('Square', SquareSchema);