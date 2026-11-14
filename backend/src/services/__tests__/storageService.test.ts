import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {
  uploadAvatarImage,
  uploadTokenImage,
  storageInfo,
} from '../storageService';

describe('storageService (local driver)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tof-storage-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.LOCAL_UPLOAD_DIR = uploadDir;
    delete process.env.ASSET_BASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_BUCKET;
  });

  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
    delete process.env.STORAGE_DRIVER;
    delete process.env.LOCAL_UPLOAD_DIR;
  });

  async function pngBuffer(): Promise<Buffer> {
    return sharp({
      create: { width: 8, height: 8, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
  }

  it('defaults to the local driver when Supabase is not configured', () => {
    delete process.env.STORAGE_DRIVER;
    expect(storageInfo.driver()).toBe('local');
  });

  it('writes a token image to disk and returns a relative public URL', async () => {
    const result = await uploadTokenImage({
      tableId: 'table-1',
      ownerId: 'user-1',
      buffer: await pngBuffer(),
      mimeType: 'image/png',
    });

    expect(result.publicUrl).toMatch(/^\/uploads\/tables\/table-1\/tokens\/user-1\/.+\.webp$/);
    expect(result.objectPath).toMatch(/^tables\/table-1\/tokens\/user-1\/.+\.webp$/);

    const absolute = path.join(uploadDir, result.objectPath);
    const stat = await fs.stat(absolute);
    expect(stat.size).toBeGreaterThan(0);
    const metadata = await sharp(absolute).metadata();
    expect(metadata.format).toBe('webp');
  });

  it('writes avatars under avatars/<userId>', async () => {
    const result = await uploadAvatarImage({
      userId: 'user-9',
      buffer: await pngBuffer(),
      mimeType: 'image/png',
    });

    expect(result.objectPath).toMatch(/^avatars\/user-9\/.+\.webp$/);
    await expect(fs.stat(path.join(uploadDir, result.objectPath))).resolves.toBeTruthy();
  });

  it('rejects non-image uploads before touching disk', async () => {
    await expect(
      uploadTokenImage({
        tableId: 'table-1',
        ownerId: 'user-1',
        buffer: Buffer.from('not an image'),
        mimeType: 'text/plain',
      })
    ).rejects.toThrow(/imagem/i);
  });
});
