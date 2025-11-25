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
  };
});
