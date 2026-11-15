export type SlidingWindowRateLimiterOptions = {
  /** Máximo de eventos permitidos dentro da janela. */
  limit: number;
  /** Tamanho da janela em milissegundos. */
  windowMs: number;
};

export type SlidingWindowRateLimiter = {
  /** Registra uma tentativa e diz se ela pode prosseguir. */
  take(key: string, now?: number): boolean;
  /** Limpa uma chave (ex.: socket desconectado) ou tudo quando omitida. */
  reset(key?: string): void;
  /** Quantidade de chaves atualmente rastreadas (diagnóstico/testes). */
  size(): number;
};

/**
 * Rate limit em memória por chave (socket). Simples, sem dependência e
 * suficiente para uma instância; em múltiplas instâncias o limite é por nó.
 */
export function createSlidingWindowRateLimiter(
  options: SlidingWindowRateLimiterOptions
): SlidingWindowRateLimiter {
  const limit = Math.max(1, Math.trunc(options.limit));
  const windowMs = Math.max(1, Math.trunc(options.windowMs));
  const attempts = new Map<string, number[]>();

  const prune = (key: string, now: number): number[] => {
    const timestamps = attempts.get(key) ?? [];
    while (timestamps.length > 0 && now - timestamps[0] >= windowMs) {
      timestamps.shift();
    }
    if (timestamps.length === 0) {
      attempts.delete(key);
    } else {
      attempts.set(key, timestamps);
    }
    return timestamps;
  };

  return {
    take(key: string, now: number = Date.now()): boolean {
      const timestamps = prune(key, now);
      if (timestamps.length >= limit) {
        return false;
      }
      timestamps.push(now);
      attempts.set(key, timestamps);
      return true;
    },
    reset(key?: string): void {
      if (key === undefined) {
        attempts.clear();
        return;
      }
      attempts.delete(key);
    },
    size(): number {
      return attempts.size;
    },
  };
}
