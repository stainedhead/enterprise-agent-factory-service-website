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

// A hyphen is not an identifier character: a kebab-case flag such as "context-window" (generated CLI
// table) is data, not a reference to the global.
// A quoted name (`"window"`, the MCP report's query parameter in the generated CLI table) is data, not a reference.
const BROWSER_GLOBALS =
  /(?<![\w"'-])(window|document|fetch|localStorage|sessionStorage|indexedDB)(?![\w"'-])/;
// XSS and CSP sinks (ASVS V5, M6-Q6): nothing may build markup or code from strings.
const XSS_SINKS =
  /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|\beval\(|new Function\(/;
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
  // Static `from "x"` (import and re-export, multi-line included), bare `import "x"` and `import("x")`.
  return [...stripComments(src).matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)].map(
    (m) => m[1] ?? "",
  );
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
  if (XSS_SINKS.test(code)) out.push(`${rel}: uses an HTML or code injection sink`);
  if (!rel.startsWith("infrastructure/storage/") && STORAGE_APIS.test(code))
    out.push(`${rel}: touches web storage outside infrastructure/storage/`);
  return out;
}

const isTest = (f: string) => /\.test\.tsx?$/.test(f) || f.endsWith("architecture.test.ts");
// This file holds violating snippets as strings, so it is the one file the dependency scan skips.
const isSelf = (f: string) => f.endsWith("architecture.test.ts");

// Test files are scanned too (FR-016). An entry is "<file relative to src/> -> <import specifier>" and
// needs a reason. Do not add entries to hide a new violation; fix the import.
export const TEST_ALLOW_LIST: Record<string, string> = {
  "application/usecases/adminApiKeys/AdminApiKeysUseCases.test.ts -> ../../../presentation/testing/adminApiKeys.js":
    "application use-case tests reuse the in-memory fake ports in presentation/testing/ (pure fakes, no React); moving them to application/testing/ is a refactor outside this spec (RF-E2)",
  "application/usecases/adminCatalogs/AdminCatalogsUseCases.test.ts -> ../../../presentation/testing/adminCatalogs.js":
    "application use-case tests reuse the in-memory fake ports in presentation/testing/ (pure fakes, no React); moving them to application/testing/ is a refactor outside this spec (RF-E2)",
  "application/usecases/adminCatalogs/AdminCatalogsUseCases.test.ts -> ../../../presentation/testing/agents.js":
    "application use-case tests reuse the in-memory fake ports in presentation/testing/ (pure fakes, no React); moving them to application/testing/ is a refactor outside this spec (RF-E2)",
  "application/usecases/adminSecurityOperators/AdminSecurityOperatorsUseCases.test.ts -> ../../../presentation/testing/adminApiKeys.js":
    "application use-case tests reuse the in-memory fake ports in presentation/testing/ (pure fakes, no React); moving them to application/testing/ is a refactor outside this spec (RF-E2)",
  "application/usecases/agents/AgentsUseCases.test.ts -> ../../../presentation/testing/agents.js":
    "application use-case tests reuse the in-memory fake ports in presentation/testing/ (pure fakes, no React); moving them to application/testing/ is a refactor outside this spec (RF-E2)",
  "application/usecases/agents/AgentsUseCases.test.ts -> ../../../presentation/testing/teams.js":
    "application use-case tests reuse the in-memory fake ports in presentation/testing/ (pure fakes, no React); moving them to application/testing/ is a refactor outside this spec (RF-E2)",
  "application/usecases/agents-create/CreateAgentUseCases.test.ts -> ../../../presentation/testing/agents.js":
    "application use-case tests reuse the in-memory fake ports in presentation/testing/ (pure fakes, no React); moving them to application/testing/ is a refactor outside this spec (RF-E2)",
  "application/usecases/agents-create/CreateAgentUseCases.test.ts -> ../../../presentation/testing/secrets.js":
    "application use-case tests reuse the in-memory fake ports in presentation/testing/ (pure fakes, no React); moving them to application/testing/ is a refactor outside this spec (RF-E2)",
  "application/usecases/externalSystems/AdminExternalSystemsUseCases.test.ts -> ../../../presentation/testing/externalSystems.js":
    "application use-case tests reuse the in-memory fake ports in presentation/testing/ (pure fakes, no React); moving them to application/testing/ is a refactor outside this spec (RF-E2)",
  "application/usecases/externalSystems/ExternalSystemsUseCases.test.ts -> ../../../presentation/testing/externalSystems.js":
    "application use-case tests reuse the in-memory fake ports in presentation/testing/ (pure fakes, no React); moving them to application/testing/ is a refactor outside this spec (RF-E2)",
  "application/usecases/identity/IdentityUseCases.test.ts -> ../../../presentation/testing/identity.js":
    "application use-case tests reuse the in-memory fake ports in presentation/testing/ (pure fakes, no React); moving them to application/testing/ is a refactor outside this spec (RF-E2)",
  "application/usecases/pools/PoolsUseCases.test.ts -> ../../../presentation/testing/agents.js":
    "application use-case tests reuse the in-memory fake ports in presentation/testing/ (pure fakes, no React); moving them to application/testing/ is a refactor outside this spec (RF-E2)",
  "application/usecases/pools/PoolsUseCases.test.ts -> ../../../presentation/testing/pools.js":
    "application use-case tests reuse the in-memory fake ports in presentation/testing/ (pure fakes, no React); moving them to application/testing/ is a refactor outside this spec (RF-E2)",
};

describe("dependency rule", () => {
  for (const layer of Object.keys(FORBIDDEN)) {
    it(`${layer}/ does not import outer layers`, () => {
      const violations = files(join(SRC, layer))
        .filter((f) => !isSelf(f))
        .flatMap((f) => importViolations(layer, f, readFileSync(f, "utf8")))
        .filter((v) => !(v in TEST_ALLOW_LIST));
      expect(violations).toEqual([]);
    });
  }
});

describe("test-file allow-list", () => {
  it("has a reason per entry and no stale entries", () => {
    const live = new Set(
      Object.keys(FORBIDDEN).flatMap((layer) =>
        files(join(SRC, layer))
          .filter((f) => !isSelf(f))
          .flatMap((f) => importViolations(layer, f, readFileSync(f, "utf8"))),
      ),
    );
    for (const [entry, reason] of Object.entries(TEST_ALLOW_LIST)) {
      expect(reason.length, entry).toBeGreaterThan(10);
      expect(live.has(entry), `stale allow-list entry: ${entry}`).toBe(true);
    }
  });
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
  it("a kebab-case string containing a global's name is not a violation, a reference is", () => {
    expect(
      browserApiViolations("domain", "/x/src/domain/a.ts", 'const f = "context-window";'),
    ).toEqual([]);
    expect(
      browserApiViolations("domain", "/x/src/domain/a.ts", "const w = window.innerWidth;"),
    ).toHaveLength(1);
    expect(browserApiViolations("domain", "/x/src/domain/a.ts", "fetch(url)")).toHaveLength(1);
    expect(
      browserApiViolations("domain", "/x/src/domain/a.ts", '{"name":"window","flag":"window"}'),
    ).toEqual([]);
    expect(
      browserApiViolations("domain", "/x/src/domain/a.ts", 'const x = { a: "1", w: window };'),
    ).toHaveLength(1);
  });
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
  it("an HTML or code injection sink is a violation in every layer", () => {
    for (const code of [
      "<div dangerouslySetInnerHTML={{ __html: x }} />",
      "el.innerHTML = x;",
      "eval(x)",
      "new Function('a', x)",
    ])
      expect(browserApiViolations("presentation", f("presentation/x.tsx"), code)).toHaveLength(1);
    expect(
      browserApiViolations("presentation", f("presentation/x.tsx"), "el.textContent = x;"),
    ).toEqual([]);
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
  it("dynamic imports and re-exports from outer layers are violations", () => {
    for (const code of [
      'const m = await import("@afs/sdk");',
      'const m = import("../infrastructure/a.js");',
      'export { x } from "../infrastructure/a.js";',
      'export * from "@afs/sdk";',
      'export type { T } from "@afs/sdk";',
      'import {\n  a,\n  b,\n} from "@afs/sdk";',
    ])
      expect(importViolations("presentation", f("presentation/x.ts"), code)).toHaveLength(1);
  });
  it("existing outward imports remain violations", () => {
    expect(importViolations("domain", f("domain/x.ts"), 'import "react";')).toHaveLength(1);
    expect(
      importViolations("application", f("application/x.ts"), 'import "../infrastructure/a.js";'),
    ).toHaveLength(1);
  });
});
