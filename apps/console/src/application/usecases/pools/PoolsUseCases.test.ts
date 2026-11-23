import { describe, expect, it, vi } from "vitest";
import { aTemplate, fakeAgentsPort } from "../../../presentation/testing/agents.js";
import { aPool, aRoleLink, aStage, fakePoolsPort } from "../../../presentation/testing/pools.js";
import { type PoolDraft, PoolsUseCases, templateRetired, validatePool } from "./PoolsUseCases.js";

const draft = (over: Partial<PoolDraft> = {}): PoolDraft => ({
  name: "triage-workers",
  template: "hermes-dev",
  image: "ghcr.io/acme/hermes-dev@sha256:4b1e",
  persona: "",
  modelAccess: "selected",
  modelIds: ["claude-sonnet"],
  defaultModelId: "claude-sonnet",
  cpu: "2",
  memory: "8Gi",
  sizeGiB: "20",
  storageClass: "",
  onDelete: "snapshot_then_delete",
  snapshotSchedule: "daily",
  snapshotRetain: "7",
  iamIdentity: "team_shared",
  config: [],
  bindings: [],
  workers: "4",
  stageId: "",
  handoffs: [],
  scratchSizeGiB: "20",
  sharedVolume: "none",
  ...over,
});

const make = (port = fakePoolsPort()) => ({
  port,
  uc: new PoolsUseCases(port, fakeAgentsPort()),
});

describe("validatePool (M5-P3, M5-P4)", () => {
  it("accepts a complete draft", () => expect(validatePool(draft())).toEqual({}));
  it("bounds workers 0..200 and scratch 1..500 GiB", () => {
    expect(validatePool(draft({ workers: "0" })).workers).toBeUndefined();
    expect(validatePool(draft({ workers: "200" })).workers).toBeUndefined();
    expect(validatePool(draft({ workers: "201" })).workers).toBeTruthy();
    expect(validatePool(draft({ workers: "-1" })).workers).toBeTruthy();
    expect(validatePool(draft({ workers: "x" })).workers).toBeTruthy();
    expect(validatePool(draft({ scratchSizeGiB: "0" })).scratchSizeGiB).toBeTruthy();
    expect(validatePool(draft({ scratchSizeGiB: "501" })).scratchSizeGiB).toBeTruthy();
    expect(validatePool(draft({ scratchSizeGiB: "500" })).scratchSizeGiB).toBeUndefined();
  });
  it("refuses a name an agent or pool already uses, and a bad name", () => {
    expect(validatePool(draft(), ["triage-workers"]).name).toMatch(/already has this name/);
    expect(validatePool(draft({ name: "X" })).name).toMatch(/lower-case/);
  });
  it("does not report the agent volume fields", () => {
    expect(Object.keys(validatePool(draft({ sizeGiB: "0" })))).toEqual([]);
  });
  it("applies the agent form's secret and configuration rules", () => {
    const e = validatePool(draft({ bindings: [{ secretId: "", delivery: "env", target: "A" }] }));
    expect(e["binding.0.secretId"]).toBeTruthy();
  });
});

describe("templateRetired (M5-P7)", () => {
  it("is true only for a known template that is disabled", () => {
    const t = [aTemplate(), aTemplate({ name: "old", enabled: false })];
    expect(templateRetired({ template: "old" }, t)).toBe(true);
    expect(templateRetired({ template: "hermes-dev" }, t)).toBe(false);
    expect(templateRetired({ template: "unknown" }, t)).toBe(false);
  });
});

describe("PoolsUseCases", () => {
  it("lists stages in position order", async () => {
    const { uc } = make(
      fakePoolsPort({
        listStages: async () => [
          aStage({ id: "b", name: "b", position: 2 }),
          aStage({ id: "a", name: "a", position: 1 }),
        ],
      }),
    );
    expect((await uc.stages("t")).map((s) => s.id)).toEqual(["a", "b"]);
  });
  it("collects the names of the team's agents and pools", async () => {
    const { uc } = make();
    expect(await uc.takenNames("t")).toEqual(
      expect.arrayContaining(["reviewer-bot", "incident-scribe", "triage-workers", "fixers"]),
    );
  });
  it("creates the pool, then handoffs, bindings and config values, reporting what the API refused", async () => {
    const port = fakePoolsPort({
      putConfigValue: vi.fn(async (_t, _p, v) => {
        if (v.name === "BAD_ONE") throw new Error("refused");
        return { name: v.name, source: v.source, value: v.value };
      }),
    });
    const { uc } = make(port);
    const r = await uc.create(
      "t",
      draft({
        name: "new-pool",
        stageId: "stg_1",
        handoffs: ["pool_2"],
        bindings: [{ secretId: "sec_1", delivery: "env", target: "TOKEN" }],
        config: [
          { name: "LEVEL", source: "literal", value: "info" },
          { name: "BAD_ONE", source: "literal", value: "x" },
        ],
      }),
    );
    expect(port.create.mock.calls[0]?.[1]).toMatchObject({
      name: "new-pool",
      workers: 4,
      stageId: "stg_1",
      scratchSizeGiB: 20,
      resources: { cpu: "2", memory: "8Gi" },
    });
    expect(port.putHandoffs).toHaveBeenCalledWith("t", { id: "pool_9", version: 1 }, ["pool_2"]);
    expect(port.putSecretBindings).toHaveBeenCalled();
    expect(r.failures).toEqual([{ part: "configuration value BAD_ONE", message: "refused" }]);
  });
  it("rejects an invalid draft before calling the API", async () => {
    const { uc, port } = make();
    await expect(uc.create("t", draft({ workers: "500" }))).rejects.toMatchObject({
      kind: "validation",
    });
    expect(port.create).not.toHaveBeenCalled();
  });
  it("scales within 0..200 only", async () => {
    const { uc, port } = make();
    await expect(uc.scale("t", aPool(), "201")).rejects.toMatchObject({ kind: "validation" });
    await uc.scale("t", aPool(), "0");
    expect(port.scale).toHaveBeenCalledWith("t", "pool_1", 0);
  });
  it("refuses a handoff to itself", async () => {
    const { uc } = make();
    await expect(uc.saveHandoffs("t", aPool(), ["pool_1"])).rejects.toMatchObject({
      kind: "validation",
    });
  });
  it("links a shared role only in allowed accounts and skips accounts already linked", async () => {
    const { uc, port } = make();
    await expect(
      uc.linkSharedRole("t", "pool_1", "swarm-reader", ["999999999999"], ["111122223333"]),
    ).rejects.toMatchObject({ kind: "validation" });
    await expect(
      uc.linkSharedRole("t", "pool_1", "bad role!", ["111122223333"], ["111122223333"]),
    ).rejects.toMatchObject({ kind: "validation" });
    const r = await uc.linkSharedRole(
      "t",
      "pool_1",
      "swarm-reader",
      ["111122223333", "444455556666"],
      ["111122223333", "444455556666"],
      [aRoleLink()],
    );
    expect(r.created.map((l) => l.accountId)).toEqual(["444455556666"]);
    expect(port.createRoleLink).toHaveBeenCalledTimes(1);
  });
  it("reads worker counts and links per pool, leaving out a pool that cannot be read", async () => {
    const port = fakePoolsPort({
      status: vi.fn(async (_t, id) => {
        if (id === "pool_2") throw new Error("down");
        return {
          status: aPool().status,
          workers: { desired: 4, reporting: 4, working: 2, idle: 1, impaired: 1 },
        };
      }),
    });
    const { uc } = make(port);
    const s = await uc.statuses("t", ["pool_1", "pool_2"]);
    expect(Object.keys(s)).toEqual(["pool_1"]);
    expect(Object.keys(await uc.linksFor("t", ["pool_1", "pool_2"]))).toEqual(["pool_1", "pool_2"]);
  });
  it("reads spend by pool from the usage report and tolerates no reports port", async () => {
    const run = vi.fn(async () => ({
      kind: "usage",
      range: { from: "a", to: "b" },
      groupBy: ["pool"],
      rows: [{ pool: "pool_1", costUsd: "12.50" }, { pool: 3 }],
      totals: {},
      notes: [],
    }));
    const uc = new PoolsUseCases(fakePoolsPort(), fakeAgentsPort(), { run });
    expect(await uc.spendByPool("t")).toEqual({ pool_1: "12.50" });
    expect(await make().uc.spendByPool("t")).toEqual({});
  });
});
