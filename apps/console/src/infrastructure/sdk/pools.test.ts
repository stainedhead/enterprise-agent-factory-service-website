import { describe, expect, it } from "vitest";
import { SdkPools } from "./pools.js";
import { fakeApi, json, on } from "./testing.js";

const status = {
  phase: "Ready",
  observedGeneration: 1,
  updatedAt: "2026-11-21T18:00:00Z",
  conditions: [],
};
const pool = {
  id: "pool_1",
  name: "triage",
  template: "hermes-dev",
  image: "ghcr.io/acme/h@sha256:1",
  modelId: "claude-sonnet",
  workers: 3,
  stageId: "stg_1",
  state: "enabled",
  handoffs: ["pool_2"],
  scratchSizeGiB: 20,
  sharedVolume: "efs",
  generation: 1,
  version: 4,
  status,
};
const stage = { id: "stg_1", name: "triage", position: 1, version: 2 };
const link = {
  id: "prl_1",
  accountId: "111122223333",
  roleName: "swarm-reader",
  profileName: "swarm",
  status: "verified",
  lastVerifiedAt: null,
  lastError: null,
  version: 1,
};
const P = "/v1/teams/t1/pools/pool_1";

describe("SdkPools (M5-P1): the 26 operations", () => {
  it("stages: list, create, update with If-Match, delete", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/t1/stages", () => json({ items: [stage] })),
      on("POST", "/v1/teams/t1/stages", () => json(stage, 201)),
      on("PATCH", "/v1/teams/t1/stages/stg_1", () => json({ ...stage, position: 2 })),
      on("DELETE", "/v1/teams/t1/stages/stg_1", () => json({}, 204)),
    );
    const p = new SdkPools(client);
    expect(await p.listStages("t1")).toEqual([
      { id: "stg_1", name: "triage", position: 1, description: undefined, version: 2 },
    ]);
    await p.createStage("t1", { name: "triage", position: 1 });
    await p.updateStage("t1", { id: "stg_1", version: 2 }, { position: 2 });
    expect(calls.find((c) => c.method === "PATCH")?.headers.get("if-match")).toBe('"2"');
    await p.deleteStage("t1", { id: "stg_1", version: 2 });
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("pools: list, get, create, update, delete, scale, pause, resume, status", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/t1/pools", () => json({ items: [pool] })),
      on("POST", "/v1/teams/t1/pools", () => json(pool, 201)),
      on("GET", `${P}`, () => json(pool)),
      on("PATCH", `${P}`, () => json({ ...pool, workers: 5 })),
      on("DELETE", `${P}`, () => json({ ...pool, state: "deleting" }, 202)),
      on("POST", `${P}:scale`, () => json({ ...pool, workers: 7 })),
      on("POST", `${P}:pause`, () => json({ ...pool, state: "paused" })),
      on("POST", `${P}:resume`, () => json(pool)),
      on("GET", `${P}/status`, () =>
        json({
          generation: 1,
          id: "pool_1",
          status,
          workers: { desired: 3, idle: 1, impaired: 0, reporting: 3, working: 2 },
        }),
      ),
    );
    const p = new SdkPools(client);
    const [first] = await p.list("t1");
    expect(first).toMatchObject({ id: "pool_1", handoffs: ["pool_2"], stageId: "stg_1" });
    expect((await p.get("t1", "pool_1")).name).toBe("triage");
    await p.create("t1", {
      name: "triage",
      template: "hermes-dev",
      image: "x",
      models: { access: "all", modelIds: [], defaultModelId: "m" },
      workers: 3,
      stageId: "stg_1",
      resources: { cpu: "2", memory: undefined },
    });
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      workers: 3,
      resources: { cpu: "2" },
    });
    expect((await p.update("t1", { id: "pool_1", version: 4 }, { workers: 5 })).workers).toBe(5);
    expect((await p.delete("t1", { id: "pool_1", version: 4 })).state).toBe("deleting");
    expect((await p.scale("t1", "pool_1", 7)).workers).toBe(7);
    expect(calls.find((c) => c.path.endsWith(":scale"))?.body).toEqual({ workers: 7 });
    expect((await p.pause("t1", "pool_1")).state).toBe("paused");
    expect((await p.resume("t1", "pool_1")).state).toBe("enabled");
    expect((await p.status("t1", "pool_1")).workers).toMatchObject({ working: 2, idle: 1 });
  });

  it("handoffs, secret bindings, configuration values, external systems", async () => {
    const { client, calls } = fakeApi(
      on("GET", `${P}/handoffs`, () => json({ toPoolIds: ["pool_2"], version: 1 })),
      on("PUT", `${P}/handoffs`, () => json({ toPoolIds: [], version: 2 })),
      on("GET", `${P}/secret-bindings`, () =>
        json({ items: [{ secretId: "sec_1", delivery: "env", target: "TOKEN" }], version: 1 }),
      ),
      on("PUT", `${P}/secret-bindings`, () => json({ items: [], version: 2 })),
      on("GET", `${P}/config-values`, () =>
        json({ items: [{ name: "LEVEL", source: "literal", value: "info", version: 1 }] }),
      ),
      on("PUT", `${P}/config-values/LEVEL`, () =>
        json({ name: "LEVEL", source: "literal", value: "debug" }),
      ),
      on("DELETE", `${P}/config-values/LEVEL`, () => json({}, 204)),
      on("GET", `${P}/external-systems`, () =>
        json({ items: [{ id: "ext_1", name: "GitHub", enabled: true }] }),
      ),
      on("PUT", `${P}/external-systems/ext_1`, () =>
        json({ id: "ext_1", name: "GitHub", enabled: false }),
      ),
    );
    const p = new SdkPools(client);
    expect((await p.handoffs("t1", "pool_1")).toPoolIds).toEqual(["pool_2"]);
    await p.putHandoffs("t1", { id: "pool_1", version: 1 }, []);
    expect(calls.find((c) => c.method === "PUT")?.headers.get("if-match")).toBe('"1"');
    expect((await p.secretBindings("t1", "pool_1")).items[0]?.target).toBe("TOKEN");
    await p.putSecretBindings("t1", { id: "pool_1", version: 1 }, []);
    expect(await p.configValues("t1", "pool_1")).toEqual([
      { name: "LEVEL", source: "literal", value: "info" },
    ]);
    expect(
      (await p.putConfigValue("t1", "pool_1", { name: "LEVEL", source: "literal", value: "debug" }))
        .value,
    ).toBe("debug");
    await p.deleteConfigValue("t1", "pool_1", "LEVEL");
    expect((await p.externalSystems("t1", "pool_1"))[0]).toEqual({
      id: "ext_1",
      name: "GitHub",
      enabled: true,
    });
    await p.putExternalSystem("t1", "pool_1", "ext_1", false);
    expect(calls.filter((c) => c.path.endsWith("/ext_1"))[0]?.body).toEqual({ enabled: false });
  });

  it("role links: list, create, verify, delete", async () => {
    const { client, calls } = fakeApi(
      on("GET", `${P}/role-links`, () => json({ items: [link] })),
      on("POST", `${P}/role-links`, () => json(link, 201)),
      on("POST", `${P}/role-links/prl_1:verify`, () => json({ ...link, status: "verified" }, 202)),
      on("DELETE", `${P}/role-links/prl_1`, () => json({}, 204)),
    );
    const p = new SdkPools(client);
    expect((await p.roleLinks("t1", "pool_1"))[0]).toMatchObject({
      roleName: "swarm-reader",
      lastVerifiedAt: undefined,
    });
    await p.createRoleLink("t1", "pool_1", {
      accountId: "111122223333",
      roleName: "swarm-reader",
      profileName: "swarm",
    });
    expect((await p.verifyRoleLink("t1", "pool_1", "prl_1")).status).toBe("verified");
    await p.deleteRoleLink("t1", "pool_1", { id: "prl_1", version: 1 });
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });
});
