import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import userRoutes from './routes/userRoutes';
import tableRoutes from './routes/tableRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rotas users
app.use('/api/users', userRoutes);

// Rotas tables
app.use('/api/table', tableRoutes);

// Rota de teste
app.get('/test', (req, res) => {
  res.send('API Tavern of Disaster');
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
