// Team orchestration (API contract v1.4.0 §4.4d): the orchestration resource, its tool change, its links to worker
// agents, key rotation and the service-wide endpoint list. The fake holds no Paperclip content and no key.
import { TEAMS } from "./core.js";
import type { Fixture, FixtureContext, FixtureResponse } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-22T09:00:00Z";
const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
/** The collaboration agent of the first team and its six workers (the mockup T16 rows). */
export const HUB_AGENT_ID = `agt_${NS}0004`;
export const WORKER_IDS = {
  reviewer: `agt_${NS}0001`,
  triage: `agt_${NS}0002`,
  nightly: `agt_${NS}0003`,
  ledger: `agt_${NS}0005`,
  dependency: `agt_${NS}0006`,
  releaseNotes: `agt_${NS}0007`,
} as const;
export const BOOT_SECRET_NAMES = [
  "paperclip-better-auth-secret",
  "paperclip-tool-action-signing-secret",
  "paperclip-secrets-master-key",
] as const;

type Level = "off" | "private" | "public";
const RANK: Record<Level, number> = { off: 0, private: 1, public: 2 };

export interface CollabControl {
  baseDomain: string | null;
  publicEndpoints: boolean;
  privateEndpoints: boolean;
  /** The team's `maxCollaborationExposure` set by the service admin. */
  limit: Level;
  providerHasCollabClient: boolean;
  phase: string;
  registrationMode: "manual" | "managed";
  teamState: "active" | "suspended";
}

interface Collab {
  teamId: string;
  agentId: string;
  tool: "paperclip" | "buzz";
  webUi: Level;
  webApi: Level;
  version: number;
  generation: number;
  observed: number;
  /** Reads left before a pending change settles. */
  settleIn: number;
  unmanaged: string[];
}
interface Link {
  agentId: string;
  agentName: string;
  connect: boolean;
  linkState: string;
  paperclipAgentId?: string;
  lastSyncedAt?: string;
  lastError?: string;
  version: number;
  /** Reads left before `pending` becomes `linked`. */
  settleIn: number;
}

const defaults = (): CollabControl => ({
  baseDomain: "collab.example.com",
  publicEndpoints: true,
  privateEndpoints: true,
  limit: "public",
  providerHasCollabClient: true,
  phase: "Ready",
  registrationMode: "manual",
  teamState: "active",
});

let ctl = defaults();
let collabs = new Map<string, Collab>();
let links = new Map<string, Link[]>();
let held = new Set<string>();

const seed = (): void => {
  ctl = defaults();
  held = new Set();
  collabs = new Map([
    [
      TEAMS[0].id,
      {
        teamId: TEAMS[0].id,
        agentId: HUB_AGENT_ID,
        tool: "paperclip",
        webUi: "private",
        webApi: "off",
        version: 4,
        generation: 6,
        observed: 6,
        settleIn: 0,
        unmanaged: [],
      },
    ],
  ]);
  const l = (
    name: string,
    id: string,
    connect: boolean,
    linkState: string,
    extra: Partial<Link> = {},
  ): Link => ({
    agentId: id,
    agentName: name,
    connect,
    linkState,
    version: 1,
    settleIn: 0,
    ...extra,
  });
  links = new Map([
    [
      TEAMS[0].id,
      [
        l("reviewer", WORKER_IDS.reviewer, true, "linked", {
          paperclipAgentId: "ag_8f2a41",
          lastSyncedAt: "2026-11-22T09:57:00Z",
        }),
        l("ledger-maintainer", WORKER_IDS.ledger, true, "linked", {
          paperclipAgentId: "ag_3c77d0",
          lastSyncedAt: "2026-11-22T09:55:00Z",
        }),
        l("dependency-updater", WORKER_IDS.dependency, true, "pending", { settleIn: 2 }),
        l("release-notes-bot", WORKER_IDS.releaseNotes, true, "failed", {
          paperclipAgentId: "ag_91be05",
          lastSyncedAt: "2026-11-22T09:40:00Z",
          lastError: "Paperclip rejected the key (401)",
        }),
        l("triage", WORKER_IDS.triage, false, "disabled"),
        l("nightly", WORKER_IDS.nightly, false, "disabled"),
      ],
    ],
  ]);
};
seed();
export const resetCollaboration = seed;

/** Test-side control (a separate channel from the console): changes the service and team state. */
export const setCollabControl = (patch: Partial<CollabControl>): void => {
  ctl = { ...ctl, ...patch };
};
export const holdHostname = (slug: string): void => {
  held.add(slug);
};
export const isHostnameHeld = (slug: string): boolean => held.has(slug);

const teamSlug = (teamId: string): string => TEAMS.find((t) => t.id === teamId)?.slug ?? "new-team";

/** Called by CreateTeam's fake for a slug whose hostname is held; and by the agent fixture on a collaboration create. */
export const hasCollaboration = (teamId: string): boolean => collabs.has(teamId);

export const removeCollaborationFor = (teamId: string): void => {
  collabs.delete(teamId);
  links.delete(teamId);
};

/** The `collaboration` member of a worker agent, as `ListAgents` returns it. */
export const linkOf = (teamId: string, agentId: string): Json | undefined => {
  const k = links.get(teamId)?.find((x) => x.agentId === agentId);
  if (!k) return undefined;
  return {
    connect: k.connect,
    linkState: k.linkState,
    ...(k.paperclipAgentId ? { paperclipAgentId: k.paperclipAgentId } : {}),
    ...(k.lastSyncedAt ? { lastSyncedAt: k.lastSyncedAt } : {}),
    ...(k.lastError ? { lastError: k.lastError } : {}),
  };
};
/** A worker agent created with `collaboration.connect` gets a link row. */
export const addLink = (
  teamId: string,
  agentId: string,
  agentName: string,
  connect: boolean,
): void => {
  if (!collabs.has(teamId)) return;
  const list = links.get(teamId) ?? [];
  list.push({
    agentId,
    agentName,
    connect,
    linkState: connect ? "pending" : "disabled",
    version: 1,
    settleIn: connect ? 2 : 0,
  });
  links.set(teamId, list);
};

const err = (status: number, code: string, message: string, details?: Json): FixtureResponse => ({
  status,
  body: { code, message, requestId: `req_fake_${code.toLowerCase()}`, ...(details && { details }) },
});
const missing = (): FixtureResponse =>
  err(404, "NotFound", "This team has no orchestration agent", {
    reason: "orchestration_agent_pending",
  });
const suspended = (): FixtureResponse =>
  err(409, "Conflict", "Team is suspended", { reason: "team_suspended" });
const denied = (ctx: FixtureContext): FixtureResponse | undefined =>
  ctx.principal && ["viewer", "collaborator"].includes(ctx.principal.id)
    ? err(403, "AccessDenied", "Requires collaboration:manage", {
        requiredPermission: "collaboration:manage",
      })
    : undefined;

type Reason =
  | "tool_not_supported"
  | "team_limit"
  | "service_switch_public"
  | "service_switch_private"
  | "base_domain_unset"
  | "provider_without_collab_client";

/** The effective level of one surface and why it is lower than the stored exposure. */
const lower = (c: Collab, surface: "webUi" | "webApi"): { effective: Level; reasons: Reason[] } => {
  const reasons: Reason[] = [];
  if (c.tool === "buzz") return { effective: "off", reasons: ["tool_not_supported"] };
  let e: Level = c[surface];
  if (RANK[e] > RANK[ctl.limit]) {
    e = ctl.limit;
    reasons.push("team_limit");
  }
  if (e === "public" && !ctl.publicEndpoints) {
    e = "private";
    reasons.push("service_switch_public");
  }
  if (e === "private" && !ctl.privateEndpoints) {
    e = "off";
    reasons.push("service_switch_private");
  }
  if (e !== "off" && ctl.baseDomain === null) {
    e = "off";
    reasons.push("base_domain_unset");
  }
  if (surface === "webUi" && e !== "off" && !ctl.providerHasCollabClient) {
    e = "off";
    reasons.push("provider_without_collab_client");
  }
  return { effective: e, reasons };
};

const hostnameOf = (teamId: string): string | null =>
  ctl.baseDomain === null ? null : `${teamSlug(teamId)}.${ctl.baseDomain}`;

const phaseOf = (c: Collab): string => (c.observed < c.generation ? "Pending" : ctl.phase);

const condition = (type: string, status: string, reason: string, message: string) => ({
  type,
  status,
  reason,
  message,
  lastTransitionTime: ts,
});

const surfaceView = (c: Collab, surface: "webUi" | "webApi", path: string): Json => {
  const { effective, reasons } = lower(c, surface);
  const host = effective === "off" ? null : hostnameOf(c.teamId);
  return {
    supported: c.tool !== "buzz",
    exposure: c.tool === "buzz" ? "off" : c[surface],
    effective,
    reasons,
    hostname: host,
    url: host ? `https://${host}${path}` : null,
  };
};

const view = (c: Collab): Json => {
  const ui = lower(c, "webUi").effective;
  const api = lower(c, "webApi").effective;
  const serving = ui !== "off" || api !== "off";
  const ready = phaseOf(c) === "Ready";
  return {
    teamId: c.teamId,
    agentId: c.agentId,
    agentName: "orchestrator",
    version: c.version,
    generation: c.generation,
    createdAt: ts,
    createdBy: "usr_01JD2Q3R4S5T6V7W8X9Y0Z0001",
    updatedAt: ts,
    phase: phaseOf(c),
    tool: c.tool,
    toolVersion: c.tool === "paperclip" ? "2026.11.2" : "0.9.0",
    limit: ctl.limit,
    registrationMode: ctl.registrationMode,
    webUi: surfaceView(c, "webUi", "/"),
    webApi: surfaceView(c, "webApi", "/api"),
    connectedAgents: (links.get(c.teamId) ?? []).filter((k) => k.connect).length,
    unmanagedToolAgents: c.unmanaged,
    status: {
      phase: phaseOf(c),
      observedGeneration: c.observed,
      updatedAt: ts,
      conditions: [
        condition(
          "EndpointReady",
          serving ? "True" : "False",
          serving ? "Ready" : "NoSurface",
          serving ? "Endpoint is serving" : "No surface is served",
        ),
        condition(
          "ToolReady",
          ready ? "True" : "False",
          ready ? "Ready" : "NotReady",
          ready ? "The tool is up" : "Waiting",
        ),
        condition("RegistrationHealthy", "True", "Ready", "Agents register as configured"),
        condition(
          "UnmanagedToolAgents",
          c.unmanaged.length > 0 ? "True" : "False",
          c.unmanaged.length > 0 ? "Found" : "None",
          c.unmanaged.length > 0 ? "The tool has agents AFS does not manage" : "None found",
        ),
      ],
    },
  };
};

/** A read settles a pending change after two reads, so the console's polling sees Pending then Ready. */
const settle = (c: Collab): void => {
  if (c.observed < c.generation) {
    c.settleIn -= 1;
    if (c.settleIn <= 0) c.observed = c.generation;
  }
};

const invalidField = (field: string, reason: string, message: string): FixtureResponse =>
  err(400, "ValidationError", message, { fields: [{ field, reason, message }] });

const paged = <T>(items: T[], query: URLSearchParams): { items: T[]; nextToken?: string } => {
  const max = Math.min(Number(query.get("maxResults") ?? 50) || 50, 200);
  const start = Number(query.get("nextToken") ?? 0) || 0;
  const slice = items.slice(start, start + max);
  return start + max < items.length
    ? { items: slice, nextToken: String(start + max) }
    : { items: slice };
};

const linkView = (k: Link): Json => ({
  agentId: k.agentId,
  agentName: k.agentName,
  connect: k.connect,
  linkState: k.linkState,
  ...(k.paperclipAgentId ? { paperclipAgentId: k.paperclipAgentId } : {}),
  ...(k.lastSyncedAt ? { lastSyncedAt: k.lastSyncedAt } : {}),
  ...(k.lastError ? { lastError: k.lastError } : {}),
  version: k.version,
});

const endpointRows = (): Json[] =>
  [...collabs.values()].flatMap((c) =>
    (["webUi", "webApi"] as const)
      .filter((surface) => c[surface] !== "off")
      .map((surface) => {
        const e = lower(c, surface);
        return {
          teamId: c.teamId,
          slug: teamSlug(c.teamId),
          teamState: ctl.teamState,
          agentId: c.agentId,
          tool: c.tool,
          surface,
          exposure: c[surface],
          effective: e.effective,
          reasons: e.reasons,
          limit: ctl.limit,
          hostname: e.effective === "off" ? null : hostnameOf(c.teamId),
          phase: phaseOf(c),
          lastAccessAt: "2026-11-22T09:30:00Z",
        };
      }),
  );

export const collaborationFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/orchestration",
    response: ({ params }) => {
      const c = collabs.get(params.teamId ?? "");
      if (!c) return missing();
      const body = view(c);
      settle(c);
      return { status: 200, body };
    },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/orchestration",
    response: (ctx) => {
      const d = denied(ctx);
      if (d) return d;
      const c = collabs.get(ctx.params.teamId ?? "");
      if (!c) return missing();
      if (ctl.teamState === "suspended") return suspended();
      const b = ctx.body as {
        webUi?: { exposure?: Level };
        webApi?: { exposure?: Level };
        registrationMode?: string;
      };
      for (const surface of ["webUi", "webApi"] as const) {
        const want = b[surface]?.exposure;
        if (want && RANK[want] > RANK[ctl.limit])
          return invalidField(
            `${surface}.exposure`,
            "exposure_above_team_limit",
            `The team may expose at most ${ctl.limit}`,
          );
        if (want === "public" && ctl.baseDomain === null)
          return invalidField(
            `${surface}.exposure`,
            "collab_base_domain_unset",
            "Collaboration is not configured for the service",
          );
        if (want && want !== "off" && c.tool === "buzz")
          return invalidField(
            `${surface}.exposure`,
            "tool_not_supported",
            "This tool has no web surface",
          );
      }
      if (
        b.registrationMode === "managed" &&
        ctl.registrationMode !== "managed" &&
        ctl.phase !== "Ready"
      )
        return invalidField(
          "registrationMode",
          "collaboration_agent_not_ready",
          "The orchestration agent must be Ready",
        );
      if (b.registrationMode) ctl.registrationMode = b.registrationMode as "manual" | "managed";
      c.webUi = b.webUi?.exposure ?? c.webUi;
      c.webApi = b.webApi?.exposure ?? c.webApi;
      c.version += 1;
      c.generation += 1;
      c.settleIn = 2;
      return { status: 200, body: view(c) };
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/orchestration:change-tool",
    response: (ctx) => {
      const d = denied(ctx);
      if (d) return d;
      const c = collabs.get(ctx.params.teamId ?? "");
      if (!c) return missing();
      if (ctl.teamState === "suspended") return suspended();
      const tool = (ctx.body as { tool?: "paperclip" | "buzz" }).tool ?? c.tool;
      c.tool = tool;
      if (tool === "buzz") {
        c.webUi = "off";
        c.webApi = "off";
      }
      c.version += 1;
      c.generation += 1;
      c.settleIn = 2;
      return { status: 202, body: view(c) };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/collaboration/links",
    response: ({ params, query }) => {
      const teamId = params.teamId ?? "";
      if (!collabs.has(teamId)) return missing();
      let rows = links.get(teamId) ?? [];
      const state = query.get("linkState");
      const connect = query.get("connect");
      if (state) rows = rows.filter((r) => r.linkState === state);
      if (connect) rows = rows.filter((r) => String(r.connect) === connect);
      const out = paged(rows.map(linkView), query);
      for (const r of links.get(teamId) ?? [])
        if (r.linkState === "pending" && --r.settleIn <= 0) {
          r.linkState = "linked";
          r.lastSyncedAt = "2026-11-22T10:00:00Z";
          if (!r.paperclipAgentId && ctl.registrationMode === "managed")
            r.paperclipAgentId = "ag_managed";
        }
      return { status: 200, body: out };
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/collaboration/links/{agentId}:connect",
    response: (ctx) => {
      const d = denied(ctx);
      if (d) return d;
      const teamId = ctx.params.teamId ?? "";
      if (!collabs.has(teamId)) return missing();
      if (ctl.teamState === "suspended") return suspended();
      const k = links.get(teamId)?.find((x) => x.agentId === ctx.params.agentId);
      if (!k) return err(404, "NotFound", "Worker agent not found");
      const b = (ctx.body ?? {}) as { paperclipAgentId?: string };
      if (b.paperclipAgentId && ctl.registrationMode === "managed")
        return invalidField(
          "paperclipAgentId",
          "managed_registration",
          "AFS registers the agent in Paperclip and stores its key",
        );
      k.connect = true;
      k.linkState = "pending";
      k.settleIn = 2;
      k.version += 1;
      if (b.paperclipAgentId) k.paperclipAgentId = b.paperclipAgentId;
      return { status: 200, body: linkView(k) };
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/collaboration/links/{agentId}:disconnect",
    response: (ctx) => {
      const d = denied(ctx);
      if (d) return d;
      const teamId = ctx.params.teamId ?? "";
      if (!collabs.has(teamId)) return missing();
      if (ctl.teamState === "suspended") return suspended();
      const k = links.get(teamId)?.find((x) => x.agentId === ctx.params.agentId);
      if (!k) return err(404, "NotFound", "Worker agent not found");
      k.connect = false;
      k.linkState = "disabled";
      k.version += 1;
      return { status: 200, body: linkView(k) };
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/collaboration:rotate-keys",
    response: (ctx) => {
      const d = denied(ctx);
      if (d) return d;
      const teamId = ctx.params.teamId ?? "";
      if (!collabs.has(teamId)) return missing();
      if (ctl.teamState === "suspended") return suspended();
      const names = ((ctx.body as { names?: string[] } | undefined)?.names ?? [
        BOOT_SECRET_NAMES[0],
        BOOT_SECRET_NAMES[1],
      ]) as string[];
      if (names.includes("paperclip-secrets-master-key"))
        return err(
          400,
          "ValidationError",
          "Paperclip could no longer decrypt its stored identities",
          {
            reason: "master_key_not_rotatable",
            fields: [
              {
                field: "names",
                reason: "master_key_not_rotatable",
                message: "The master key cannot be rotated",
              },
            ],
          },
        );
      return {
        status: 200,
        body: {
          rotated: names.map((n, i) => ({
            name: n,
            secretId: `sec_${NS}${String(300 + i).padStart(4, "0")}`,
            versionId: `ver-${i + 1}`,
          })),
          signsOutEveryone: true,
          agentRolloutPending: true,
        },
      };
    },
  },
  {
    method: "GET",
    path: "/v1/admin/orchestration-endpoints",
    response: ({ query }) => {
      let rows = endpointRows();
      const teamId = query.get("teamId");
      const state = query.get("state");
      if (teamId) rows = rows.filter((r) => r.teamId === teamId);
      if (state) rows = rows.filter((r) => r.phase === state);
      const tool = query.get("tool");
      const exposure = query.get("exposure");
      if (tool) rows = rows.filter((r) => r.tool === tool);
      if (exposure) rows = rows.filter((r) => r.exposure === exposure);
      const csv = `team,tool,surface,exposure,effective,hostname,state\r\n${rows
        .map(
          (r) =>
            `${r.slug},${r.tool},${r.surface},${r.exposure},${r.effective},${r.hostname ?? ""},${r.phase}`,
        )
        .join("\r\n")}\r\n`;
      const migration = {
        state: "complete",
        teamsTotal: TEAMS.length,
        teamsWithOrchestration: collabs.size,
        teamsPending: 0,
        blocked: [],
      };
      return { status: 200, body: { ...paged(rows, query), migration }, csv };
    },
  },
];
