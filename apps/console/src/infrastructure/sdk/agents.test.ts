import { describe, expect, it } from "vitest";
import { AppError } from "../../application/errors.js";
import { SdkAgents } from "./agents.js";
import { fakeApi, json, on } from "./testing.js";

const agent = {
  id: "agt_1",
  name: "reviewer-bot",
  template: "hermes-dev",
  image: "x@sha256:1",
  modelId: "m",
  paused: false,
  generation: 1,
  version: 4,
  iamIdentity: "team_shared",
  status: {
    phase: "Ready",
    observedGeneration: 1,
    conditions: [],
    updatedAt: "2026-11-22T00:00:00Z",
  },
};

describe("SdkAgents (M2-A1)", () => {
  it("lists every page and defaults secretBindings to empty", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/teams/team_1/agents", (r) =>
        r.query.get("nextToken")
          ? json({ items: [{ ...agent, id: "agt_2" }] })
          : json({ items: [agent], nextToken: "n2" }),
      ),
    );
    const list = await new SdkAgents(client).list("team_1");
    expect(list.map((a) => a.id)).toEqual(["agt_1", "agt_2"]);
    expect(list[0]?.secretBindings).toEqual([]);
  });

  it("creates with only the set fields, updates with If-Match and runs the actions", async () => {
    const { client, calls } = fakeApi(
      on("POST", "/v1/teams/team_1/agents", () => json(agent, 201)),
      on("PATCH", "/v1/teams/team_1/agents/agt_1", () => json({ ...agent, version: 5 })),
      on("POST", "/v1/teams/team_1/agents/agt_1:restart", () => json(agent)),
      on("POST", "/v1/teams/team_1/agents/agt_1:pause", () => json({ ...agent, paused: true })),
      on("POST", "/v1/teams/team_1/agents/agt_1:resume", () => json(agent)),
      on("DELETE", "/v1/teams/team_1/agents/agt_1", () => json(agent, 202)),
    );
    const sdk = new SdkAgents(client);
    await sdk.create("team_1", {
      name: "a",
      template: "t",
      image: "i",
      modelId: "m",
      description: undefined,
      volume: { sizeGiB: 20, storageClass: undefined },
    });
    await sdk.update("team_1", { id: "agt_1", version: 4 }, { volume: { sizeGiB: 80 } });
    await sdk.restart("team_1", "agt_1");
    await sdk.pause("team_1", "agt_1");
    await sdk.resume("team_1", "agt_1");
    await sdk.delete("team_1", { id: "agt_1", version: 5 });
    expect(calls[0]?.body).toEqual({
      name: "a",
      template: "t",
      image: "i",
      modelId: "m",
      volume: { sizeGiB: 20 },
    });
    expect(calls[1]?.headers.get("if-match")).toBe('"4"');
    expect(calls[1]?.body).toEqual({ volume: { sizeGiB: 80 } });
    expect(calls[5]?.headers.get("if-match")).toBe('"5"');
  });

  it("reads month-to-date cost grouped by agent", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/team_1/usage", () =>
        json({
          groupBy: ["agent"],
          range: {},
          totals: { calls: 1, costUsd: "3.00", key: {} },
          rows: [{ calls: 1, costUsd: "3.00", key: { agent: "agt_1" } }],
        }),
      ),
    );
    expect(await new SdkAgents(client).monthCosts("team_1")).toEqual({ agt_1: "3.00" });
    expect(calls[0]?.query.get("groupBy")).toBe("agent");
    expect(calls[0]?.query.get("from")).toMatch(/-01T00:00:00/);
  });

  it("lists snapshots, creates one, and reads templates and storage classes", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/teams/team_1/agents/agt_1/snapshots", () =>
        json({
          items: [
            {
              id: "snap_1",
              agentId: "agt_1",
              reason: "manual",
              state: "completed",
              requestedAt: "x",
            },
          ],
        }),
      ),
      on("POST", "/v1/teams/team_1/agents/agt_1/snapshots", () =>
        json(
          {
            id: "snap_2",
            agentId: "agt_1",
            reason: "manual",
            state: "requested",
            requestedAt: "x",
          },
          202,
        ),
      ),
      on("GET", "/v1/agent-templates", () =>
        json({
          items: [
            { name: "t", harness: "h", enabled: true, currentDigest: "d", allowedDigests: ["d"] },
          ],
        }),
      ),
      on("GET", "/v1/storage-classes", () =>
        json({ items: [{ name: "gp3", enabled: true, volumeType: "gp3" }] }),
      ),
    );
    const sdk = new SdkAgents(client);
    expect((await sdk.snapshots("team_1", "agt_1"))[0]?.id).toBe("snap_1");
    expect((await sdk.createSnapshot("team_1", "agt_1", "before upgrade")).state).toBe("requested");
    expect((await sdk.templates())[0]?.name).toBe("t");
    expect((await sdk.storageClasses())[0]?.name).toBe("gp3");
  });

  it("maps a refused image to a validation error on the image field", async () => {
    const { client } = fakeApi(
      on("POST", "/v1/teams/team_1/agents", () =>
        json(
          {
            code: "ValidationError",
            message: "bad",
            requestId: "r",
            details: { fields: [{ field: "image", message: "Tags are not accepted" }] },
          },
          400,
        ),
      ),
    );
    const e = await new SdkAgents(client)
      .create("team_1", { name: "a", template: "t", image: "i:latest", modelId: "m" })
      .catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).fields.image).toBe("Tags are not accepted");
  });
});
