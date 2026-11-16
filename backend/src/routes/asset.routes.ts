import { Router, NextFunction, Response } from 'express';
import multer, { MulterError } from 'multer';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import { getTableById, assertUserIsDM, assertUserInTable } from '../services/tableService';
import {
  deleteStoredAsset,
  uploadAvatarImage,
  uploadMapImage,
  uploadTokenImage,
  storageLimits,
} from '../services/storageService';
import {
  deleteAssetById,
  getTableUsage,
  recordAsset,
  type AssetUsage,
} from '../services/assetService';
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

router.get('/tables/:tableId/usage', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { tableId } = req.params;
    const userId = req.user?.id;
    if (!tableId) {
      res.status(400).json({ message: 'ID da mesa é obrigatório.' });
      return;
    }

    const table = await getTableById(tableId);
    if (!table) {
      res.status(404).json({ message: 'Mesa não encontrada.' });
      return;
    }
    assertUserInTable(userId, table);

    const usage = await getTableUsage(tableId);
    res.json(usage);
  } catch (error) {
    handleAssetError(error, res, 'usage');
  }
});

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
    if (!userId) {
      res.status(401).json({ message: 'Usuário não autenticado.' });
      return;
    }

    const table = await getTableById(tableId);
    if (!table) {
      res.status(404).json({ message: 'Mesa não encontrada.' });
      return;
    }
    assertUserIsDM(userId, table);

    const usageBefore = await getTableUsage(tableId);
    if (usageBefore.remainingBytes <= 0) {
      res.status(413).json({ message: 'A mesa atingiu o limite de armazenamento.' });
      return;
    }

    const result = await uploadMapImage({
      tableId,
      ownerId: userId,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      maxOutputBytes: usageBefore.remainingBytes,
    });

    const asset = await persistUploadedAsset({
      tableId,
      ownerId: userId,
      kind: 'map',
      objectPath: result.objectPath,
      publicUrl: result.publicUrl,
      bytes: result.bytes,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
    });

    const usage = await getTableUsage(tableId);
    res.status(201).json({
      publicUrl: result.publicUrl,
      assetId: asset._id.toString(),
      bytes: result.bytes,
      usage: toUsageResponse(usage),
    });
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
    if (!userId) {
      res.status(401).json({ message: 'Usuário não autenticado.' });
      return;
    }

    const table = await getTableById(tableId);
    if (!table) {
      res.status(404).json({ message: 'Mesa não encontrada.' });
      return;
    }
    assertUserIsDM(userId, table);

    const usageBefore = await getTableUsage(tableId);
    if (usageBefore.remainingBytes <= 0) {
      res.status(413).json({ message: 'A mesa atingiu o limite de armazenamento.' });
      return;
    }

    const result = await uploadTokenImage({
      tableId,
      ownerId: userId,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      maxOutputBytes: usageBefore.remainingBytes,
    });

    const asset = await persistUploadedAsset({
      tableId,
      ownerId: userId,
      kind: 'token',
      objectPath: result.objectPath,
      publicUrl: result.publicUrl,
      bytes: result.bytes,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
    });

    const usage = await getTableUsage(tableId);
    res.status(201).json({
      publicUrl: result.publicUrl,
      assetId: asset._id.toString(),
      bytes: result.bytes,
      usage: toUsageResponse(usage),
    });
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

    const asset = await persistUploadedAsset({
      ownerId: userId,
      kind: 'avatar',
      objectPath: result.objectPath,
      publicUrl: result.publicUrl,
      bytes: result.bytes,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
    });

    res.status(201).json({
      publicUrl: result.publicUrl,
      assetId: asset._id.toString(),
      bytes: result.bytes,
    });
  } catch (error) {
    handleUploadError(error, res, 'avatar');
  }
});

router.delete('/:assetId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { assetId } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Usuário não autenticado.' });
      return;
    }
    if (!assetId) {
      res.status(400).json({ message: 'ID do asset é obrigatório.' });
      return;
    }

    await deleteAssetById(userId, assetId);
    res.json({ success: true, assetId });
  } catch (error) {
    handleAssetError(error, res, 'delete');
  }
});

/** Se o registro falhar, o arquivo recém-gravado não fica órfão invisível. */
async function persistUploadedAsset(input: Parameters<typeof recordAsset>[0]) {
  try {
    return await recordAsset(input);
  } catch (error) {
    await deleteStoredAsset(input.objectPath).catch(() => undefined);
    throw error;
  }
}

function toUsageResponse(usage: AssetUsage) {
  return {
    usedBytes: usage.usedBytes,
    quotaBytes: usage.quotaBytes,
    remainingBytes: usage.remainingBytes,
    count: usage.count,
    byKind: usage.byKind,
  };
}

function handleAssetError(error: unknown, res: Response, scope: string) {
  if (error instanceof ServiceError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  log.error({ err: error, scope }, 'Erro ao processar asset');
  res.status(500).json({ message: 'Erro ao processar asset.' });
}

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
