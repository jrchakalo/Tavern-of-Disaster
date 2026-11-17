import { fileURLToPath, URL } from 'node:url';

import { defineConfig, type PluginOption } from 'vite';
import vue from '@vitejs/plugin-vue';

interface StorageLike {
  readonly length: number;
  clear(): void;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

type GlobalWithStorage = typeof globalThis & { localStorage?: StorageLike };

const ensureLocalStorage = () => {
  const globalWithStorage = globalThis as GlobalWithStorage;
  if (typeof globalWithStorage.localStorage !== 'undefined') return;
  const store = new Map<string, string>();
  const memoryStorage: StorageLike = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
  globalWithStorage.localStorage = memoryStorage;
};

// https://vite.dev/config/
export default defineConfig(async () => {
  ensureLocalStorage();
  const plugins: PluginOption[] = [vue()];
  const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3001';
  const enableDevTools = process.env.VITE_ENABLE_DEVTOOLS === 'true';
  if (enableDevTools) {
    try {
      const { default: vueDevTools } = await import('vite-plugin-vue-devtools');
      plugins.push(vueDevTools());
    } catch (error) {
      console.warn('vite-plugin-vue-devtools unavailable:', error);
    }
  }
  return {
    plugins,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 5173,
      // Proxy para o backend local: o frontend usa a própria origem e pode ser
      // aberto pelo notebook, pela TV e por celulares na mesma rede.
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/socket.io': { target: proxyTarget, ws: true },
        '/uploads': { target: proxyTarget, changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setupTests.ts',
      css: false,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/vue/') || id.includes('/@vue/') || id.includes('vue-router')) {
              return 'vendor-vue';
            }
            if (id.includes('pinia')) return 'vendor-pinia';
            if (
              id.includes('socket.io-client') ||
              id.includes('socket.io-parser') ||
              id.includes('engine.io-client') ||
              id.includes('engine.io-parser') ||
              id.includes('@socket.io/component-emitter')
            ) {
              return 'vendor-socket';
            }
            if (id.includes('vuedraggable') || id.includes('sortablejs')) return 'vendor-draggable';
            if (id.includes('qrcode')) return 'vendor-qrcode';
            return 'vendor';
          },
        },
      },
    },
  };
});
