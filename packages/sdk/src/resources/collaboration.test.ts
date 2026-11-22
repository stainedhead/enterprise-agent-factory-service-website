import { describe, expect, it } from "vitest";
import { apiKey } from "../core/auth.js";
import { AfsClient } from "../core/client.js";
import { CollaborationReason, FieldReason } from "../core/reasons.js";
import { metaOf } from "../core/types.js";
import { createAfs } from "../generated/index.js";
import { fakeFetch } from "../testing/fakeFetch.js";
import { createCollaboration } from "./collaboration.js";

const resource = (over: Record<string, unknown> = {}) => ({
  teamId: "team_1",
  agentId: "agt_1",
  version: 4,
  generation: 6,
  hostname: "payments.collab.example.com",
  webUiEnabled: true,
  restApiEnabled: false,
  webUiUrl: "https://payments.collab.example.com",
  restApiUrl: "https://payments.collab.example.com/api",
  registrationMode: "manual",
  effective: { webUi: true, restApi: false, reasons: [] },
  status: { phase: "Ready", observedGeneration: 6, conditions: [] },
  unmanagedPaperclipAgents: [],
  ...over,
});

const mk = (f: ReturnType<typeof fakeFetch>) =>
  createAfs({
    endpoint: "https://x",
    fetch: f.fetch,
    auth: apiKey("afsk_k"),
    retry: { sleep: async () => {} },
  });
const core = (f: ReturnType<typeof fakeFetch>) =>
  new AfsClient({ endpoint: "https://x", fetch: f.fetch, auth: apiKey("afsk_k") });

describe("collaboration resource (WEB-US-43)", () => {
  it("put sends If-Match from the resource version", async () => {
    const f = fakeFetch().on("PUT /v1/teams/team_1/collaboration", {
      body: resource({ version: 5 }),
    });
    await mk(f).collaboration.put(
      { id: "team_1", version: 4 },
      { webUiEnabled: true, restApiEnabled: false },
    );
    expect(f.requests[0]?.path).toBe("/v1/teams/team_1/collaboration");
    expect(f.requests[0]?.headers.get("If-Match")).toBe('"4"');
    expect(f.requests[0]?.body).toEqual({ webUiEnabled: true, restApiEnabled: false });
  });
  it("put given only an id reads first and records appliedToVersion", async () => {
    const f = fakeFetch()
      .on("GET /v1/teams/team_1/collaboration", { body: resource({ version: 7 }) })
      .on("PUT /v1/teams/team_1/collaboration", { body: resource({ version: 8 }) });
    const r = await mk(f).collaboration.put("team_1", {
      webUiEnabled: false,
      restApiEnabled: false,
    });
    expect(f.requests.map((x) => x.method)).toEqual(["GET", "PUT"]);
    expect(f.requests[1]?.headers.get("If-Match")).toBe('"7"');
    expect(metaOf(r)?.appliedToVersion).toBe(7);
  });
  it("a 412 throws an AfsError with isPreconditionFailed", async () => {
    const f = fakeFetch().on("PUT /v1/teams/team_1/collaboration", {
      status: 412,
      body: { code: "PreconditionFailed", message: "stale", requestId: "r" },
    });
    await expect(
      mk(f).collaboration.put(
        { id: "team_1", version: 1 },
        { webUiEnabled: true, restApiEnabled: true },
      ),
    ).rejects.toMatchObject({ isPreconditionFailed: true });
  });
  it("connectAgent reuses the idempotency key across retries", async () => {
    const f = fakeFetch().on("POST /v1/teams/team_1/collaboration/links/agt_2:connect", [
      { status: 503, body: { code: "Unavailable", message: "x", requestId: "r" } },
      {
        body: { agentId: "agt_2", agentName: "a", connect: true, linkState: "pending", version: 1 },
        headers: { "Idempotent-Replayed": "true" },
      },
    ]);
    const l = await mk(f).collaboration.connectAgent("team_1", "agt_2", {
      paperclipAgentId: "ag_8f2a41",
    });
    expect(f.requests[0]?.body).toEqual({ paperclipAgentId: "ag_8f2a41" });
    const keys = f.requests.map((r) => r.headers.get("Idempotency-Key"));
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
    expect(metaOf(l)?.idempotentReplayed).toBe(true);
  });
  it("disconnectAgent and rotateKeys carry an idempotency key", async () => {
    const f = fakeFetch()
      .on("POST /v1/teams/team_1/collaboration/links/agt_2:disconnect", {
        body: {
          agentId: "agt_2",
          agentName: "a",
          connect: false,
          linkState: "disabled",
          version: 2,
        },
      })
      .on("POST /v1/teams/team_1/collaboration:rotate-keys", {
        body: {
          rotated: [{ name: "paperclip-better-auth-secret", secretId: "s", versionId: "v" }],
          signsOutEveryone: true,
          agentRolloutPending: true,
        },
      });
    const afs = mk(f);
    await afs.collaboration.disconnectAgent("team_1", "agt_2");
    const r = await afs.collaboration.rotateKeys("team_1", {
      names: ["paperclip-better-auth-secret"],
    });
    expect(r.signsOutEveryone).toBe(true);
    expect(f.requests[0]?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(f.requests[1]?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(f.requests[1]?.body).toEqual({ names: ["paperclip-better-auth-secret"] });
  });
  it("links.list sends linkState and follows nextToken", async () => {
    const f = fakeFetch().on("GET /v1/teams/team_1/collaboration/links", (req) =>
      req.query.get("nextToken") === "p2"
        ? { body: { items: [{ agentId: "b" }] } }
        : { body: { items: [{ agentId: "a" }], nextToken: "p2" } },
    );
    const seen: string[] = [];
    for await (const l of mk(f).collaboration.links.list("team_1", { linkState: "pending" }))
      seen.push(l.agentId);
    expect(seen).toEqual(["a", "b"]);
    expect(f.requests).toHaveLength(2);
    expect(f.requests[0]?.query.get("linkState")).toBe("pending");
  });
  it("admin.collaborationEndpoints.list asCsv sends Accept text/csv with one header row", async () => {
    const f = fakeFetch().on("GET /v1/admin/collaboration-endpoints", (req) =>
      req.query.get("nextToken") === "p2"
        ? { text: "team,state\r\nb,Ready\r\n", headers: { "Content-Type": "text/csv" } }
        : {
            text: "team,state\r\na,Ready\r\n",
            headers: { "Content-Type": "text/csv", "X-Afs-Next-Token": "p2" },
          },
    );
    const csv = await mk(f).admin.collaborationEndpoints.list({ state: "Ready" }).asCsv();
    expect(csv).toBe("team,state\r\na,Ready\r\nb,Ready\r\n");
    expect(f.requests[0]?.headers.get("Accept")).toBe("text/csv");
    expect(f.requests[0]?.query.get("state")).toBe("Ready");
  });
  it("types allow null hostname and urls", async () => {
    const f = fakeFetch().on("GET /v1/teams/team_1/collaboration", {
      body: resource({
        hostname: null,
        webUiUrl: null,
        restApiUrl: null,
        effective: { webUi: false, restApi: false, reasons: ["base_domain_unset"] },
      }),
    });
    const c = await mk(f).collaboration.get("team_1");
    expect(c.hostname).toBeNull();
    expect(c.effective.reasons).toEqual(["base_domain_unset"]);
  });
});

describe("endpointUrl (SDK-14)", () => {
  it("returns nulls when nothing is effective, with one GET", async () => {
    const f = fakeFetch().on("GET /v1/teams/team_1/collaboration", {
      body: resource({
        hostname: null,
        webUiUrl: null,
        restApiUrl: null,
        effective: { webUi: false, restApi: false, reasons: ["base_domain_unset"] },
      }),
    });
    expect(await createCollaboration(core(f)).endpointUrl("team_1")).toEqual({
      webUi: null,
      restApi: null,
      hostname: null,
    });
    expect(f.requests).toHaveLength(1);
  });
  it("returns only effective surfaces", async () => {
    const f = fakeFetch().on("GET /v1/teams/team_1/collaboration", { body: resource() });
    expect(await createCollaboration(core(f)).endpointUrl("team_1")).toEqual({
      webUi: "https://payments.collab.example.com",
      restApi: null,
      hostname: "payments.collab.example.com",
    });
    expect(f.requests).toHaveLength(1);
  });
  it("never carries a paperclip key: it takes only a team id and sends no body or key header", async () => {
    const f = fakeFetch().on("GET /v1/teams/team_1/collaboration", { body: resource() });
    const c = createCollaboration(core(f));
    expect(c.endpointUrl.length).toBeLessThanOrEqual(2);
    await c.endpointUrl("team_1");
    const h = f.requests[0]?.headers;
    expect(h?.get("X-Afs-Authorization")).toBeNull();
    expect(f.requests[0]?.bodyText).toBe("");
  });
});

describe("no secret in diagnostics (WEB-US-47)", () => {
  it("rotateKeys debug events carry no body and errors carry no key", async () => {
    const events: unknown[] = [];
    const f = fakeFetch().on("POST /v1/teams/team_1/collaboration:rotate-keys", {
      status: 409,
      body: {
        code: "Conflict",
        message: "team is suspended pk-SENTINEL",
        requestId: "r",
        details: { reason: "team_suspended" },
      },
    });
    const afs = createAfs({
      endpoint: "https://x",
      fetch: f.fetch,
      auth: apiKey("afsk_k"),
      onDebug: (e: unknown) => void events.push(e),
    } as never);
    const err = await afs.collaboration.rotateKeys("team_1", {}).catch((e) => e);
    expect(err.isConflict).toBe(true);
    expect(err.details.reason).toBe(CollaborationReason.TeamSuspended);
    const dump = JSON.stringify([events, err.toJSON()]);
    expect(dump).not.toContain("afsk_k");
    expect(dump).not.toContain("X-Afs-Authorization");
  });
  it("exports the reason constants as the contract's strings", () => {
    expect(CollaborationReason.AgentExists).toBe("collaboration_agent_exists");
    expect(CollaborationReason.AgentMissing).toBe("collaboration_agent_missing");
    expect(CollaborationReason.ManagedSecret).toBe("managed_secret");
    expect(CollaborationReason.HostnameHeld).toBe("hostname_held");
    expect(CollaborationReason.MasterKeyNotRotatable).toBe("master_key_not_rotatable");
    expect(CollaborationReason.ReservedName).toBe("reserved_name");
    expect(CollaborationReason.ManagedRegistration).toBe("managed_registration");
    expect(FieldReason.BaseDomainUnset).toBe("collab_base_domain_unset");
    expect(FieldReason.PublicEndpointsOff).toBe("collab_public_endpoints_off");
    expect(FieldReason.NotAllowedForTeam).toBe("collaboration_not_allowed_for_team");
    expect(FieldReason.ProviderWithoutCollabClient).toBe("provider_without_collab_client");
    expect(FieldReason.AgentNotReady).toBe("collaboration_agent_not_ready");
  });
});
