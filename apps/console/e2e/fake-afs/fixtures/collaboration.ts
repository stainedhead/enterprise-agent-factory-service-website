// Paperclip collaboration (API contract v1.3.1 §4.4b): the team collaboration resource, its links to worker
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

export interface CollabControl {
  baseDomain: string | null;
  publicEndpoints: boolean;
  mayExpose: boolean;
  providerHasCollabClient: boolean;
  phase: string;
  registrationMode: "manual" | "managed";
  teamState: "active" | "suspended";
}

interface Collab {
  teamId: string;
  agentId: string;
  webUi: boolean;
  restApi: boolean;
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
  mayExpose: true,
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
        webUi: true,
        restApi: false,
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

/** Creates the collaboration resource for a team (called when a collaboration agent is created). */
export const createCollaborationFor = (teamId: string, agentId: string): void => {
  collabs.set(teamId, {
    teamId,
    agentId,
    webUi: true,
    restApi: false,
    version: 1,
    generation: 1,
    observed: 0,
    settleIn: 2,
    unmanaged: [],
  });
};
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
  err(404, "NotFound", "This team has no collaboration agent", {
    reason: "collaboration_agent_missing",
  });
const suspended = (): FixtureResponse =>
  err(409, "Conflict", "Team is suspended", { reason: "team_suspended" });
const denied = (ctx: FixtureContext): FixtureResponse | undefined =>
  ctx.principal && ["viewer", "collaborator"].includes(ctx.principal.id)
    ? err(403, "AccessDenied", "Requires collaboration:manage", {
        requiredPermission: "collaboration:manage",
      })
    : undefined;

const reasonsFor = (c: Collab) => {
  const reasons: string[] = [];
  if (!ctl.mayExpose) reasons.push("team_not_allowed");
  if (!ctl.publicEndpoints) reasons.push("service_endpoints_off");
  if (ctl.baseDomain === null) reasons.push("base_domain_unset");
  const surfaces = reasons.length === 0;
  if (surfaces && c.webUi && !ctl.providerHasCollabClient)
    reasons.push("provider_without_collab_client");
  return {
    reasons,
    webUi: c.webUi && surfaces && ctl.providerHasCollabClient,
    restApi: c.restApi && surfaces,
  };
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

const view = (c: Collab): Json => {
  const e = reasonsFor(c);
  const host = hostnameOf(c.teamId);
  const ready = phaseOf(c) === "Ready";
  return {
    teamId: c.teamId,
    agentId: c.agentId,
    version: c.version,
    generation: c.generation,
    createdAt: ts,
    createdBy: "usr_01JD2Q3R4S5T6V7W8X9Y0Z0001",
    updatedAt: ts,
    hostname: host,
    webUiEnabled: c.webUi,
    restApiEnabled: c.restApi,
    webUiUrl: host ? `https://${host}/` : null,
    restApiUrl: host ? `https://${host}/api` : null,
    registrationMode: ctl.registrationMode,
    effective: { webUi: e.webUi, restApi: e.restApi, reasons: e.reasons },
    unmanagedPaperclipAgents: c.unmanaged,
    status: {
      phase: phaseOf(c),
      observedGeneration: c.observed,
      updatedAt: ts,
      conditions: [
        condition(
          "EndpointReady",
          e.webUi || e.restApi ? "True" : "False",
          e.webUi || e.restApi ? "Ready" : "NoSurface",
          e.webUi || e.restApi ? "Endpoint is serving" : "No public surface is served",
        ),
        condition(
          "PaperclipReady",
          ready ? "True" : "False",
          ready ? "Ready" : "NotReady",
          ready ? "Paperclip is up" : "Waiting",
        ),
        condition("RegistrationHealthy", "True", "Ready", "Agents register as configured"),
        condition(
          "UnmanagedPaperclipAgents",
          c.unmanaged.length > 0 ? "True" : "False",
          c.unmanaged.length > 0 ? "Found" : "None",
          c.unmanaged.length > 0 ? "Paperclip has agents AFS does not manage" : "None found",
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
  [...collabs.values()].map((c) => {
    const e = reasonsFor(c);
    return {
      teamId: c.teamId,
      slug: teamSlug(c.teamId),
      agentId: c.agentId,
      hostname: hostnameOf(c.teamId),
      webUiEnabled: c.webUi,
      restApiEnabled: c.restApi,
      effective: { webUi: e.webUi, restApi: e.restApi },
      phase: phaseOf(c),
      teamState: ctl.teamState,
      mayExposeCollaboration: ctl.mayExpose,
      lastAccessAt: "2026-11-22T09:30:00Z",
    };
  });

export const collaborationFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/collaboration",
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
    path: "/v1/teams/{teamId}/collaboration",
    response: (ctx) => {
      const d = denied(ctx);
      if (d) return d;
      const c = collabs.get(ctx.params.teamId ?? "");
      if (!c) return missing();
      if (ctl.teamState === "suspended") return suspended();
      const b = ctx.body as {
        webUiEnabled?: boolean;
        restApiEnabled?: boolean;
        registrationMode?: string;
      };
      const turnsOn = (
        field: "webUiEnabled" | "restApiEnabled",
        cur: boolean,
      ): FixtureResponse | undefined => {
        if (b[field] !== true || cur) return undefined;
        if (ctl.baseDomain === null)
          return invalidField(
            field,
            "collab_base_domain_unset",
            "Public collaboration is not configured for the service",
          );
        if (!ctl.publicEndpoints)
          return invalidField(
            field,
            "collab_public_endpoints_off",
            "Public collaboration is off for the service",
          );
        if (!ctl.mayExpose)
          return invalidField(
            field,
            "collaboration_not_allowed_for_team",
            "Not allowed for this team by the service",
          );
        if (field === "webUiEnabled" && !ctl.providerHasCollabClient)
          return invalidField(
            field,
            "provider_without_collab_client",
            "Your sign-in provider has no collaboration client",
          );
        return undefined;
      };
      const bad = turnsOn("webUiEnabled", c.webUi) ?? turnsOn("restApiEnabled", c.restApi);
      if (bad) return bad;
      if (
        b.registrationMode === "managed" &&
        ctl.registrationMode !== "managed" &&
        ctl.phase !== "Ready"
      )
        return invalidField(
          "registrationMode",
          "collaboration_agent_not_ready",
          "The collaboration agent must be Ready",
        );
      if (b.registrationMode) ctl.registrationMode = b.registrationMode as "manual" | "managed";
      c.webUi = b.webUiEnabled ?? c.webUi;
      c.restApi = b.restApiEnabled ?? c.restApi;
      c.version += 1;
      c.generation += 1;
      c.settleIn = 2;
      return { status: 200, body: view(c) };
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
    path: "/v1/admin/collaboration-endpoints",
    response: ({ query }) => {
      let rows = endpointRows();
      const teamId = query.get("teamId");
      const state = query.get("state");
      if (teamId) rows = rows.filter((r) => r.teamId === teamId);
      if (state) rows = rows.filter((r) => r.phase === state);
      const csv = `team,hostname,webUi,restApi,state\r\n${rows
        .map((r) => {
          const e = r.effective as { webUi: boolean; restApi: boolean };
          return `${r.slug},${r.hostname ?? ""},${e.webUi},${e.restApi},${r.phase}`;
        })
        .join("\r\n")}\r\n`;
      return { status: 200, body: paged(rows, query), csv };
    },
  },
];
