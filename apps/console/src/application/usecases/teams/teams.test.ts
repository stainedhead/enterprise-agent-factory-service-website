import { describe, expect, it, vi } from "vitest";
import type { TeamRecord, TeamsPort } from "../../ports/teams.js";
import { overrideActive, TeamsUseCases } from "./TeamsUseCases.js";
import { emptyTeamDraft, parseThresholds, requiredTags, validateStep } from "./teamDraft.js";

export const status = { phase: "Ready", observedGeneration: 1, conditions: [], updatedAt: "t" };
export const team = (over: Partial<TeamRecord> = {}): TeamRecord => ({
  id: "team_1",
  slug: "alpha",
  displayName: "Alpha",
  kind: "persistent",
  state: "active",
  namespace: "afs-alpha",
  generation: 1,
  version: 3,
  status,
  maxBudgetUsd: "100.00",
  effectiveCeilingUsd: "100.00",
  isolationTier: "shared",
  viewerKubectl: false,
  mayAddExternalSystems: false,
  mayManageAwsAccounts: false,
  allowedAwsAccounts: [],
  ...over,
});

function port(over: Partial<TeamsPort> = {}): TeamsPort {
  const p = {
    list: vi.fn(async () => ({
      items: [team(), team({ id: "team_2", slug: "beta" })],
      nextToken: "n",
    })),
    spendByTeam: vi.fn(async () => ({ team_1: { costUsd: "10.00" } })),
    update: vi.fn(async () => team()),
    create: vi.fn(async () => team()),
    get: vi.fn(async () => team()),
    delete: vi.fn(async () => team()),
    suspend: vi.fn(async () => team()),
    resume: vi.fn(async () => team()),
    status: vi.fn(async () => status),
    models: vi.fn(async () => []),
    putModels: vi.fn(async () => []),
    tags: vi.fn(async () => ({ tags: [] })),
    putTags: vi.fn(async () => ({ tags: [] })),
    catalogModels: vi.fn(async () => []),
    serviceTags: vi.fn(async () => []),
    ...over,
  };
  return p as unknown as TeamsPort;
}
const NOW = Date.parse("2026-11-22T00:00:00Z");
const uc = (p: TeamsPort) => new TeamsUseCases(p, { now: () => NOW });

describe("TeamsUseCases", () => {
  it("lists a page joined with spend in two requests, not one per row", async () => {
    const p = port();
    const page = await uc(p).listRows({ maxResults: 25 });
    expect(page.rows.map((r) => r.spend?.costUsd)).toEqual(["10.00", undefined]);
    expect(page.nextToken).toBe("n");
    expect(p.list).toHaveBeenCalledTimes(1);
    expect(p.spendByTeam).toHaveBeenCalledTimes(1);
  });

  it("a failing spend report does not blank the table", async () => {
    const p = port({ spendByTeam: vi.fn(async () => Promise.reject(new Error("x"))) });
    const page = await uc(p).listRows({ maxResults: 25 });
    expect(page.rows).toHaveLength(2);
    expect(page.rows[0]?.spend).toBeUndefined();
  });

  it("set ceiling sends maxBudgetUsd with the version and rejects non-positive amounts", async () => {
    const p = port();
    await uc(p).setCeiling({ id: "team_1", version: 3, extra: 1 } as never, "6000.00");
    expect(p.update).toHaveBeenCalledWith(
      { id: "team_1", version: 3 },
      { maxBudgetUsd: "6000.00" },
    );
    await expect(uc(p).setCeiling({ id: "t", version: 1 }, "0")).rejects.toMatchObject({
      kind: "validation",
      fields: { maxBudgetUsd: expect.any(String) },
    });
    await expect(uc(p).setCeiling({ id: "t", version: 1 }, "abc")).rejects.toMatchObject({
      kind: "validation",
    });
  });

  it("raise ceiling temporarily needs amount, a future expiry and a reason", async () => {
    const p = port();
    const ok = { amountUsd: "7500.00", expiresAt: "2026-12-01T00:00:00Z", reason: " launch " };
    await uc(p).raiseCeilingTemporarily({ id: "team_1", version: 3 }, ok);
    expect(p.update).toHaveBeenCalledWith(
      { id: "team_1", version: 3 },
      {
        ceilingOverrideUsd: "7500.00",
        ceilingOverrideExpiresAt: "2026-12-01T00:00:00Z",
        ceilingOverrideReason: "launch",
      },
    );
    const ref = { id: "t", version: 1 };
    await expect(
      uc(p).raiseCeilingTemporarily(ref, { ...ok, amountUsd: "x" }),
    ).rejects.toMatchObject({ fields: { ceilingOverrideUsd: expect.any(String) } });
    await expect(
      uc(p).raiseCeilingTemporarily(ref, { ...ok, expiresAt: "2026-11-01T00:00:00Z" }),
    ).rejects.toMatchObject({ fields: { ceilingOverrideExpiresAt: expect.any(String) } });
    await expect(
      uc(p).raiseCeilingTemporarily(ref, { ...ok, expiresAt: "soon" }),
    ).rejects.toMatchObject({ kind: "validation" });
    await expect(uc(p).raiseCeilingTemporarily(ref, { ...ok, reason: "  " })).rejects.toMatchObject(
      { fields: { ceilingOverrideReason: expect.any(String) } },
    );
  });

  it("delegates the simple operations", async () => {
    const p = port();
    const u = uc(p);
    await u.get("team_1");
    await u.status("team_1");
    await u.suspend("team_1");
    await u.resume("team_1");
    await u.delete({ id: "team_1", version: 3 });
    await u.models("team_1");
    await u.putModels({ id: "team_1", version: 3 }, ["m"]);
    await u.tags("team_1");
    await u.catalogModels();
    await u.serviceTags();
    await u.update({ id: "team_1", version: 3 }, { displayName: "x" });
    expect(p.putModels).toHaveBeenCalledWith({ id: "team_1", version: 3 }, ["m"]);
    expect(p.delete).toHaveBeenCalledWith({ id: "team_1", version: 3 });
  });

  it("create validates the budget and sends the request", async () => {
    const p = port();
    const d = {
      ...emptyTeamDraft(),
      displayName: "A",
      slug: "alpha",
      maxBudgetUsd: "100.00",
      models: ["m"],
      adminEmail: "a@b.co",
    };
    await uc(p).create(d);
    expect(p.create).toHaveBeenCalledTimes(1);
    await expect(uc(p).create({ ...d, maxBudgetUsd: "x" })).rejects.toMatchObject({
      kind: "validation",
    });
  });

  it("overrideActive follows the expiry", () => {
    expect(
      overrideActive(
        team({ ceilingOverrideUsd: "9.00", ceilingOverrideExpiresAt: "2026-12-01T00:00:00Z" }),
        NOW,
      ),
    ).toBe(true);
    expect(
      overrideActive(
        team({ ceilingOverrideUsd: "9.00", ceilingOverrideExpiresAt: "2026-11-01T00:00:00Z" }),
        NOW,
      ),
    ).toBe(false);
    expect(overrideActive(team({ ceilingOverrideUsd: "9.00" }), NOW)).toBe(true);
    expect(overrideActive(team(), NOW)).toBe(false);
  });
});

describe("team draft validation (M1-T5, M1-T6)", () => {
  const tags = [
    { key: "env", mode: "required", allowedValues: ["prod", "dev"] },
    { key: "owner", mode: "fixed", value: "x" },
    { key: "free", mode: "required", allowedValues: null },
  ];

  it("details: name, slug, owner email and every required tag", () => {
    const d = emptyTeamDraft();
    expect(Object.keys(validateStep("details", d, tags)).sort()).toEqual([
      "displayName",
      "slug",
      "tags.env",
      "tags.free",
    ]);
    const ok = { ...d, displayName: "A", slug: "alpha", tags: { env: "prod", free: "x" } };
    expect(validateStep("details", ok, tags)).toEqual({});
    expect(validateStep("details", { ...ok, ownerEmail: "bad" }, tags)).toHaveProperty(
      "ownerEmail",
    );
    expect(validateStep("details", { ...ok, tags: { env: "qa", free: "x" } }, tags)).toHaveProperty(
      "tags.env",
    );
    expect(requiredTags(tags).map((t) => t.key)).toEqual(["env", "free"]);
  });

  it("models, budget and members", () => {
    const d = emptyTeamDraft();
    expect(validateStep("models", d, [])).toHaveProperty("models");
    expect(validateStep("models", { ...d, models: ["m"] }, [])).toEqual({});
    expect(validateStep("budget", d, [])).toHaveProperty("maxBudgetUsd");
    expect(validateStep("budget", { ...d, maxBudgetUsd: "0.00" }, [])).toHaveProperty(
      "maxBudgetUsd",
    );
    expect(validateStep("budget", { ...d, maxBudgetUsd: "ten" }, [])).toHaveProperty(
      "maxBudgetUsd",
    );
    expect(
      validateStep("budget", { ...d, maxBudgetUsd: "10.00", thresholds: "50, 200" }, []),
    ).toHaveProperty("thresholds");
    expect(validateStep("budget", { ...d, maxBudgetUsd: "10.00" }, [])).toEqual({});
    expect(validateStep("members", d, [])).toHaveProperty("adminEmail");
    expect(validateStep("members", { ...d, adminEmail: "a@b.co" }, [])).toEqual({});
    expect(validateStep("members", { ...d, adminType: "group" }, [])).toHaveProperty("adminGroup");
    expect(validateStep("members", { ...d, adminType: "group", adminGroup: "g" }, [])).toEqual({});
  });

  it("parses thresholds", () => {
    expect(parseThresholds("")).toEqual([]);
    expect(parseThresholds("50, 80,100")).toEqual([50, 80, 100]);
    expect(parseThresholds("0")).toBeUndefined();
    expect(parseThresholds("a")).toBeUndefined();
    expect(parseThresholds("1.5")).toBeUndefined();
  });
});
