import { describe, expect, it, vi } from "vitest";
import type { SecretsPort } from "../../ports/secrets.js";
import { managedPath, SecretsUseCases } from "./SecretsUseCases.js";

const port = (): { [K in keyof SecretsPort]: ReturnType<typeof vi.fn> } & SecretsPort =>
  ({
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: "sec_1" })),
    update: vi.fn(),
    delete: vi.fn(),
    putValue: vi.fn(async () => undefined),
    rotate: vi.fn(async () => ({ id: "sec_1" })),
  }) as never;

describe("SecretsUseCases (M2-S1)", () => {
  it("previews the managed path with and without an agent", () => {
    expect(managedPath({ namespace: "afs-alpha", name: "gh" })).toBe("afs/afs-alpha/gh");
    expect(managedPath({ namespace: "afs-alpha", name: "gh", agentName: "reviewer" })).toBe(
      "afs/afs-alpha/reviewer/gh",
    );
    expect(managedPath({ namespace: "afs-alpha", name: "" })).toBe("afs/afs-alpha/<name>");
  });

  it("creates with the value as an argument and trims the name", async () => {
    const p = port();
    await new SecretsUseCases(p).create("t", { scope: "team", name: " github-pat " }, "V");
    expect(p.create).toHaveBeenCalledWith("t", { scope: "team", name: "github-pat" }, "V");
  });

  it.each([
    [{ scope: "team", name: "Bad Name" } as const, "V", "name"],
    [{ scope: "agent", name: "good-name" } as const, "V", "agentId"],
    [{ scope: "team", name: "good-name" } as const, "", "value"],
  ])("refuses %j before any request", async (input, value, field) => {
    const p = port();
    const e = await new SecretsUseCases(p).create("t", input, value).catch((x) => x);
    expect(e.fields[field]).toBeTruthy();
    expect(p.create).not.toHaveBeenCalled();
  });

  it("refuses an empty value for put and rotate", async () => {
    const p = port();
    const u = new SecretsUseCases(p);
    expect(
      (await u.putValue("t", { id: "s", version: 1 }, "").catch((x) => x)).fields.value,
    ).toBeTruthy();
    expect((await u.rotate("t", "s", "").catch((x) => x)).fields.value).toBeTruthy();
    expect(p.putValue).not.toHaveBeenCalled();
    expect(p.rotate).not.toHaveBeenCalled();
  });
});

describe("reserved names and managed rotation (WEB-US-54)", () => {
  it("refuses paperclip names except the worker key on an agent", async () => {
    const p = {
      create: vi.fn(async () => ({ id: "s" })),
      rotate: vi.fn(async () => ({ id: "s" })),
    };
    const u = new SecretsUseCases(p as never);
    for (const name of ["paperclip", "paperclip-hub"]) {
      const e = await u.create("t", { scope: "team", name }, "v").catch((x) => x);
      expect(e.fields.name).toBe("This name is reserved for Paperclip");
    }
    await u.create("t", { scope: "agent", name: "paperclip-agent-api-key", agentId: "agt_1" }, "v");
    expect(p.create).toHaveBeenCalledTimes(1);
    await u.rotateManaged("t", "sec_1");
    expect(p.rotate).toHaveBeenCalledWith("t", "sec_1");
  });
});
