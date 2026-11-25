export type TtlCacheOptions = {
  maxEntries: number;
  ttlMs: number;
};

export type TtlCache<T> = {
  readonly size: number;
  get(key: string): T | undefined;
  has(key: string): boolean;
  set(key: string, value: T): void;
  delete(key: string): boolean;
  clear(): void;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

// Map menjaga urutan insert; get() memindahkan entri ke akhir agar kapasitas membuang entri paling lama tak terpakai.
export function createTtlCache<T>(options: TtlCacheOptions): TtlCache<T> {
  const { maxEntries, ttlMs } = options;
  if (!Number.isFinite(maxEntries) || maxEntries < 1) {
    throw new RangeError("maxEntries harus bilangan minimal 1.");
  }
  if (!Number.isFinite(ttlMs) || ttlMs < 1) {
    throw new RangeError("ttlMs harus bilangan minimal 1.");
  }

  const store = new Map<string, CacheEntry<T>>();

  const getLiveEntry = (key: string): CacheEntry<T> | undefined => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    get size() {
      return store.size;
    },
    get(key) {
      const entry = getLiveEntry(key);
      if (!entry) return undefined;
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    has(key) {
      return getLiveEntry(key) !== undefined;
    },
    set(key, value) {
      store.delete(key);
      while (store.size >= maxEntries) {
        const oldestKey = store.keys().next().value;
        if (oldestKey === undefined) break;
        store.delete(oldestKey);
      }
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    delete(key) {
      return store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}
