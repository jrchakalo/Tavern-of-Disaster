import { Types } from 'mongoose';
import Asset, { AssetKind, IAsset } from '../models/Asset.model';
import Scene from '../models/Scene.model';
import SceneTemplate from '../models/SceneTemplate.model';
import Token from '../models/Token.model';
import TokenTemplate from '../models/TokenTemplate.model';
import User from '../models/User.model';
import Character from '../models/Character.model';
import Table from '../models/Table.model';
import { ServiceError } from './serviceErrors';
import { deleteStoredAsset, STORAGE_QUOTA_EXCEEDED_MESSAGE } from './storageService';
import { createLogger } from '../logger';

const log = createLogger({ scope: 'asset-service' });

const MB = 1024 * 1024;
export const DEFAULT_TABLE_STORAGE_QUOTA_BYTES = 200 * MB;
export const DEFAULT_ASSET_ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ASSET_ORPHAN_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

const numberFromEnv = (key: string, fallback: number): number => {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export function getTableStorageQuotaBytes(): number {
  return numberFromEnv('TABLE_STORAGE_QUOTA_BYTES', DEFAULT_TABLE_STORAGE_QUOTA_BYTES);
}

export function getAssetOrphanTtlMs(): number {
  return numberFromEnv('ASSET_ORPHAN_TTL_MS', DEFAULT_ASSET_ORPHAN_TTL_MS);
}

export function getAssetOrphanSweepIntervalMs(): number {
  return numberFromEnv('ASSET_ORPHAN_SWEEP_INTERVAL_MS', DEFAULT_ASSET_ORPHAN_SWEEP_INTERVAL_MS);
}

export type AssetUsage = {
  usedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  count: number;
  byKind: Record<AssetKind, number>;
};

export type RecordAssetInput = {
  tableId?: string | null;
  ownerId: string;
  kind: AssetKind;
  objectPath: string;
  publicUrl: string;
  bytes: number;
  mimeType: string;
  width: number;
  height: number;
};

function toObjectId(value: string | Types.ObjectId, label: string): Types.ObjectId {
  if (value instanceof Types.ObjectId) return value;
  if (!Types.ObjectId.isValid(value)) {
    throw new ServiceError(`${label} inválido.`, 400);
  }
  return new Types.ObjectId(value);
}

function emptyUsage(quotaBytes: number): AssetUsage {
  return {
    usedBytes: 0,
    quotaBytes,
    remainingBytes: Math.max(0, quotaBytes),
    count: 0,
    byKind: { map: 0, token: 0, avatar: 0 },
  };
}

/** Soma o uso da mesa por tipo. Avatares (sem tableId) não entram na quota. */
export async function getTableUsage(tableId: string): Promise<AssetUsage> {
  const quotaBytes = getTableStorageQuotaBytes();
  if (!Types.ObjectId.isValid(tableId)) {
    return emptyUsage(quotaBytes);
  }

  const rows = await Asset.aggregate<{ _id: AssetKind; bytes: number; count: number }>([
    { $match: { tableId: new Types.ObjectId(tableId) } },
    { $group: { _id: '$kind', bytes: { $sum: '$bytes' }, count: { $sum: 1 } } },
  ]);

  const usage = emptyUsage(quotaBytes);
  rows.forEach((row) => {
    const bytes = Number(row.bytes) || 0;
    usage.usedBytes += bytes;
    usage.count += Number(row.count) || 0;
    if (row._id === 'map' || row._id === 'token' || row._id === 'avatar') {
      usage.byKind[row._id] += bytes;
    }
  });
  usage.remainingBytes = Math.max(0, quotaBytes - usage.usedBytes);
  return usage;
}

export async function assertTableQuota(tableId: string, incomingBytes: number): Promise<void> {
  const usage = await getTableUsage(tableId);
  const requested = Math.max(0, Number(incomingBytes) || 0);
  if (usage.usedBytes + requested > usage.quotaBytes) {
    throw new ServiceError(STORAGE_QUOTA_EXCEEDED_MESSAGE, 413, {
      code: 'QUOTA_EXCEEDED',
      usedBytes: usage.usedBytes,
      quotaBytes: usage.quotaBytes,
      incomingBytes: requested,
    });
  }
}

export async function recordAsset(input: RecordAssetInput): Promise<IAsset> {
  const asset = new Asset({
    tableId: input.tableId ? toObjectId(input.tableId, 'ID de mesa') : undefined,
    ownerId: toObjectId(input.ownerId, 'ID de usuário'),
    kind: input.kind,
    objectPath: input.objectPath,
    publicUrl: input.publicUrl,
    bytes: Math.max(0, Number(input.bytes) || 0),
    mimeType: input.mimeType,
    width: Math.max(0, Number(input.width) || 0),
    height: Math.max(0, Number(input.height) || 0),
  });
  await asset.save();
  return asset;
}

async function removeAssetDocument(asset: IAsset): Promise<boolean> {
  try {
    await deleteStoredAsset(asset.objectPath);
  } catch (error) {
    // Mantém o registro para nova tentativa (inclusive na varredura).
    log.warn(
      { err: error, assetId: asset._id.toString(), objectPath: asset.objectPath },
      'Falha ao remover arquivo do storage; asset preservado'
    );
    return false;
  }

  await Asset.findByIdAndDelete(asset._id);
  return true;
}

/** Remove asset + arquivo, autorizando DM da mesa do asset ou dono do avatar. */
export async function deleteAssetById(userId: string, assetId: string): Promise<{ deleted: boolean }> {
  if (!Types.ObjectId.isValid(assetId)) {
    throw new ServiceError('Asset inválido.', 400);
  }
  const asset = await Asset.findById(assetId);
  if (!asset) {
    throw new ServiceError('Asset não encontrado.', 404);
  }

  if (asset.tableId) {
    const table = await Table.findById(asset.tableId).select('dm');
    if (!table) {
      throw new ServiceError('Mesa do asset não encontrada.', 404);
    }
    if (table.dm.toString() !== userId) {
      throw new ServiceError('Apenas o Mestre pode remover este asset.', 403);
    }
  } else if (asset.ownerId.toString() !== userId) {
    throw new ServiceError('Você não pode remover este asset.', 403);
  }

  // Um asset compartilhado por outra cena/token/avatar não pode ser apagado
  // por engano; a varredura também respeita referências.
  const referenced = await collectReferencedUrls([asset.publicUrl]);
  if (referenced.has(asset.publicUrl)) {
    throw new ServiceError('Este asset ainda está em uso.', 409);
  }

  const deleted = await removeAssetDocument(asset);
  if (!deleted) {
    throw new ServiceError('Não foi possível remover o arquivo do storage.', 502);
  }
  return { deleted: true };
}

/**
 * Remoção interna por URL (troca/exclusão de mapa, token ou avatar).
 * Nunca lança: falha de storage mantém o registro para a varredura.
 */
export async function deleteAssetByUrl(publicUrl: string | undefined | null): Promise<boolean> {
  if (!publicUrl) return false;
  try {
    const asset = await Asset.findOne({ publicUrl });
    if (!asset) return false;
    // A URL pode ser compartilhada por outra cena/token/avatar; só apaga quando
    // não houver mais nenhuma referência.
    const referenced = await collectReferencedUrls([publicUrl]);
    if (referenced.has(publicUrl)) return false;
    return await removeAssetDocument(asset);
  } catch (error) {
    log.warn({ err: error, publicUrl }, 'Falha ao remover asset por URL');
    return false;
  }
}

async function collectReferencedUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const filter = { $in: urls };

  const [sceneUrls, tokenUrls, userUrls, characterUrls, sceneTemplateUrls, tokenTemplateUrls] =
    await Promise.all([
      Scene.distinct('imageUrl', { imageUrl: filter }),
      Token.distinct('imageUrl', { imageUrl: filter }),
      User.distinct('avatarUrl', { avatarUrl: filter }),
      Character.distinct('avatarUrl', { avatarUrl: filter }),
      SceneTemplate.distinct('mapUrl', { mapUrl: filter }),
      TokenTemplate.distinct('imageUrl', { imageUrl: filter }),
    ]);

  return new Set(
    [...sceneUrls, ...tokenUrls, ...userUrls, ...characterUrls, ...sceneTemplateUrls, ...tokenTemplateUrls]
      .filter((url): url is string => typeof url === 'string' && url.length > 0)
  );
}

export type OrphanSweepResult = {
  scanned: number;
  deleted: number;
  kept: number;
};

/**
 * Apaga apenas assets sem referência em Scene/Token/User/Character/Template e
 * mais antigos que o TTL. Asset referenciado nunca é apagado.
 */
export async function sweepOrphanAssets(
  options: { olderThanMs?: number } = {}
): Promise<OrphanSweepResult> {
  const olderThanMs = Math.max(0, Number(options.olderThanMs ?? getAssetOrphanTtlMs()) || 0);
  const cutoff = new Date(Date.now() - olderThanMs);

  const candidates = await Asset.find({ createdAt: { $lte: cutoff } });
  if (candidates.length === 0) {
    return { scanned: 0, deleted: 0, kept: 0 };
  }

  const referenced = await collectReferencedUrls(candidates.map((asset) => asset.publicUrl));
  const result: OrphanSweepResult = { scanned: candidates.length, deleted: 0, kept: 0 };

  for (const asset of candidates) {
    if (referenced.has(asset.publicUrl)) {
      result.kept += 1;
      continue;
    }
    const removed = await removeAssetDocument(asset);
    if (removed) {
      result.deleted += 1;
    } else {
      result.kept += 1;
    }
  }

  if (result.deleted > 0 || result.kept > 0) {
    log.info(result, 'Varredura de assets órfãos concluída');
  }
  return result;
}

/**
 * Agenda a varredura periódica. Nunca roda dentro de createServer, para não
 * afetar testes de integração. Erros são apenas logados.
 */
export function startAssetOrphanSweep(intervalMs = getAssetOrphanSweepIntervalMs()): NodeJS.Timeout | null {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    log.warn({ intervalMs }, 'Varredura de assets órfãos desabilitada');
    return null;
  }

  const timer = setInterval(() => {
    void sweepOrphanAssets().catch((error) => {
      log.warn({ err: error }, 'Falha na varredura de assets órfãos');
    });
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
}
