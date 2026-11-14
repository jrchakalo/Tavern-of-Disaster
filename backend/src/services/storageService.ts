import sharp from 'sharp';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import dotenv from 'dotenv';

dotenv.config();

type UploadTarget = 'map' | 'token' | 'avatar';

type AssetProfile = {
  maxWidth: number;
  maxHeight: number;
  maxBytes: number;
  quality: number;
  folder: string;
};

export type StorageUploadResult = { publicUrl: string; objectPath: string };

const MB = 1024 * 1024;

const requiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[storage] Missing required env var: ${key}`);
  }
  return value;
};

const numberFromEnv = (key: string): number | undefined => {
  const value = process.env[key];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const supabaseUrl = requiredEnv('SUPABASE_URL');
const supabaseKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const supabaseBucket = requiredEnv('SUPABASE_BUCKET');
const assetBaseUrl = process.env.ASSET_BASE_URL?.replace(/\/+$/, '') || null;

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

const supabaseClient: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

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

async function processImage(buffer: Buffer, profile: AssetProfile): Promise<Buffer> {
  let pipeline = sharp(buffer, { failOn: 'truncated' });
  pipeline = pipeline.rotate();
  pipeline = pipeline.resize({
    width: profile.maxWidth,
    height: profile.maxHeight,
    fit: 'inside',
    withoutEnlargement: true,
  });

  const processed = await pipeline.webp({ quality: profile.quality, effort: 4 }).toBuffer();
  if (processed.length > profile.maxBytes) {
    throw new Error('Imagem otimizada excede o limite configurado. Tente usar um arquivo menor.');
  }
  return processed;
}

async function pushToStorage(objectPath: string, buffer: Buffer): Promise<void> {
  const { error } = await supabaseClient
    .storage
    .from(supabaseBucket)
    .upload(objectPath, buffer, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (error) {
    throw new Error(`Falha ao enviar arquivo para o storage: ${error.message}`);
  }
}

function buildPublicUrl(objectPath: string): string {
  if (assetBaseUrl) {
    return `${assetBaseUrl}/${objectPath}`;
  }

  const { data } = supabaseClient.storage.from(supabaseBucket).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    throw new Error('Não foi possível gerar a URL pública do arquivo.');
  }
  return data.publicUrl;
}

function buildPath(kind: UploadTarget, identifiers: { tableId?: string; ownerId?: string; userId?: string }): string {
  const stamp = new Date().toISOString().replace(/[:.TZ-]/g, '');
  const random = nanoid(8);
  if (kind === 'avatar') {
    const userSegment = sanitizeSegment(identifiers.userId, 'user');
    return `${assetProfiles.avatar.folder}/${userSegment}/${stamp}-${random}.webp`;
  }

  const tableSegment = sanitizeSegment(identifiers.tableId, 'table');
  const ownerSegment = sanitizeSegment(identifiers.ownerId, 'owner');
  const folder = assetProfiles[kind].folder;
  return `tables/${tableSegment}/${folder}/${ownerSegment}/${stamp}-${random}.webp`;
}

async function uploadWithProfile(target: UploadTarget, params: { buffer: Buffer; mimeType: string; tableId?: string; ownerId?: string; userId?: string; }): Promise<StorageUploadResult> {
  const profile = assetProfiles[target];
  if (!profile) {
    throw new Error(`Perfil de upload desconhecido: ${target}`);
  }

  ensureImageMime(params.mimeType);
  if (params.buffer.length > profile.maxBytes * 4) {
    throw new Error('Arquivo enviado é muito grande para ser processado.');
  }

  const processed = await processImage(params.buffer, profile);
  const objectPath = buildPath(target, params);
  await pushToStorage(objectPath, processed);
  const publicUrl = buildPublicUrl(objectPath);
  return { publicUrl, objectPath };
}

export function uploadMapImage(params: { tableId: string; ownerId: string; buffer: Buffer; mimeType: string }): Promise<StorageUploadResult> {
  return uploadWithProfile('map', params);
}

export function uploadTokenImage(params: { tableId: string; ownerId: string; buffer: Buffer; mimeType: string }): Promise<StorageUploadResult> {
  return uploadWithProfile('token', params);
}

export function uploadAvatarImage(params: { userId: string; buffer: Buffer; mimeType: string }): Promise<StorageUploadResult> {
  return uploadWithProfile('avatar', params);
}
