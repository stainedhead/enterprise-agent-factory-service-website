// Guards the coverage exclusion in vitest.config.ts: only type-only files under application/ports/ may be
// excluded, so a runtime export added to a port file cannot silently escape the 90% threshold (FR-017).
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PORTS = import.meta.dirname;
const CONFIG = `${PORTS}/../../../vitest.config.ts`;

const RUNTIME_EXPORT =
  /^export\s+(?:default\b|(?:async\s+)?(?:const|let|var|function\*?|class|enum|abstract\s+class)\b|declare\s+(?:const|function|class|enum)\b)/m;

/** True when the source has an export that exists at runtime (not an interface, type or `export type {}`). */
export function hasRuntimeExport(src: string): boolean {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  return RUNTIME_EXPORT.test(code) || /^export\s*\{(?!\s*type\b)[^}]*\}/m.test(code);
}

function excludedPorts(): string[] {
  const cfg = readFileSync(CONFIG, "utf8");
  const exclude = /exclude:\s*\[([\s\S]*?)\]/.exec(cfg)?.[1] ?? "";
  return [...exclude.matchAll(/"([^"]+)"/g)]
    .map((m) => m[1] ?? "")
    .filter((p) => p.includes("application/ports"));
}

const portFiles = readdirSync(PORTS).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

describe("coverage exclusion of application/ports", () => {
  it("detects runtime exports and ignores type-only ones", () => {
    expect(hasRuntimeExport("export const a = 1;")).toBe(true);
    expect(hasRuntimeExport("export function f() {}")).toBe(true);
    expect(hasRuntimeExport("export class C {}")).toBe(true);
    expect(hasRuntimeExport("export enum E { A }")).toBe(true);
    expect(hasRuntimeExport("export { a };")).toBe(true);
    expect(hasRuntimeExport("export default x;")).toBe(true);
    expect(hasRuntimeExport("export interface I {}\nexport type T = string;")).toBe(false);
    expect(hasRuntimeExport("export type { A } from './a.js';")).toBe(false);
    expect(hasRuntimeExport("// export const a = 1;")).toBe(false);
  });

  it("does not use a blanket glob over application/ports", () => {
    expect(excludedPorts().filter((p) => p.includes("*"))).toEqual([]);
  });

  it("excludes only files that exist and have no runtime export", () => {
    const excluded = excludedPorts();
    expect(excluded.length).toBeGreaterThan(0);
    for (const entry of excluded) {
      const name = entry.slice(entry.lastIndexOf("/") + 1);
      expect(portFiles, `${entry} does not exist`).toContain(name);
      expect(hasRuntimeExport(readFileSync(`${PORTS}/${name}`, "utf8")), entry).toBe(false);
    }
  });

  it("covers every port file that has a runtime export", () => {
    const excluded = new Set(excludedPorts().map((p) => p.slice(p.lastIndexOf("/") + 1)));
    for (const f of portFiles)
      if (hasRuntimeExport(readFileSync(`${PORTS}/${f}`, "utf8")))
        expect(excluded.has(f), `${f} has runtime exports but is excluded`).toBe(false);
  });
});
