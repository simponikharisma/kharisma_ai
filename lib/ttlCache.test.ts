import { afterEach, describe, expect, it, vi } from "vitest";
import { createTtlCache } from "./ttlCache";

afterEach(() => {
  vi.useRealTimers();
});

describe("createTtlCache", () => {
  it("menyimpan, membaca, dan menghapus nilai", () => {
    const cache = createTtlCache<number>({ maxEntries: 2, ttlMs: 1000 });
    cache.set("a", 1);
    expect(cache.has("a")).toBe(true);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.delete("a")).toBe(true);
    expect(cache.has("a")).toBe(false);
    expect(cache.size).toBe(0);
  });

  it("mengabaikan entri yang sudah kedaluwarsa", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const cache = createTtlCache<string>({ maxEntries: 2, ttlMs: 1000 });
    cache.set("a", "nilai");
    vi.setSystemTime(999);
    expect(cache.get("a")).toBe("nilai");
    vi.setSystemTime(1000);
    expect(cache.has("a")).toBe(false);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("membuang entri paling lama saat kapasitas penuh", () => {
    const cache = createTtlCache<number>({ maxEntries: 2, ttlMs: 60_000 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.has("a")).toBe(false);
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("memperbarui urutan pemakaian agar entri jarang dipakai yang dibuang", () => {
    const cache = createTtlCache<number>({ maxEntries: 2, ttlMs: 60_000 });
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.has("b")).toBe(false);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });

  it("menimpa nilai tanpa menggeser entri lain saat kapasitas penuh", () => {
    const cache = createTtlCache<string>({ maxEntries: 2, ttlMs: 60_000 });
    cache.set("a", "lama");
    cache.set("b", "tetap");
    cache.set("a", "baru");
    expect(cache.get("a")).toBe("baru");
    expect(cache.get("b")).toBe("tetap");
    expect(cache.size).toBe(2);
  });

  it("menolak opsi kapasitas atau TTL yang tidak valid", () => {
    expect(() => createTtlCache({ maxEntries: 0, ttlMs: 1000 })).toThrow(RangeError);
    expect(() => createTtlCache({ maxEntries: 1, ttlMs: 0 })).toThrow(RangeError);
    expect(() => createTtlCache({ maxEntries: Number.NaN, ttlMs: 1000 })).toThrow(RangeError);
  });
});
