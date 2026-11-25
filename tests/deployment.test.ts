import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function listTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) return listTypeScriptFiles(fullPath);
    return entry.endsWith(".ts") ? [fullPath] : [];
  });
}

function relativeImports(source: string): string[] {
  return [...source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)].map((match) => match[1]);
}

describe("kompatibilitas deployment Vercel", () => {
  it("memakai ekstensi eksplisit pada semua import relatif yang dijalankan Vercel", () => {
    const entryFiles = [
      path.join(projectRoot, "server.ts"),
      ...listTypeScriptFiles(path.join(projectRoot, "api"))
    ];
    const offenders = entryFiles.flatMap((file) => relativeImports(readFileSync(file, "utf8"))
      .filter((specifier) => !/\.(ts|js)$/.test(specifier))
      .map((specifier) => `${path.relative(projectRoot, file)} -> ${specifier}`));

    expect(offenders).toEqual([]);
  });

  it("menyertakan server.ts dan folder lib pada setiap Vercel function", () => {
    const config = JSON.parse(readFileSync(path.join(projectRoot, "vercel.json"), "utf8"));
    for (const [route, fn] of Object.entries(config.functions ?? {}) as [string, { includeFiles?: string[] }][]) {
      expect(fn.includeFiles, route).toEqual(expect.arrayContaining(["server.ts", "lib/**"]));
    }
  });
});
