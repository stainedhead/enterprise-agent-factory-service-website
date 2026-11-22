import { describe, expect, it } from "vitest";
import { AppError } from "../../application/errors.js";
import { SdkTeams } from "./teams.js";
import { fakeApi, json, on } from "./testing.js";

const status = {
  phase: "Ready",
  observedGeneration: 1,
  conditions: [],
  updatedAt: "2026-11-21T00:00:00Z",
};
const team = (over: Record<string, unknown> = {}) => ({
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

describe("SdkTeams (M1-T1)", () => {
  it("lists one page with filters and the token", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams", () => json({ items: [team()], nextToken: "n2" })),
    );
    const page = await new SdkTeams(client).list({
      maxResults: 25,
      state: "active",
      kind: "persistent",
      nextToken: "n1",
    });
    expect(page.items).toHaveLength(1);
    expect(page.nextToken).toBe("n2");
    expect(calls[0]?.query.get("state")).toBe("active");
    expect(calls[0]?.query.get("kind")).toBe("persistent");
    expect(calls[0]?.query.get("nextToken")).toBe("n1");
    expect(calls[0]?.query.get("maxResults")).toBe("25");
  });

  it("updates with If-Match from the held version and sends guardrail and override fields", async () => {
    const { client, calls } = fakeApi(
      on("PATCH", "/v1/teams/team_1", () => json(team({ version: 4 }))),
    );
    const t = await new SdkTeams(client).update(
      { id: "team_1", version: 3 },
      {
        maxBudgetUsd: "200.00",
        ceilingOverrideUsd: "300.00",
        ceilingOverrideExpiresAt: "2026-12-01T00:00:00Z",
        ceilingOverrideReason: "launch",
        viewerKubectl: true,
        displayName: "A",
      },
    );
    expect(t.version).toBe(4);
    expect(calls[0]?.headers.get("If-Match")).toBe('"3"');
    expect(calls[0]?.body).toEqual({
      displayName: "A",
      maxBudgetUsd: "200.00",
      ceilingOverrideUsd: "300.00",
      ceilingOverrideExpiresAt: "2026-12-01T00:00:00Z",
      ceilingOverrideReason: "launch",
      viewerKubectl: true,
    });
  });

  it("creates a team with every field the draft holds", async () => {
    const { client, calls } = fakeApi(on("POST", "/v1/teams", () => json(team(), 201)));
    await new SdkTeams(client).create({
      displayName: "Alpha",
      slug: "alpha",
      kind: "persistent",
      maxBudgetUsd: "100.00",
      costCenter: "CC",
      models: ["m1"],
      tags: [{ key: "env", value: "prod" }],
      budget: { amountUsd: "100.00", thresholds: [50] },
      firstAdmin: { subjectType: "user", email: "a@b.co" },
      ownerEmail: "o@b.co",
      description: "d",
      identityProviderId: "idp_1",
      isolationTier: "dedicated",
      viewerKubectl: true,
      mayAddExternalSystems: true,
      mayManageAwsAccounts: true,
      expiresAt: "2026-12-01T00:00:00Z",
      teardownRule: "at_expiry",
    });
    expect(calls[0]?.body).toMatchObject({
      slug: "alpha",
      budget: { thresholds: [50] },
      firstAdmin: { email: "a@b.co" },
      models: ["m1"],
    });
    expect(calls[0]?.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("delete, suspend, resume, status, models and tags map to their operations", async () => {
    const { client, calls } = fakeApi(
      on("DELETE", "/v1/teams/team_1", () => json(team({ state: "deleting" }), 202)),
      on("POST", "/v1/teams/team_1:suspend", () => json(team({ state: "suspended" }))),
      on("POST", "/v1/teams/team_1:resume", () => json(team())),
      on("GET", "/v1/teams/team_1/status", () =>
        json({ id: "team_1", kind: "team", generation: 1, status }),
      ),
      on("GET", "/v1/teams/team_1/models", () =>
        json({
          items: [
            {
              id: "m",
              displayName: "M",
              provider: "p",
              enabled: true,
              contextWindow: 1,
              maxOutputTokens: 1,
            },
          ],
        }),
      ),
      on("PUT", "/v1/teams/team_1/models", () => json({ items: [] })),
      on("GET", "/v1/teams/team_1/tags", () =>
        json({ tags: [{ key: "env", source: "team", value: "prod" }], version: 2 }),
      ),
      on("PUT", "/v1/teams/team_1/tags", () => json({ tags: [], version: 3 })),
    );
    const s = new SdkTeams(client);
    expect((await s.delete({ id: "team_1", version: 3 })).state).toBe("deleting");
    expect((await s.suspend("team_1")).state).toBe("suspended");
    expect((await s.resume("team_1")).state).toBe("active");
    expect((await s.status("team_1")).phase).toBe("Ready");
    expect((await s.models("team_1"))[0]?.id).toBe("m");
    await s.putModels({ id: "team_1", version: 1 }, ["m"]);
    expect((await s.tags("team_1")).tags).toHaveLength(1);
    await s.putTags({ id: "team_1", version: 2 }, [{ key: "env", value: "x" }]);
    expect(calls.find((c) => c.method === "PUT" && c.path.endsWith("/models"))?.body).toEqual({
      modelIds: ["m"],
    });
  });

  it("reads the model catalog and service tags across pages", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/models", () =>
        json({
          items: [
            {
              id: "m",
              displayName: "M",
              provider: "p",
              enabled: true,
              contextWindow: 1,
              maxOutputTokens: 1,
            },
          ],
        }),
      ),
      on("GET", "/v1/admin/service-tags", () =>
        json({ items: [{ key: "env", mode: "required", allowedValues: ["prod"] }] }),
      ),
    );
    const s = new SdkTeams(client);
    expect((await s.catalogModels()).map((m) => m.id)).toEqual(["m"]);
    expect((await s.serviceTags())[0]?.allowedValues).toEqual(["prod"]);
  });

  it("joins spend from one usage report grouped by team", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/reports/usage", () =>
        json({
          groupBy: ["team"],
          kind: "usage",
          notes: [],
          range: {},
          totals: {},
          rows: [{ team: "team_1", costUsd: "12.50", calls: 3 }, { team: 5 }],
        }),
      ),
    );
    expect(await new SdkTeams(client).spendByTeam()).toEqual({
      team_1: { costUsd: "12.50", calls: 3 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.query.get("groupBy")).toBe("team");
  });

  it("maps errors to AppError", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/teams/team_1", () =>
        json(
          {
            code: "AccessDenied",
            message: "no",
            requestId: "r1",
            details: { requiredPermission: "teams:read" },
          },
          403,
        ),
      ),
    );
    const e = await new SdkTeams(client).get("team_1").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e).toMatchObject({ kind: "access-denied", requiredPermission: "teams:read" });
  });
});
