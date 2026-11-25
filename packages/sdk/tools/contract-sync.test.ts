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

describe("pinned snapshot (SDK-16)", () => {
  it("pins v1.5.0 with the team_collaborator role, the collaboration and the model endpoint permissions", () => {
    const lock = JSON.parse(readFileSync(join(CONTRACT_DIR, "contract.lock.json"), "utf8"));
    expect(lock.contractVersion).toBe("1.5.0");
    expect(lock.commit).toBe("7d48ea70d2f9cb77ef4308b0225ca9d4168dea60");
    expect(lock.commit).toMatch(/^[0-9a-f]{40}$/);
    const perms = JSON.parse(readFileSync(join(CONTRACT_DIR, "permissions.json"), "utf8")) as {
      roles: string[];
      permissions: { name: string }[];
    };
    expect(perms.roles).toContain("team_collaborator");
    const names = perms.permissions
      .map((p) => p.name)
      .filter((n) => n.startsWith("collaboration:"));
    expect(names.sort()).toEqual([
      "collaboration:access",
      "collaboration:api",
      "collaboration:contribute",
      "collaboration:manage",
      "collaboration:read",
    ]);
    const all = perms.permissions.map((p) => p.name);
    for (const p of [
      "admin:model-endpoints",
      "admin:inference-providers",
      "model-endpoints:read",
      "model-endpoints:write",
    ])
      expect(all, p).toContain(p);
  });
});
