import { Router, NextFunction, Response } from 'express';
import multer, { MulterError } from 'multer';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import { getTableById, assertUserIsDM } from '../services/tableService';
import { uploadAvatarImage, uploadMapImage, uploadTokenImage, storageLimits } from '../services/storageService';
import { ServiceError } from '../services/serviceErrors';
import { createLogger } from '../logger';

const router = Router();
const log = createLogger({ scope: 'asset-routes' });
const memoryStorage = multer.memoryStorage();

const buildUploader = (maxBytes: number) => multer({
  storage: memoryStorage,
  limits: { fileSize: Math.max(1, maxBytes) },
});

const mapUploader = buildUploader(storageLimits.map.maxBytes);
const tokenUploader = buildUploader(storageLimits.token.maxBytes);
const avatarUploader = buildUploader(storageLimits.avatar.maxBytes);

router.post('/maps/:tableId', authMiddleware, mapUploader.single('file'), async (req: AuthRequest, res) => {
  try {
    const { tableId } = req.params;
    const userId = req.user?.id;
    if (!tableId) {
      res.status(400).json({ message: 'ID da mesa é obrigatório.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: 'Nenhum arquivo foi enviado.' });
      return;
    }

    const table = await getTableById(tableId);
    if (!table) {
      res.status(404).json({ message: 'Mesa não encontrada.' });
      return;
    }
    assertUserIsDM(userId, table);

    const result = await uploadMapImage({
      tableId,
      ownerId: userId!,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });

    res.status(201).json({ publicUrl: result.publicUrl });
  } catch (error) {
    handleUploadError(error, res, 'map');
  }
});

router.post('/tokens/:tableId', authMiddleware, tokenUploader.single('file'), async (req: AuthRequest, res) => {
  try {
    const { tableId } = req.params;
    const userId = req.user?.id;
    if (!tableId) {
      res.status(400).json({ message: 'ID da mesa é obrigatório.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: 'Nenhum arquivo foi enviado.' });
      return;
    }

    const table = await getTableById(tableId);
    if (!table) {
      res.status(404).json({ message: 'Mesa não encontrada.' });
      return;
    }
    assertUserIsDM(userId, table);

    const result = await uploadTokenImage({
      tableId,
      ownerId: userId!,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });

    res.status(201).json({ publicUrl: result.publicUrl });
  } catch (error) {
    handleUploadError(error, res, 'token');
  }
});

router.post('/avatar', authMiddleware, avatarUploader.single('file'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Usuário não autenticado.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: 'Nenhum arquivo foi enviado.' });
      return;
    }

    const result = await uploadAvatarImage({
      userId,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });

    res.status(201).json({ publicUrl: result.publicUrl });
  } catch (error) {
    handleUploadError(error, res, 'avatar');
  }
});

function handleUploadError(error: unknown, res: Response, scope: string) {
  log.error({ err: error, scope }, 'Erro ao processar upload');
  if (error instanceof ServiceError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  if (error instanceof Error) {
    res.status(400).json({ message: error.message });
    return;
  }
  res.status(500).json({ message: 'Erro ao processar upload.' });
}

router.use((err: unknown, _req: AuthRequest, res: Response, next: NextFunction) => {
  if (err instanceof MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'O arquivo excede o tamanho máximo permitido.'
      : err.message;
    res.status(400).json({ message });
    return;
  }
  next(err);
});

export default router;
