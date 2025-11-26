import { Router } from 'express';
import System from '../models/System.model';

const router = Router();

router.get('/systems', async (_req, res) => {
  try {
    const systems = await System.find().lean();
    res.json(systems);
  } catch (error) {
    console.error('[systems] erro ao listar', error);
    res.status(500).json({ message: 'Não foi possível carregar os sistemas.' });
  }
});

router.get('/systems/key/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const system = await System.findOne({ key }).lean();
    if (!system) {
      res.status(404).json({ message: 'Sistema não encontrado.' });
      return;
    }
    res.json(system);
  } catch (error) {
    console.error('[systems] erro ao buscar por key', error);
    res.status(500).json({ message: 'Não foi possível carregar o sistema.' });
  }
});

router.get('/systems/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const system = await System.findById(id).lean();
    if (!system) {
      res.status(404).json({ message: 'Sistema não encontrado.' });
      return;
    }
    res.json(system);
  } catch (error) {
    console.error('[systems] erro ao buscar por id', error);
    res.status(500).json({ message: 'Não foi possível carregar o sistema.' });
  }
});

export default router;
