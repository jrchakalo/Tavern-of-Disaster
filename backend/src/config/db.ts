// Arquivo de configuração para conexão com o MongoDB usando Mongoose
import mongoose from "mongoose";
import dotenv from "dotenv";
import Token from "../models/Token.model";

dotenv.config();

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            console.error("Erro: MONGO_URI não está definido no arquivo .env");
            process.exit(1);
        }
        
        // Conecta ao MongoDB
        await mongoose.connect(mongoURI);

        try {
            const deleteResultToken = await Token.deleteMany({}); // Limpa a coleção de Tokens
        } catch (clearError: any) {
            console.error('Erro ao limpar o db:', clearError.message);
        }

        console.log("Conexão com o MongoDB estabelecida com sucesso.");
    }catch (err: any){
        console.error("Erro ao conectar ao MongoDB:", err.message);
        process.exit(1);
    }
};

export default connectDB;