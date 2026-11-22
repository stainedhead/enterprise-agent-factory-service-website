import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundle, CORE_LIMIT, MODULE_LIMIT, measure } from "../tools/size-check.js";
import { undocumentedExports } from "../tools/tsdoc-check.js";

const SRC = new URL("../src/", import.meta.url).pathname;

describe("tree-shaking (M0-P1)", () => {
  it("a build importing only AfsClient and teams contains no other module", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shake-"));
    const entry = join(dir, "entry.ts");
    writeFileSync(
      entry,
      `import { AfsClient } from ${JSON.stringify(`${SRC}core/client.ts`)};
import { teams } from ${JSON.stringify(`${SRC}generated/resources/teams.ts`)};
console.log(teams(new AfsClient({ endpoint: "x" })));`,
    );
    const code = await bundle(entry, { minify: false });
    expect(code).toContain("function teams(");
    for (const other of [
      "adminCostTagStatus",
      "adminPriceProposals",
      "workOrders",
      "logDestinations",
      "swarmTemplates",
    ]) {
      expect(code, other).not.toContain(`function ${other}(`);
    }
  }, 30_000);
});

describe("size budgets (M0-P2)", () => {
  it("core stays within 25 KB gzip and every module within 3 KB", async () => {
    const { core, modules } = await measure();
    expect(core).toBeLessThanOrEqual(CORE_LIMIT);
    expect(Object.keys(modules)).toHaveLength(41);
    for (const [name, size] of Object.entries(modules))
      expect(size, name).toBeLessThanOrEqual(MODULE_LIMIT);
  }, 60_000);
});

describe("tsdoc check (M0-P3)", () => {
  function dist(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "dts-"));
    for (const [n, t] of Object.entries(files)) {
      mkdirSync(join(dir, n, ".."), { recursive: true });
      writeFileSync(join(dir, n), t);
    }
    return dir;
  }
  it("passes when every reachable export is documented", () => {
    const d = dist({
      "index.d.ts": 'export { a } from "./a.js";\n',
      "a.d.ts":
        "/** doc */\nexport declare function a(): void;\nexport declare function hidden(): void;\n",
    });
    expect(undocumentedExports(d)).toEqual([]);
  });
  it("fails on an export without a TSDoc block, through re-exports", () => {
    const d = dist({
      "index.d.ts": 'export * from "./a.js";\n/** ok */\nexport declare const z: number;\n',
      "a.d.ts": "export interface Bare {}\n/** doc */\nexport type Ok = string;\n",
    });
    expect(undocumentedExports(d)).toEqual(["a.d.ts: Bare"]);
  });
});

describe("package metadata (M0-P1)", () => {
  it("is ESM-only with sideEffects false and an exports map", async () => {
    const pkg = (await import("../package.json", { with: { type: "json" } })).default as Record<
      string,
      unknown
    >;
    expect(pkg.type).toBe("module");
    expect(pkg.sideEffects).toBe(false);
    expect(Object.keys(pkg.exports as object)).toContain(".");
    expect(pkg.main).toBeDefined();
  });
});
