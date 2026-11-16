import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 4173);
const channel = process.env.E2E_CHANNEL as 'chrome' | 'msedge' | undefined;

/**
 * Fase 5 (chamada online) — mídia falsa e determinística.
 *
 * `--use-fake-device-for-media-stream` cria microfone/câmera sintéticos;
 * `--use-fake-ui-for-media-stream` aceita o prompt de permissão;
 * `--autoplay-policy=no-user-gesture-required` libera `<audio autoplay>` sem
 * gesto (o participante remoto nunca clicou no tile);
 * `--auto-select-desktop-capture-source` + `--enable-usermedia-screen-capturing`
 * permitem exercitar `getDisplayMedia` no headless (needs `--allow-http-screen-capture`
 * porque a suíte roda em `http://127.0.0.1`).
 */
const fakeMediaArgs = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--auto-select-desktop-capture-source=Entire screen',
  '--enable-usermedia-screen-capturing',
  '--allow-http-screen-capture',
  // Em loopback o ICE precisa do candidato host; o mDNS do Chrome esconde o IP
  // e já quebrou malhas WebRTC em CI.
  '--disable-features=WebRtcHideLocalIpsWithMdns',
];

export default defineConfig({
  testDir: path.resolve(__dirname, 'specs'),
  timeout: 180_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${frontendPort}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['microphone', 'camera'],
    launchOptions: {
      args: fakeMediaArgs,
    },
  },
  globalSetup: path.resolve(__dirname, 'global-setup.ts'),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) },
    },
  ],
});
