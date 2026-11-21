import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const read = (p: string) =>
  JSON.parse(readFileSync(join(ROOT, p), "utf8")) as Record<string, unknown>;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("build output (M0-W2, FR-036, FR-037)", () => {
  let out = "";
  let html = "";
  let files: string[] = [];
  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), "console-build-"));
    await build({ root: ROOT, logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
    html = readFileSync(join(out, "index.html"), "utf8");
    files = walk(out).map((f) => f.slice(out.length + 1));
  }, 60_000);

  it("index.html has no inline script and no style element", () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attrs, body] of scripts) {
      expect(attrs).toMatch(/\bsrc=/);
      expect((body ?? "").trim()).toBe("");
    }
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });
  it("every asset name is hashed", () => {
    const assets = files.filter((f) => f.startsWith("assets/"));
    expect(assets.length).toBeGreaterThan(0);
    for (const a of assets) expect(a, a).toMatch(/-[A-Za-z0-9_-]{6,}\.(js|css|woff2?|png|svg)$/);
  });
  it("index.html references only hashed local assets", () => {
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1] as string);
    for (const r of refs) {
      expect(r, r).not.toMatch(/^https?:/);
      expect(r, r).toMatch(/^\/assets\/.+-[A-Za-z0-9_-]{6,}\.(js|css)$/);
    }
  });
  it("the bundle injects no style element at runtime", () => {
    const js = files
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(out, f), "utf8"))
      .join("\n");
    expect(js).not.toMatch(/createElement\(["']style["']\)/);
    expect(js).not.toContain("__AFS_E2E__");
  });
});

describe("deploy artefacts (M0-W2)", () => {
  it("the CSP has the directives of FR-037 and the WD-30 frame-src", () => {
    const csp = (read("deploy/response-headers-policy.json").headers as Record<string, string>)[
      "Content-Security-Policy"
    ] as string;
    for (const d of [
      "default-src 'self'",
      "script-src 'self'",
      "connect-src 'self' <apiUrl> <issuers> <telemetryUrl>",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "frame-src <issuers>",
    ]) {
      expect(csp).toContain(d);
    }
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });
  it("sets HSTS, no-referrer and nosniff", () => {
    const h = read("deploy/response-headers-policy.json").headers as Record<string, string>;
    expect(h["Strict-Transport-Security"]).toContain("max-age=");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });
  it("caches hashed assets for a year and keeps index.html and config.json no-cache, with SPA fallback", () => {
    const c = read("deploy/cache-behaviors.json") as {
      behaviors: { pathPattern: string; cacheControl: string }[];
      spaFallback: { responsePagePath: string; responseCode: number };
    };
    const by = (p: string) => c.behaviors.find((b) => b.pathPattern === p)?.cacheControl;
    expect(by("/assets/*")).toBe("public, max-age=31536000, immutable");
    expect(by("/index.html")).toBe("no-cache");
    expect(by("/config.json")).toBe("no-cache");
    expect(c.spaFallback).toMatchObject({ responsePagePath: "/index.html", responseCode: 200 });
  });
  it("the local config.json satisfies the schema's required keys", () => {
    const schema = read("deploy/config.schema.json") as { required: string[] };
    const cfg = read("public/config.json");
    for (const k of schema.required) expect(cfg[k], k).toBeDefined();
  });
});
