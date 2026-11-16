import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomId } from '../utils/id';
import { ServiceError } from './serviceErrors';
import dotenv from 'dotenv';

dotenv.config();

type UploadTarget = 'map' | 'token' | 'avatar';
type StorageDriver = 'local' | 'supabase';

type AssetProfile = {
  maxWidth: number;
  maxHeight: number;
  maxBytes: number;
  quality: number;
  folder: string;
};

export type StorageUploadResult = {
  publicUrl: string;
  objectPath: string;
  bytes: number;
  width: number;
  height: number;
  mimeType: string;
};

export const STORAGE_QUOTA_EXCEEDED_MESSAGE = 'A mesa atingiu o limite de armazenamento.';

const MB = 1024 * 1024;

const numberFromEnv = (key: string): number | undefined => {
  const value = process.env[key];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const resolveLimits = (prefix: string, defaults: AssetProfile): AssetProfile => {
  const globalWidth = numberFromEnv('ASSET_MAX_WIDTH');
  const globalHeight = numberFromEnv('ASSET_MAX_HEIGHT');
  const globalBytes = numberFromEnv('ASSET_MAX_BYTES');

  return {
    folder: defaults.folder,
    quality: defaults.quality,
    maxWidth: numberFromEnv(`${prefix}_MAX_WIDTH`) ?? globalWidth ?? defaults.maxWidth,
    maxHeight: numberFromEnv(`${prefix}_MAX_HEIGHT`) ?? globalHeight ?? defaults.maxHeight,
    maxBytes: numberFromEnv(`${prefix}_MAX_BYTES`) ?? globalBytes ?? defaults.maxBytes,
  };
};

const assetProfiles: Record<UploadTarget, AssetProfile> = {
  map: resolveLimits('MAP', { folder: 'maps', quality: 80, maxWidth: 8192, maxHeight: 8192, maxBytes: 40 * MB }),
  token: resolveLimits('TOKEN', { folder: 'tokens', quality: 85, maxWidth: 1024, maxHeight: 1024, maxBytes: 8 * MB }),
  avatar: resolveLimits('AVATAR', { folder: 'avatars', quality: 90, maxWidth: 512, maxHeight: 512, maxBytes: 4 * MB }),
};

export const storageLimits = {
  map: (({ maxBytes, maxWidth, maxHeight }) => ({ maxBytes, maxWidth, maxHeight }))(assetProfiles.map),
  token: (({ maxBytes, maxWidth, maxHeight }) => ({ maxBytes, maxWidth, maxHeight }))(assetProfiles.token),
  avatar: (({ maxBytes, maxWidth, maxHeight }) => ({ maxBytes, maxWidth, maxHeight }))(assetProfiles.avatar),
};

/**
 * Local disk driver is the default for development and for deployments without
 * object storage. Supabase is used when explicitly configured (or when all of
 * its env vars are present).
 */
function resolveDriver(): StorageDriver {
  const explicit = process.env.STORAGE_DRIVER?.toLowerCase();
  if (explicit === 'local' || explicit === 'supabase') return explicit;

  const hasSupabaseEnv = Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.SUPABASE_BUCKET
  );
  return hasSupabaseEnv ? 'supabase' : 'local';
}

let cachedSupabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (cachedSupabaseClient) return cachedSupabaseClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase storage selecionado, mas SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não estão configurados.'
    );
  }

  cachedSupabaseClient = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cachedSupabaseClient;
}

function getSupabaseBucket(): string {
  const bucket = process.env.SUPABASE_BUCKET;
  if (!bucket) {
    throw new Error('Supabase storage selecionado, mas SUPABASE_BUCKET não está configurado.');
  }
  return bucket;
}

function getLocalRoot(): string {
  return process.env.LOCAL_UPLOAD_DIR
    ? path.resolve(process.env.LOCAL_UPLOAD_DIR)
    : path.resolve(__dirname, '..', '..', 'uploads');
}

function getAssetBaseUrl(): string {
  // Padrão: URL relativa (`/uploads/...`), que funciona no notebook, na TV e
  // nos celulares atrás do mesmo proxy. Defina ASSET_BASE_URL apenas quando os
  // assets forem servidos por outra origem (CDN, bucket, API separada).
  return (process.env.ASSET_BASE_URL ?? '').trim().replace(/\/+$/, '');
}

function ensureImageMime(mime: string) {
  if (!mime?.startsWith('image/')) {
    throw new Error('Arquivo enviado precisa ser uma imagem.');
  }
}

function sanitizeSegment(value: string | undefined | null, fallback = 'unknown'): string {
  const safe = (value ?? '').toString().trim();
  if (!safe) return fallback;
  return safe.replace(/[^a-zA-Z0-9-_]/g, '');
}

type ProcessedImage = {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
};

async function processImage(buffer: Buffer, profile: AssetProfile): Promise<ProcessedImage> {
  let pipeline = sharp(buffer, { failOn: 'truncated' });
  pipeline = pipeline.rotate();
  pipeline = pipeline.resize({
    width: profile.maxWidth,
    height: profile.maxHeight,
    fit: 'inside',
    withoutEnlargement: true,
  });

  const { data, info } = await pipeline
    .webp({ quality: profile.quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  if (data.length > profile.maxBytes) {
    throw new Error('Imagem otimizada excede o limite configurado. Tente usar um arquivo menor.');
  }
  return {
    buffer: data,
    width: info.width ?? 0,
    height: info.height ?? 0,
    mimeType: 'image/webp',
  };
}

async function pushToLocalStorage(objectPath: string, buffer: Buffer): Promise<void> {
  const absolutePath = path.join(getLocalRoot(), objectPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
}

async function pushToSupabase(objectPath: string, buffer: Buffer): Promise<void> {
  const { error } = await getSupabaseClient()
    .storage
    .from(getSupabaseBucket())
    .upload(objectPath, buffer, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (error) {
    throw new Error(`Falha ao enviar arquivo para o storage: ${error.message}`);
  }
}

function buildPublicUrl(driver: StorageDriver, objectPath: string): string {
  if (driver === 'local') {
    return `${getAssetBaseUrl()}/uploads/${objectPath}`;
  }

  const configuredBase = process.env.ASSET_BASE_URL?.replace(/\/+$/, '');
  if (configuredBase) {
    return `${configuredBase}/${objectPath}`;
  }

  const { data } = getSupabaseClient().storage.from(getSupabaseBucket()).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    throw new Error('Não foi possível gerar a URL pública do arquivo.');
  }
  return data.publicUrl;
}

function buildPath(kind: UploadTarget, identifiers: { tableId?: string; ownerId?: string; userId?: string }): string {
  const stamp = new Date().toISOString().replace(/[:.TZ-]/g, '');
  const random = randomId(8);
  if (kind === 'avatar') {
    const userSegment = sanitizeSegment(identifiers.userId, 'user');
    return `${assetProfiles.avatar.folder}/${userSegment}/${stamp}-${random}.webp`;
  }

  const tableSegment = sanitizeSegment(identifiers.tableId, 'table');
  const ownerSegment = sanitizeSegment(identifiers.ownerId, 'owner');
  const folder = assetProfiles[kind].folder;
  return `tables/${tableSegment}/${folder}/${ownerSegment}/${stamp}-${random}.webp`;
}

type UploadParams = {
  buffer: Buffer;
  mimeType: string;
  tableId?: string;
  ownerId?: string;
  userId?: string;
  /** Quota restante da mesa (bytes). Rejeita 413 antes de gravar se o WebP exceder. */
  maxOutputBytes?: number;
};

async function uploadWithProfile(target: UploadTarget, params: UploadParams): Promise<StorageUploadResult> {
  const profile = assetProfiles[target];
  if (!profile) {
    throw new Error(`Perfil de upload desconhecido: ${target}`);
  }

  ensureImageMime(params.mimeType);
  if (params.buffer.length > profile.maxBytes * 4) {
    throw new Error('Arquivo enviado é muito grande para ser processado.');
  }

  const driver = resolveDriver();
  const processed = await processImage(params.buffer, profile);
  if (params.maxOutputBytes !== undefined && processed.buffer.length > params.maxOutputBytes) {
    throw new ServiceError(STORAGE_QUOTA_EXCEEDED_MESSAGE, 413, { code: 'QUOTA_EXCEEDED' });
  }
  const objectPath = buildPath(target, params);

  if (driver === 'local') {
    await pushToLocalStorage(objectPath, processed.buffer);
  } else {
    await pushToSupabase(objectPath, processed.buffer);
  }

  return {
    publicUrl: buildPublicUrl(driver, objectPath),
    objectPath,
    bytes: processed.buffer.length,
    width: processed.width,
    height: processed.height,
    mimeType: processed.mimeType,
  };
}

export function uploadMapImage(params: UploadParams & { tableId: string; ownerId: string }): Promise<StorageUploadResult> {
  return uploadWithProfile('map', params);
}

export function uploadTokenImage(params: UploadParams & { tableId: string; ownerId: string }): Promise<StorageUploadResult> {
  return uploadWithProfile('token', params);
}

export function uploadAvatarImage(params: UploadParams & { userId: string }): Promise<StorageUploadResult> {
  return uploadWithProfile('avatar', params);
}

/**
 * Remove o objeto do driver ativo. O driver local é best-effort (arquivo
 * ausente não é erro); o Supabase reporta falha para o chamador decidir se o
 * registro deve permanecer para nova tentativa.
 */
export async function deleteStoredAsset(objectPath: string): Promise<void> {
  if (!objectPath) return;

  if (resolveDriver() === 'local') {
    const absolutePath = path.join(getLocalRoot(), objectPath);
    await fs.rm(absolutePath, { force: true });
    return;
  }

  const { error } = await getSupabaseClient()
    .storage
    .from(getSupabaseBucket())
    .remove([objectPath]);

  if (error) {
    throw new Error(`Falha ao remover arquivo do storage: ${error.message}`);
  }
}

export const storageInfo = {
  driver: resolveDriver,
  localRoot: getLocalRoot,
};
