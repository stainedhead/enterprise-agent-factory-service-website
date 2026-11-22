import { describe, expect, it } from "vitest";
import { SdkSwarmTemplates } from "./swarmTemplates.js";
import { SdkTeamDirectory } from "./teamDirectory.js";
import { fakeApi, json, on } from "./testing.js";
import { SdkWorkOrders } from "./workOrders.js";

const wire = {
  id: "wo_1",
  kind: "cve_remediation",
  severity: "high",
  title: "Patch",
  cveId: "CVE-2026-1",
  templateId: "swt_1",
  budgetUsd: "500.00",
  slaDueAt: "2026-11-28T18:00:00Z",
  status: "open",
  slaState: "on_track",
  progress: {
    repos: 1,
    prsOpen: 0,
    prsMerged: 0,
    notAffected: 0,
    failedOrSkipped: 0,
    remaining: 1,
  },
  teamId: null,
  version: 2,
};
const repo = {
  host: "github.com",
  repo: "acme/api",
  status: "pending",
  owningTeamId: "team_1",
  ownerSource: "team_config",
  notifications: [{ kind: "assigned", recipient: "a@b.co", sentAt: "2026-11-21T18:00:00Z" }],
  version: 4,
};

describe("SdkWorkOrders (M6-W1)", () => {
  it("lists with the filters and stops at the limit", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/work-orders", () => json({ items: [wire, { ...wire, id: "wo_2" }] })),
    );
    const out = await new SdkWorkOrders(client).list(
      { status: "open", severity: "high", slaState: "due_soon", teamId: "team_1" },
      1,
    );
    expect(out.map((w) => w.id)).toEqual(["wo_1"]);
    const q = (calls[0] as NonNullable<(typeof calls)[number]>).query;
    expect([q.get("status"), q.get("severity"), q.get("slaState"), q.get("teamId")]).toEqual([
      "open",
      "high",
      "due_soon",
      "team_1",
    ]);
  });
  it("creates with owners, gets with repositories, cancels with a reason", async () => {
    const { client, calls } = fakeApi(
      on("POST", "/v1/work-orders", () => json({ ...wire, repos: [repo] }, 201)),
      on("GET", "/v1/work-orders/wo_1", () => json({ ...wire, repos: [repo] })),
      on("POST", "/v1/work-orders/wo_1:cancel", () => json({ ...wire, status: "cancelled" })),
    );
    const port = new SdkWorkOrders(client);
    const made = await port.create({
      kind: "cve_remediation",
      cveId: "CVE-2026-1",
      severity: "high",
      title: "Patch",
      slaDueAt: "2026-11-28T18:00:00Z",
      templateId: "swt_1",
      budgetUsd: "500.00",
      repos: [
        { host: "github.com", repo: "acme/api", owningTeamId: "team_1", owningContact: "a@b.co" },
      ],
    });
    expect(made.repos[0]).toMatchObject({
      ownerSource: "team_config",
      notifications: [{ recipient: "a@b.co" }],
    });
    const body = calls.find((c) => c.method === "POST")?.body as { repos: unknown[] };
    expect(body.repos[0]).toEqual({
      host: "github.com",
      repo: "acme/api",
      owningTeamId: "team_1",
      owningContact: "a@b.co",
    });
    expect((await port.get("wo_1")).repos).toHaveLength(1);
    expect((await port.cancel("wo_1", "dup")).status).toBe("cancelled");
  });
  it("lists the team's work orders, updates with If-Match, lists and updates repositories", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/team_1/work-orders", () => json({ items: [wire] })),
      on("PATCH", "/v1/work-orders/wo_1", () => json(wire)),
      on("GET", "/v1/work-orders/wo_1/repos", () => json({ items: [repo] })),
      on("PATCH", "/v1/work-orders/wo_1/repos/github.com/acme/api", () =>
        json({ ...repo, status: "pr_opened" }),
      ),
    );
    const port = new SdkWorkOrders(client);
    expect((await port.listForTeam("team_1", { maxResults: 5 })).items).toHaveLength(1);
    await port.update(
      { id: "wo_1", version: 2 },
      {
        title: "New",
        budgetUsd: "10.00",
        slaDueAt: "2026-12-01T00:00:00Z",
        addRepos: [{ host: "h", repo: "o/r" }],
      },
    );
    expect(calls.find((c) => c.method === "PATCH")?.headers.get("if-match")).toBe('"2"');
    expect(await port.repos("wo_1")).toHaveLength(1);
    const r = await port.updateRepo(
      "wo_1",
      { ...repo, notifications: [] },
      { status: "pr_opened", prUrl: "https://x/y", prNumber: 3, detail: "ok" },
    );
    expect(r.status).toBe("pr_opened");
    expect(
      calls
        .filter((c) => c.method === "PATCH")
        .pop()
        ?.headers.get("if-match"),
    ).toBe('"4"');
  });
  it("maps a refused create to an app error with its details", async () => {
    const { client } = fakeApi(
      on("POST", "/v1/work-orders", () =>
        json(
          {
            code: "ValidationError",
            message: "owners",
            requestId: "r1",
            details: { unownedRepos: ["github.com/a/b"] },
          },
          400,
        ),
      ),
    );
    await expect(
      new SdkWorkOrders(client).create({
        kind: "general",
        severity: "low",
        title: "t",
        slaDueAt: "2026-11-28T18:00:00Z",
        templateId: "swt_1",
        repos: [{ host: "h", repo: "o/r" }],
      }),
    ).rejects.toMatchObject({ kind: "validation", details: { unownedRepos: ["github.com/a/b"] } });
  });
});

describe("SdkTeamDirectory and SdkSwarmTemplates (M6-W1)", () => {
  it("lists the directory", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/team-directory", () =>
        json({ items: [{ id: "team_1", slug: "payments", displayName: "Payments" }] }),
      ),
    );
    expect(await new SdkTeamDirectory(client).list()).toEqual([
      { id: "team_1", slug: "payments", displayName: "Payments" },
    ]);
  });
  it("maps a refused directory read", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/team-directory", () =>
        json({ code: "AccessDenied", message: "no", requestId: "r" }, 403),
      ),
    );
    await expect(new SdkTeamDirectory(client).list()).rejects.toMatchObject({
      isAccessDenied: true,
    });
  });
  it("lists swarm templates", async () => {
    const t = {
      id: "swt_1",
      name: "cve",
      kind: "cve_remediation",
      spec: { stages: [], pools: [] },
      budgetUsd: "1.00",
      ttlHours: 1,
      teardownRule: "at_expiry",
      enabled: true,
      version: 1,
    };
    const { client } = fakeApi(on("GET", "/v1/admin/swarm-templates", () => json({ items: [t] })));
    expect((await new SdkSwarmTemplates(client).list())[0]).toMatchObject({
      id: "swt_1",
      enabled: true,
    });
  });
  it("maps a refused template read", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/admin/swarm-templates", () =>
        json({ code: "AccessDenied", message: "no", requestId: "r" }, 403),
      ),
    );
    await expect(new SdkSwarmTemplates(client).list()).rejects.toMatchObject({
      isAccessDenied: true,
    });
  });
});

describe("SdkSwarmTemplates writes (M6-T1)", () => {
  const wire = {
    id: "swt_1",
    name: "cve",
    kind: "cve_remediation",
    spec: { stages: [{ name: "a" }], pools: [{ name: "b" }] },
    budgetUsd: "500.00",
    ttlHours: 72,
    teardownRule: "at_expiry",
    enabled: false,
    version: 2,
  };
  it("creates, gets, updates with If-Match, enables, disables and deletes", async () => {
    const { client, calls } = fakeApi(
      on("POST", "/v1/admin/swarm-templates", () => json(wire, 201)),
      on("GET", "/v1/admin/swarm-templates/swt_1", () => json(wire)),
      on("PATCH", "/v1/admin/swarm-templates/swt_1", () => json({ ...wire, version: 3 })),
      on("POST", "/v1/admin/swarm-templates/swt_1:enable", () => json({ ...wire, enabled: true })),
      on("POST", "/v1/admin/swarm-templates/swt_1:disable", () => json(wire)),
      on("DELETE", "/v1/admin/swarm-templates/swt_1", () => json({}, 204)),
    );
    const port = new SdkSwarmTemplates(client);
    const made = await port.create({
      name: "cve",
      kind: "cve_remediation",
      description: "d",
      budgetUsd: "500.00",
      ttlHours: 72,
      teardownRule: "at_expiry",
      enabled: false,
      spec: wire.spec,
    });
    expect(made.id).toBe("swt_1");
    expect((await port.get("swt_1")).name).toBe("cve");
    const upd = await port.update(
      { id: "swt_1", version: 2 },
      {
        description: "x",
        budgetUsd: "600.00",
        ttlHours: 96,
        teardownRule: "at_cap_or_expiry",
        spec: wire.spec,
      },
    );
    expect(upd.version).toBe(3);
    expect(calls.find((c) => c.method === "PATCH")?.headers.get("if-match")).toBe('"2"');
    expect((await port.enable("swt_1")).enabled).toBe(true);
    expect((await port.disable("swt_1")).enabled).toBe(false);
    await port.delete({ id: "swt_1", version: 3 });
    expect(calls.find((c) => c.method === "DELETE")?.headers.get("if-match")).toBe('"3"');
  });
  it("maps a delete refused while a work order uses the template", async () => {
    const { client } = fakeApi(
      on("DELETE", "/v1/admin/swarm-templates/swt_1", () =>
        json(
          { code: "Conflict", message: "An open work order uses it", requestId: "r", details: {} },
          409,
        ),
      ),
    );
    await expect(
      new SdkSwarmTemplates(client).delete({ id: "swt_1", version: 2 }),
    ).rejects.toMatchObject({
      kind: "conflict",
    });
  });
});
