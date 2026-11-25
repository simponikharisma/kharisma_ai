import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";

type StubMarker = "gemini-sukses" | "or-sukses" | "or-retry" | "or-gagal" | "or-timeout";

const MARKERS: StubMarker[] = ["gemini-sukses", "or-sukses", "or-retry", "or-gagal", "or-timeout"];
const TEST_USERNAME = "admin@test.local";
const TEST_PASSWORD = "TestPassword123!";

function kamusPayload(marker: string) {
  return {
    kataAsal: marker,
    bahasaAsal: "Istilah Fiqih",
    terjemahan: `terjemahan-${marker}`,
    padananArab: "",
    tarkibPegon: "",
    contohPenggunaan: "",
    penjelasanMendalam: `penjelasan-${marker}`,
    kategori: "istilah"
  };
}

function sendJson(res: import("node:http").ServerResponse, status: number, payload: unknown) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function createStubServer() {
  const state = {
    gemini: 0,
    openrouter: 0,
    perMarker: new Map<string, number>(),
    openRouterPerMarker: new Map<string, number>()
  };

  const server = createServer(async (req, res) => {
    const rawBody = await readBody(req);
    let payload: unknown;
    try {
      payload = rawBody ? JSON.parse(rawBody) : undefined;
    } catch {
      payload = undefined;
    }
    const serialized = JSON.stringify(payload ?? "");
    const marker = MARKERS.find((candidate) => serialized.includes(candidate)) ?? "tanpa-marker";
    state.perMarker.set(marker, (state.perMarker.get(marker) ?? 0) + 1);

    if (req.url?.includes("generateContent")) {
      state.gemini += 1;
      if (marker === "gemini-sukses") {
        sendJson(res, 200, {
          candidates: [{
            content: { role: "model", parts: [{ text: JSON.stringify(kamusPayload(marker)) }] },
            finishReason: "STOP",
            index: 0
          }],
          usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 16, totalTokenCount: 24 }
        });
        return;
      }
      sendJson(res, 503, { error: { code: 503, message: "stub gemini unavailable", status: "UNAVAILABLE" } });
      return;
    }

    if (req.url === "/chat/completions" && req.method === "POST") {
      state.openrouter += 1;
      const openRouterCount = (state.openRouterPerMarker.get(marker) ?? 0) + 1;
      state.openRouterPerMarker.set(marker, openRouterCount);
      if (marker === "or-gagal") {
        sendJson(res, 503, { error: { message: "stub openrouter unavailable" } });
        return;
      }
      if (marker === "or-retry" && openRouterCount === 1) {
        sendJson(res, 503, { error: { message: "stub openrouter sementara gagal" } });
        return;
      }
      if (marker === "or-timeout") {
        const timer = setTimeout(() => {
          sendJson(res, 200, {
            model: "stub/model",
            choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(kamusPayload(marker)) } }]
          });
        }, 1500);
        res.on("close", () => clearTimeout(timer));
        return;
      }
      sendJson(res, 200, {
        model: "stub/model",
        choices: [{
          finish_reason: "stop",
          message: { role: "assistant", content: JSON.stringify(kamusPayload(marker)) }
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0 }
      });
      return;
    }

    sendJson(res, 404, { error: "stub route not found" });
  });

  return { server, state };
}

function listen(server: HttpServer): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function closeServer(server: HttpServer | null): Promise<void> {
  if (!server) return Promise.resolve();
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

let app: Express;
let httpServer: HttpServer | null = null;
let stubServer: HttpServer | null = null;
let stubState: ReturnType<typeof createStubServer>["state"];
let baseUrl = "";
let authCookie = "";

type ApiOptions = {
  method?: string;
  body?: unknown;
  rawBody?: string;
  cookie?: string | null;
  headers?: Record<string, string>;
};

async function api(path: string, options: ApiOptions = {}) {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined || options.rawBody !== undefined) {
    headers["content-type"] = "application/json";
  }
  const cookie = options.cookie === undefined ? authCookie : options.cookie;
  if (cookie) headers.cookie = cookie;
  const body = options.rawBody !== undefined
    ? options.rawBody
    : options.body !== undefined
      ? JSON.stringify(options.body)
      : undefined;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? (body !== undefined ? "POST" : "GET"),
    headers,
    body
  });
  const text = await response.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { response, json, text };
}

beforeAll(async () => {
  const stub = createStubServer();
  stubServer = stub.server;
  stubState = stub.state;
  const stubPort = await listen(stub.server);

  process.env.NODE_ENV = "test";
  process.env.PORT = "0";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${stubPort}/gemini`;
  process.env.GEMINI_TIMEOUT_MS = "20000";
  process.env.AI_ATTEMPT_TIMEOUT_MS = "400";
  process.env.AI_RETRY_MAX_ATTEMPTS = "2";
  process.env.AI_RETRY_BASE_DELAY_MS = "100";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${stubPort}`;
  process.env.AI_CACHE_TTL_MS = "60000";
  process.env.AI_CACHE_MAX_ENTRIES = "20";
  process.env.ADMIN_USERNAME = TEST_USERNAME;
  process.env.ADMIN_PASSWORD = TEST_PASSWORD;
  process.env.AUTH_SECRET = "phase5-test-auth-secret-0123456789abcdef";

  const imported = await import("../server");
  app = imported.default;
  await new Promise<void>((resolve, reject) => {
    httpServer = app.listen(0, "127.0.0.1", () => resolve());
    httpServer.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${(httpServer!.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await closeServer(httpServer);
  await closeServer(stubServer);
});

describe("auth dan endpoint publik", () => {
  it("menolak endpoint data tanpa sesi", async () => {
    for (const path of ["/api/health", "/api/kitab", "/api/kamus"]) {
      const result = await api(path, { cookie: null });
      expect(result.response.status).toBe(401);
    }
  });

  it("menolak endpoint AI tanpa sesi", async () => {
    const result = await api("/api/kamus/translate", { body: { query: "utawi" }, cookie: null });
    expect(result.response.status).toBe(401);
    expect(result.json.error).toContain("masuk");
  });

  it("melaporkan status sesi tanpa cookie sebagai belum login", async () => {
    const result = await api("/api/auth/session", { cookie: null });
    expect(result.response.status).toBe(200);
    expect(result.json.authenticated).toBe(false);
  });

  it("memvalidasi body login", async () => {
    const result = await api("/api/auth/login", { body: { username: TEST_USERNAME }, cookie: null });
    expect(result.response.status).toBe(400);
  });

  it("menolak kredensial salah", async () => {
    const result = await api("/api/auth/login", {
      body: { username: TEST_USERNAME, password: "KataSandiSalah123!" },
      cookie: null
    });
    expect(result.response.status).toBe(401);
  });

  it("menerbitkan cookie sesi HttpOnly saat login berhasil", async () => {
    const result = await api("/api/auth/login", {
      body: { username: TEST_USERNAME, password: TEST_PASSWORD },
      cookie: null
    });
    expect(result.response.status).toBe(200);
    expect(result.json.authenticated).toBe(true);

    const setCookie = result.response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("kharisma_admin_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Max-Age=28800");
    authCookie = setCookie.split(";")[0];

    const session = await api("/api/auth/session");
    expect(session.json.authenticated).toBe(true);
  });

  it("menyajikan data kesehatan, katalog kitab, dan kamus setelah login", async () => {
    const health = await api("/api/health");
    expect(health.response.status).toBe(200);
    expect(health.json.status).toBe("ok");

    const kitab = await api("/api/kitab");
    expect(kitab.response.status).toBe(200);
    expect(Array.isArray(kitab.json)).toBe(true);

    const kamus = await api("/api/kamus");
    expect(kamus.response.status).toBe(200);
    expect(Object.keys(kamus.json).length).toBeGreaterThan(0);
  });

  it("menolak cookie sesi yang dipalsukan", async () => {
    const [, token] = authCookie.split("=");
    const [payload, signature] = token.split(".");
    const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;

    const session = await api("/api/auth/session", {
      cookie: `kharisma_admin_session=${payload}.${tamperedSignature}`,
      headers: {}
    });
    expect(session.json.authenticated).toBe(false);

    const gated = await api("/api/kamus/translate", {
      body: { query: "utawi" },
      cookie: `kharisma_admin_session=${payload}.${tamperedSignature}`
    });
    expect(gated.response.status).toBe(401);
  });
});

describe("validasi permintaan", () => {
  it("menolak pertanyaan bahtsul masa'il yang terlalu pendek", async () => {
    const result = await api("/api/bahtsul-masail", { body: { query: "ab" } });
    expect(result.response.status).toBe(400);
  });

  it("menolak query kamus kosong dan melebihi 4000 karakter", async () => {
    const empty = await api("/api/kamus/translate", { body: { query: "   " } });
    expect(empty.response.status).toBe(400);

    const tooLong = await api("/api/kamus/translate", { body: { query: "a".repeat(4001) } });
    expect(tooLong.response.status).toBe(400);
  });

  it("menolak parameter chat-kitab yang tidak lengkap atau tidak valid", async () => {
    const missing = await api("/api/chat-kitab", { body: { kitabId: "fathul-muin", messages: [] } });
    expect(missing.response.status).toBe(400);

    const invalidRole = await api("/api/chat-kitab", {
      body: { kitabId: "fathul-muin", messages: [{ role: "admin", content: "halo" }] }
    });
    expect(invalidRole.response.status).toBe(400);

    const tooMany = await api("/api/chat-kitab", {
      body: {
        kitabId: "fathul-muin",
        messages: Array.from({ length: 201 }, () => ({ role: "user", content: "halo" }))
      }
    });
    expect(tooMany.response.status).toBe(400);
  });

  it("menolak teks OCR yang melebihi batas", async () => {
    const result = await api("/api/chat-kitab", {
      body: {
        kitabId: "fathul-muin",
        messages: [{ role: "user", content: "halo" }],
        ocrText: "a".repeat(20_001)
      }
    });
    expect(result.response.status).toBe(400);
  });

  it("memvalidasi teks voice sebelum menyentuh penyedia AI", async () => {
    const empty = await api("/api/voice/speak", { body: { text: "   " } });
    expect(empty.response.status).toBe(400);

    const tooLong = await api("/api/voice/speak", { body: { text: "a".repeat(1001) } });
    expect(tooLong.response.status).toBe(413);
  });

  it("mengembalikan 404 JSON untuk endpoint API tak dikenal", async () => {
    const result = await api("/api/tidak-ada");
    expect(result.response.status).toBe(404);
    expect(result.json.error).toContain("tidak ditemukan");
  });

  it("mengembalikan 400 JSON untuk body yang bukan JSON valid", async () => {
    const result = await api("/api/kamus/translate", { rawBody: "{bukan-json" });
    expect(result.response.status).toBe(400);
    expect(result.json.error).toContain("JSON");
  });
});

describe("retry, timeout, failover, dan cache penyedia AI", () => {
  it("melayani permintaan sukses dari Gemini dan menyimpannya di cache", async () => {
    const geminiBefore = stubState.gemini;
    const openRouterBefore = stubState.openrouter;

    const first = await api("/api/kamus/translate", { body: { query: "kata gemini-sukses" } });
    expect(first.response.status).toBe(200);
    expect(first.json.terjemahan).toBe("terjemahan-gemini-sukses");
    expect(stubState.gemini).toBe(geminiBefore + 1);
    expect(stubState.openrouter).toBe(openRouterBefore);

    const cached = await api("/api/kamus/translate", { body: { query: "kata gemini-sukses" } });
    expect(cached.response.status).toBe(200);
    expect(cached.json.terjemahan).toBe("terjemahan-gemini-sukses");
    expect(stubState.gemini).toBe(geminiBefore + 1);
    expect(stubState.openrouter).toBe(openRouterBefore);
  });

  it("beralih ke OpenRouter saat Gemini gagal", async () => {
    const geminiBefore = stubState.gemini;
    const openRouterBefore = stubState.openrouter;

    const result = await api("/api/kamus/translate", { body: { query: "kata or-sukses" } });
    expect(result.response.status).toBe(200);
    expect(result.json.terjemahan).toBe("terjemahan-or-sukses");
    expect(stubState.gemini).toBe(geminiBefore + 2);
    expect(stubState.openrouter).toBe(openRouterBefore + 1);
  });

  it("mengulang percobaan OpenRouter setelah kegagalan sementara", async () => {
    const openRouterBefore = stubState.openrouter;
    const result = await api("/api/kamus/translate", { body: { query: "kata or-retry" } });
    expect(result.response.status).toBe(200);
    expect(result.json.terjemahan).toBe("terjemahan-or-retry");
    expect(stubState.openrouter).toBe(openRouterBefore + 2);
  });

  it("mengembalikan 502 setelah seluruh percobaan gagal", async () => {
    const result = await api("/api/kamus/translate", { body: { query: "kata or-gagal" } });
    expect(result.response.status).toBe(502);
    expect(result.json.error).toContain("tidak dapat dihubungi");
  });

  it("mengembalikan 504 ketika penyedia melewati batas waktu", async () => {
    const openRouterBefore = stubState.openrouter;
    const startedAt = Date.now();
    const result = await api("/api/kamus/translate", { body: { query: "kata or-timeout" } });
    const elapsedMs = Date.now() - startedAt;

    expect(result.response.status).toBe(504);
    expect(result.json.error).toContain("batas waktu");
    expect(stubState.openrouter).toBe(openRouterBefore + 2);
    expect(elapsedMs).toBeLessThan(5000);
  });
});

describe("request id dan rate limit", () => {
  it("mempertahankan x-request-id yang valid dan mengganti yang tidak valid", async () => {
    const valid = await api("/api/health", { headers: { "x-request-id": "uji-phase5-123456" } });
    expect(valid.response.headers.get("x-request-id")).toBe("uji-phase5-123456");

    const invalid = await api("/api/health", { headers: { "x-request-id": "id dengan spasi" } });
    const replaced = invalid.response.headers.get("x-request-id") ?? "";
    expect(replaced).not.toBe("id dengan spasi");
    expect(replaced).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("membatasi percobaan login yang gagal dengan 429 dan Retry-After", async () => {
    let limitedResponse: Response | null = null;
    for (let attempt = 0; attempt < 12 && !limitedResponse; attempt += 1) {
      const result = await api("/api/auth/login", {
        body: { username: TEST_USERNAME, password: `Salah-${attempt}-123456789` },
        cookie: null
      });
      if (result.response.status === 429) limitedResponse = result.response;
    }

    expect(limitedResponse).not.toBeNull();
    expect(limitedResponse!.headers.get("retry-after")).toBe("900");
  });
});
