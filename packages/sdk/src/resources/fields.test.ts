// WEB-US-46: fields added to existing resources by contract v1.3.1.
import { describe, expect, expectTypeOf, it } from "vitest";
import { apiKey } from "../core/auth.js";
import {
  type Agent,
  type ApiKey,
  createAfs,
  type IdentityProvider,
  type Member,
  type Secret,
  type SignInProvider,
  type UpdateAgentRequest,
} from "../generated/index.js";
import { fakeFetch } from "../testing/fakeFetch.js";
import { createReports } from "./reports.js";

const mk = (f: ReturnType<typeof fakeFetch>) =>
  createAfs({ endpoint: "https://x", fetch: f.fetch, auth: apiKey("afsk_k") });

describe("fields on existing resources (SDK-13)", () => {
  it("agents: role and collaboration on create, role filter on list", async () => {
    const f = fakeFetch()
      .on("POST /v1/teams/t/agents", { status: 201, body: { id: "agt_1", role: "collaboration" } })
      .on("GET /v1/teams/t/agents", { body: { items: [] } });
    const afs = mk(f);
    await afs.agents.create("t", {
      name: "hub",
      role: "collaboration",
      template: "paperclip-hub",
      iamIdentity: "dedicated",
      volume: { snapshotSchedule: "daily", snapshotRetain: 14 },
    } as never);
    expect(f.requests[0]?.body).toMatchObject({ role: "collaboration", iamIdentity: "dedicated" });
    for await (const _ of afs.agents.list("t", { role: "collaboration" })) void _;
    expect(f.requests[1]?.query.get("role")).toBe("collaboration");
    expectTypeOf<UpdateAgentRequest>().not.toHaveProperty("role");
    const a: Agent["collaboration"] = {
      connect: true,
      linkState: "linked",
      paperclipAgentId: "ag_1",
    };
    expect(a?.linkState).toBe("linked");
  });
  it("teams: mayExposeCollaboration on create and update", async () => {
    const f = fakeFetch()
      .on("POST /v1/teams", {
        status: 201,
        body: { id: "t", version: 1, mayExposeCollaboration: true },
      })
      .on("PATCH /v1/teams/t", { body: { id: "t", version: 2, mayExposeCollaboration: false } });
    const afs = mk(f);
    await afs.teams.create({ mayExposeCollaboration: true } as never);
    await afs.teams.update({ id: "t", version: 1 }, { mayExposeCollaboration: false });
    expect(f.requests[0]?.body).toMatchObject({ mayExposeCollaboration: true });
    expect(f.requests[1]?.body).toMatchObject({ mayExposeCollaboration: false });
  });
  it("secrets: managedBy filter and open union", async () => {
    const f = fakeFetch().on("GET /v1/teams/t/secrets", {
      body: { items: [{ id: "s", managedBy: "future" }] },
    });
    const items: Secret[] = [];
    for await (const s of mk(f).secrets.list("t", { managedBy: "paperclip" })) items.push(s);
    expect(f.requests[0]?.query.get("managedBy")).toBe("paperclip");
    expect(items[0]?.managedBy).toBe("future");
    const m: Secret["managedBy"] = "paperclip";
    expect(m).toBe("paperclip");
  });
  it("agent templates: capabilities and the capability filter", async () => {
    const f = fakeFetch()
      .on("GET /v1/agent-templates", {
        body: { items: [{ name: "hub", capabilities: ["paperclip"] }] },
      })
      .on("PUT /v1/admin/agent-templates/hub", {
        body: { name: "hub", capabilities: ["paperclip"] },
      });
    const afs = mk(f);
    for await (const t of afs.agentTemplates.list({ capability: "paperclip" })) {
      expect(t.capabilities).toEqual(["paperclip"]);
    }
    expect(f.requests[0]?.query.get("capability")).toBe("paperclip");
    await afs.admin.agentTemplates.put({ name: "hub", version: 1 }, {
      capabilities: ["paperclip"],
    } as never);
    expect(f.requests[1]?.body).toMatchObject({ capabilities: ["paperclip"] });
  });
  it("identity providers: collab client fields; sign-in providers have none", async () => {
    const f = fakeFetch().on("POST /v1/admin/identity-providers", {
      status: 201,
      body: { id: "idp", collabClientId: "c" },
    });
    await mk(f).admin.identityProviders.create({
      collabClientId: "c",
      collabClientSecretArn: "arn:aws:secretsmanager:x",
    } as never);
    expect(f.requests[0]?.body).toMatchObject({ collabClientId: "c" });
    expectTypeOf<IdentityProvider>().toHaveProperty("collabClientId");
    expectTypeOf<SignInProvider>().not.toHaveProperty("collabClientId");
    expectTypeOf<SignInProvider>().not.toHaveProperty("collabClientSecretArn");
  });
  it("team_collaborator is a member and api key role", () => {
    expectTypeOf<"team_collaborator">().toExtend<Member["role"]>();
    expectTypeOf<"team_collaborator">().toExtend<ApiKey["role"]>();
    expect(true).toBe(true);
  });
  it("swarm templates carry spec.collaboration", async () => {
    const f = fakeFetch().on("POST /v1/admin/swarm-templates", {
      status: 201,
      body: { id: "swt", spec: { collaboration: { templateId: "paperclip-hub" } } },
    });
    const t = await mk(f).swarmTemplates.create({
      spec: { collaboration: { templateId: "paperclip-hub" } },
    } as never);
    expect(f.requests[0]?.body).toMatchObject({
      spec: { collaboration: { templateId: "paperclip-hub" } },
    });
    expect(
      (t as { spec?: { collaboration?: { templateId: string } } }).spec?.collaboration?.templateId,
    ).toBe("paperclip-hub");
  });
});

describe("collaboration report (SDK-13)", () => {
  const body = {
    kind: "collaboration",
    groupBy: ["day", "person"],
    range: { from: "2026-11-14T00:00:00Z", to: "2026-11-21T00:00:00Z" },
    rows: [
      {
        day: "2026-11-20",
        signIns: 5,
        requests: 40,
        deniedRequests: 1,
        principal: { id: "usr_1", type: "user", name: "dana.ortiz" },
        serviceAdminEntry: true,
      },
    ],
    totals: {
      signIns: 64,
      uniquePeople: 11,
      requests: 100,
      deniedRequests: 3,
      secretDetections: 0,
    },
    notes: [],
  };
  it("team and service kinds with surface, reason and person groupings", async () => {
    const f = fakeFetch()
      .on("GET /v1/teams/t1/reports/collaboration", { body })
      .on("GET /v1/reports/collaboration", { body });
    const reports = createReports(
      createAfs({ endpoint: "https://x", fetch: f.fetch, auth: apiKey("afsk_k") }).core,
    );
    const r = await reports.team("t1", "collaboration", {
      range: "7d",
      groupBy: ["day", "person"],
    });
    expect(f.requests[0]?.query.get("groupBy")).toBe("day,person");
    expect(r.totals.signIns).toBe(64);
    await reports.service("collaboration", { groupBy: ["surface", "reason"] });
    expect(f.requests[1]?.query.get("groupBy")).toBe("surface,reason");
  });
  it("asCsv returns the body unchanged", async () => {
    const f = fakeFetch().on("GET /v1/reports/collaboration", {
      text: "team,signIns\r\na,1\r\n",
      headers: { "Content-Type": "text/csv" },
    });
    const reports = createReports(
      createAfs({ endpoint: "https://x", fetch: f.fetch, auth: apiKey("afsk_k") }).core,
    );
    expect(await reports.service("collaboration", { groupBy: "team" }).asCsv()).toBe(
      "team,signIns\r\na,1\r\n",
    );
  });
});
