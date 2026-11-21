// Enforces the clean-architecture dependency rule and the browser-API rules by scanning sources.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = `${import.meta.dirname}/`;

const FORBIDDEN: Record<string, RegExp[]> = {
  domain: [
    /\/application\//,
    /\/infrastructure\//,
    /\/presentation\//,
    /\/main\//,
    /^@afs\/sdk/,
    /^react/,
  ],
  application: [/\/infrastructure\//, /\/presentation\//, /\/main\//, /^@afs\/sdk/, /^react/],
  infrastructure: [/\/presentation\//, /\/main\//],
  presentation: [/\/infrastructure\//, /\/main\//, /^@afs\/sdk/, /^oauth4webapi/],
};

const BROWSER_GLOBALS = /\b(window|document|fetch|localStorage|sessionStorage|indexedDB)\b/;
const STORAGE_APIS = /\b(localStorage|sessionStorage|indexedDB)\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function importsOf(src: string): string[] {
  return [...src.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1] ?? "");
}

export function importViolations(layer: string, file: string, src: string): string[] {
  const rules = FORBIDDEN[layer] ?? [];
  const out: string[] = [];
  for (const spec of importsOf(src)) {
    const resolved = spec.startsWith(".") ? `/${relative(SRC, join(file, "..", spec))}` : spec;
    if (rules.some((r) => r.test(resolved))) out.push(`${relative(SRC, file)} -> ${spec}`);
  }
  return out;
}

export function browserApiViolations(layer: string, file: string, src: string): string[] {
  const rel = relative(SRC, file);
  const code = stripComments(src);
  const out: string[] = [];
  if ((layer === "domain" || layer === "application") && BROWSER_GLOBALS.test(code))
    out.push(`${rel}: references a browser global`);
  if (!rel.startsWith("infrastructure/storage/") && STORAGE_APIS.test(code))
    out.push(`${rel}: touches web storage outside infrastructure/storage/`);
  return out;
}

const isTest = (f: string) => /\.test\.tsx?$/.test(f) || f.endsWith("architecture.test.ts");

describe("dependency rule", () => {
  for (const layer of Object.keys(FORBIDDEN)) {
    it(`${layer}/ does not import outer layers`, () => {
      const violations = files(join(SRC, layer))
        .filter((f) => !isTest(f))
        .flatMap((f) => importViolations(layer, f, readFileSync(f, "utf8")));
      expect(violations).toEqual([]);
    });
  }
});

describe("browser API rules", () => {
  for (const layer of ["domain", "application", "infrastructure", "presentation", "main"]) {
    it(`${layer}/ respects the browser API rules`, () => {
      const violations = files(join(SRC, layer))
        .filter((f) => !isTest(f))
        .flatMap((f) => browserApiViolations(layer, f, readFileSync(f, "utf8")));
      expect(violations).toEqual([]);
    });
  }
});

describe("the rules themselves (red cases)", () => {
  const f = (p: string) => join(SRC, p);
  it("presentation importing oauth4webapi is a violation", () => {
    expect(
      importViolations(
        "presentation",
        f("presentation/x.ts"),
        'import * as o from "oauth4webapi";',
      ),
    ).toHaveLength(1);
  });
  it("domain referencing window or fetch is a violation", () => {
    expect(
      browserApiViolations("domain", f("domain/x.ts"), "const a = window.location;"),
    ).toHaveLength(1);
    expect(
      browserApiViolations("application", f("application/x.ts"), "await fetch(u);"),
    ).toHaveLength(1);
  });
  it("storage outside infrastructure/storage is a violation", () => {
    expect(
      browserApiViolations("presentation", f("presentation/x.ts"), "localStorage.getItem('a')"),
    ).toHaveLength(1);
    expect(
      browserApiViolations("infrastructure", f("infrastructure/auth/x.ts"), "sessionStorage.x"),
    ).toHaveLength(1);
  });
  it("infrastructure/storage may use storage; comments do not count", () => {
    expect(
      browserApiViolations("infrastructure", f("infrastructure/storage/x.ts"), "localStorage.x"),
    ).toEqual([]);
    expect(
      browserApiViolations("domain", f("domain/x.ts"), "// never window\n/* fetch */"),
    ).toEqual([]);
  });
  it("existing outward imports remain violations", () => {
    expect(importViolations("domain", f("domain/x.ts"), 'import "react";')).toHaveLength(1);
    expect(
      importViolations("application", f("application/x.ts"), 'import "../infrastructure/a.js";'),
    ).toHaveLength(1);
  });
});
