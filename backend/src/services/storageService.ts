/**
 * Storage service skeleton.
 *
 * Expected env vars (wired in future steps):
 * - SUPABASE_URL: base URL for Supabase instance.
 * - SUPABASE_SERVICE_ROLE_KEY: service-level key, backend only.
 * - SUPABASE_BUCKET: bucket that stores table/token/avatar assets.
 * - ASSET_BASE_URL: public CDN (Cloudflare) or Supabase storage URL exposed to clients.
 * - ASSET_MAX_WIDTH / ASSET_MAX_HEIGHT / ASSET_MAX_BYTES: optional limits enforced before upload.
 *
 * Upcoming work:
 * - Use Supabase Storage SDK with Sharp to resize images and emit signed/public URLs.
 * - Respect ASSET_BASE_URL when building the publicUrl returned to callers.
 */
import sharp from 'sharp';

export type StorageUploadResult = { publicUrl: string };

const notImplemented = () => Promise.reject(new Error('Storage service not implemented yet.'));

export function uploadMapImage(_params: { tableId: string; ownerId: string; buffer: Buffer; mimeType: string }): Promise<StorageUploadResult> {
  // TODO: Resize map textures with Sharp and push to Supabase bucket.
  return notImplemented();
}

export function uploadTokenImage(_params: { tableId: string; ownerId: string; buffer: Buffer; mimeType: string }): Promise<StorageUploadResult> {
  // TODO: Apply per-token optimizations (sprites, thumbnails) before upload.
  return notImplemented();
}

export function uploadAvatarImage(_params: { userId: string; buffer: Buffer; mimeType: string }): Promise<StorageUploadResult> {
  // TODO: Reformat avatars to web-friendly sizes and publish via ASSET_BASE_URL.
  return notImplemented();
}
