import { vi } from 'vitest';

declare global {
  interface Window {
    matchMedia(query: string): MediaQueryList;
  }
}

if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverMock;
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  });
}

if (typeof window !== 'undefined' && !window.scrollTo) {
  window.scrollTo = () => {};
}

if (typeof HTMLMediaElement !== 'undefined' && !HTMLMediaElement.prototype.play) {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
}

if (typeof window !== 'undefined') {
  const storage = (() => {
    const store = new Map<string, string>();
    return {
      getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
      setItem: vi.fn((key: string, value: string) => { store.set(key, String(value)); }),
      removeItem: vi.fn((key: string) => { store.delete(key); }),
      clear: vi.fn(() => { store.clear(); }),
      key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
      get length() { return store.size; },
    } as Storage;
  })();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
}
