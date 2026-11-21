import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTRACT_DIR, checkContract, sha256, updateContract } from "./contract-sync.js";

function copy(): string {
  const dir = mkdtempSync(join(tmpdir(), "contract-"));
  cpSync(CONTRACT_DIR, dir, { recursive: true });
  return dir;
}

describe("contract:check", () => {
  it("passes on the committed snapshot", () => {
    expect(checkContract()).toEqual([]);
  });
  it("fails when one byte changes", () => {
    const dir = copy();
    const p = join(dir, "openapi.yaml");
    writeFileSync(p, `${readFileSync(p, "utf8")} `);
    const problems = checkContract(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("openapi.yaml");
  });
});

describe("contract:update", () => {
  it("fetches the three files at the ref and rewrites the lock", async () => {
    const dir = copy();
    const urls: string[] = [];
    const lock = await updateContract({
      ref: "v1.2.0",
      dir,
      now: () => new Date("2026-01-02T03:04:05Z"),
      fetch: async (url) => {
        urls.push(url);
        const body = url.endsWith("openapi.yaml")
          ? "info:\n  version: 1.2.0\npaths:\n"
          : `{"u":"${url}"}`;
        return { ok: true, status: 200, text: async () => body };
      },
    });
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("/v1.2.0/api/openapi.yaml");
    expect(lock.contractVersion).toBe("1.2.0");
    expect(lock.files["openapi.yaml"]).toBe(sha256("info:\n  version: 1.2.0\npaths:\n"));
    expect(checkContract(dir)).toEqual([]);
  });
  it("throws on an HTTP failure", async () => {
    await expect(
      updateContract({
        ref: "x",
        dir: copy(),
        fetch: async () => ({ ok: false, status: 404, text: async () => "" }),
      }),
    ).rejects.toThrow("HTTP 404");
  });
});
