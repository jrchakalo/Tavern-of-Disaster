import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const channel = process.env.E2E_CHANNEL as 'chrome' | undefined;
export default defineConfig({
  testDir: path.resolve(dir, 'specs'),
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://tavernofdisaster.vercel.app',
    permissions: ['microphone', 'camera'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        '--auto-select-desktop-capture-source=Entire screen',
        '--enable-usermedia-screen-capturing',
      ],
    },
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) } }],
});
