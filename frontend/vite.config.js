import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
const ensureLocalStorage = () => {
    const globalWithStorage = globalThis;
    if (typeof globalWithStorage.localStorage !== 'undefined')
        return;
    const store = new Map();
    const memoryStorage = {
        get length() {
            return store.size;
        },
        clear() {
            store.clear();
        },
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        key(index) {
            return Array.from(store.keys())[index] ?? null;
        },
        removeItem(key) {
            store.delete(key);
        },
        setItem(key, value) {
            store.set(key, value);
        },
    };
    globalWithStorage.localStorage = memoryStorage;
};
// https://vite.dev/config/
export default defineConfig(async () => {
    ensureLocalStorage();
    const plugins = [vue()];
    const enableDevTools = process.env.VITE_ENABLE_DEVTOOLS === 'true';
    if (enableDevTools) {
        try {
            const { default: vueDevTools } = await import('vite-plugin-vue-devtools');
            plugins.push(vueDevTools());
        }
        catch (error) {
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
