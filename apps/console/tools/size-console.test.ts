import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initialRouteBytes, LIMIT } from "./size-console.js";

describe("size:console (M0-W3)", () => {
  it("sums the gzip size of the files index.html loads and ignores others", () => {
    const d = mkdtempSync(join(tmpdir(), "dist-"));
    mkdirSync(join(d, "assets"));
    writeFileSync(
      join(d, "index.html"),
      '<script src="/assets/a-1.js"></script><link href="/assets/b-2.css">',
    );
    writeFileSync(join(d, "assets/a-1.js"), "x".repeat(10_000));
    writeFileSync(join(d, "assets/b-2.css"), "y".repeat(10_000));
    writeFileSync(join(d, "assets/lazy-3.js"), "z".repeat(1_000_000));
    const r = initialRouteBytes(d);
    expect(Object.keys(r.files)).toEqual(["/assets/a-1.js", "/assets/b-2.css"]);
    expect(r.total).toBeGreaterThan(0);
    expect(r.total).toBeLessThan(LIMIT);
  });
  it("an incompressible bundle over 300 KB exceeds the limit", () => {
    const d = mkdtempSync(join(tmpdir(), "dist-"));
    mkdirSync(join(d, "assets"));
    writeFileSync(join(d, "index.html"), '<script src="/assets/a-1.js"></script>');
    writeFileSync(join(d, "assets/a-1.js"), randomBytes(320 * 1024));
    expect(initialRouteBytes(d).total).toBeGreaterThan(LIMIT);
  });
});
