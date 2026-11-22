import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors.js";
import type { ApiKeysPort, CreatedApiKey, MembersPort } from "../../ports/members.js";
import { ApiKeysUseCases, MembersUseCases } from "./MembersUseCases.js";

const NOW = Date.parse("2026-11-22T00:00:00Z");
const member = { id: "mem_1", role: "team_viewer", subjectType: "user", version: 1 };
const membersPort = (): { [K in keyof MembersPort]: ReturnType<typeof vi.fn> } => ({
  list: vi.fn(async () => [member]),
  add: vi.fn(async () => member),
  update: vi.fn(async () => member),
  remove: vi.fn(async () => undefined),
});
const key = {
  id: "key_1",
  name: "ci",
  role: "team_viewer",
  keyPrefix: "afs_ab",
  expiresAt: "x",
  createdAt: "x",
};
const keysPort = () => ({
  list: vi.fn(async () => [key]),
  create: vi.fn(
    async (): Promise<CreatedApiKey> => ({ key, secretKey: "afs_secret", replayed: false }),
  ),
  delete: vi.fn(async () => undefined),
});

describe("MembersUseCases.add", () => {
  it("adds a person by trimmed email", async () => {
    const p = membersPort();
    await new MembersUseCases(p as unknown as MembersPort).add("team_1", {
      subjectType: "user",
      role: "team_admin",
      email: " ana@example.com ",
    });
    expect(p.add).toHaveBeenCalledWith("team_1", {
      subjectType: "user",
      role: "team_admin",
      email: "ana@example.com",
    });
  });

  it("adds an IdP group with its provider", async () => {
    const p = membersPort();
    await new MembersUseCases(p as unknown as MembersPort).add("team_1", {
      subjectType: "group",
      role: "team_viewer",
      groupName: "payments-eng",
      identityProviderId: "idp_1",
    });
    expect(p.add).toHaveBeenCalledWith("team_1", {
      subjectType: "group",
      role: "team_viewer",
      groupName: "payments-eng",
      identityProviderId: "idp_1",
    });
  });

  it.each([
    [{ subjectType: "user", role: "team_admin", email: "" } as const, "email"],
    [{ subjectType: "user", role: "team_admin", email: "nope" } as const, "email"],
    [{ subjectType: "group", role: "team_admin", groupName: " " } as const, "groupName"],
  ])("refuses %j without calling the API", async (input, field) => {
    const p = membersPort();
    const err = await new MembersUseCases(p as unknown as MembersPort)
      .add("team_1", input)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).fields[field]).toBeTruthy();
    expect(p.add).not.toHaveBeenCalled();
  });

  it("passes any role through: the API refuses service_admin", async () => {
    const p = membersPort();
    p.add.mockRejectedValue(new AppError({ kind: "validation", message: "role not allowed" }));
    await expect(
      new MembersUseCases(p as unknown as MembersPort).add("team_1", {
        subjectType: "user",
        role: "service_admin",
        email: "a@b.co",
      }),
    ).rejects.toThrow("role not allowed");
    expect(p.add).toHaveBeenCalled();
  });

  it("updates and removes against the held version", async () => {
    const p = membersPort();
    const uc = new MembersUseCases(p as unknown as MembersPort);
    await uc.updateRole("team_1", { id: "mem_1", version: 4 }, "team_admin");
    await uc.remove("team_1", { id: "mem_1", version: 4 });
    expect(p.update).toHaveBeenCalledWith("team_1", { id: "mem_1", version: 4 }, "team_admin");
    expect(p.remove).toHaveBeenCalledWith("team_1", { id: "mem_1", version: 4 });
  });
});

describe("ApiKeysUseCases.create", () => {
  const uc = (p = keysPort()) => ({
    p,
    uc: new ApiKeysUseCases(p as unknown as ApiKeysPort, { now: () => NOW }),
  });

  it("defaults to 30 days", async () => {
    const { p, uc: u } = uc();
    await u.create("team_1", { name: "ci", role: "team_viewer", days: "" });
    expect(p.create).toHaveBeenCalledWith("team_1", {
      name: "ci",
      role: "team_viewer",
      expiresAt: "2026-12-22T00:00:00.000Z",
    });
  });

  it("keeps a minute of margin on the 90th day", async () => {
    const { p, uc: u } = uc();
    await u.create("team_1", { name: "ci", role: "team_viewer", days: "90" });
    const sent = (p.create.mock.calls[0] as unknown as [string, { expiresAt: string }])[1]
      .expiresAt;
    expect(Date.parse(sent) - NOW).toBeLessThan(90 * 86_400_000);
  });

  it.each(["0", "91", "1.5", "abc"])("refuses %s days", async (days) => {
    const { p, uc: u } = uc();
    const err = await u.create("team_1", { name: "ci", role: "team_viewer", days }).catch((e) => e);
    expect((err as AppError).fields.expiresAt).toBeTruthy();
    expect(p.create).not.toHaveBeenCalled();
  });

  it("refuses a blank name", async () => {
    const { p, uc: u } = uc();
    const err = await u
      .create("team_1", { name: " ", role: "team_viewer", days: "30" })
      .catch((e) => e);
    expect((err as AppError).fields.name).toBeTruthy();
    expect(p.create).not.toHaveBeenCalled();
  });

  it("passes a one-time secret through and reports a replay without one", async () => {
    const { p, uc: u } = uc();
    expect(
      (await u.create("team_1", { name: "ci", role: "team_viewer", days: "30" })).secretKey,
    ).toBe("afs_secret");
    p.create.mockResolvedValue({ key, secretKey: undefined, replayed: true });
    const r = await u.create("team_1", { name: "ci", role: "team_viewer", days: "30" });
    expect(r.secretKey).toBeUndefined();
    expect(r.replayed).toBe(true);
  });
});
