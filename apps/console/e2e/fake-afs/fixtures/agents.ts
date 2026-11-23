import {
  addLink,
  HUB_AGENT_ID,
  hasCollaboration,
  linkOf,
  removeCollaborationFor,
  WORKER_IDS,
} from "./collaboration.js";
import { TEAMS } from "./core.js";
import type { Fixture, FixtureContext, FixtureResponse } from "./index.js";
import { bindSecret } from "./secrets.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
const ok = (phase = "Ready", conditions: Json[] = []) => ({
  conditions,
  observedGeneration: 1,
  phase,
  updatedAt: ts,
});
export const digestOf = (name: string, n = "4f") =>
  `registry.example.test/agents/${name}@sha256:${n.repeat(32)}`;

const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
export const AGENT_IDS = [`agt_${NS}0001`, `agt_${NS}0002`, `agt_${NS}0003`] as const;

const seedAgents = (): Json[] => [
  {
    id: AGENT_IDS[0],
    name: "reviewer",
    template: "coder",
    image: digestOf("coder"),
    modelId: "anthropic.claude-sonnet-4-5",
    iamIdentity: "team_shared",
    iamRoleArn: "arn:aws:iam::000000000000:role/afs-payments-shared",
    paused: false,
    version: 1,
    generation: 1,
    status: ok(),
    resources: { cpu: "2", memory: "8Gi" },
    volume: {
      sizeGiB: 50,
      storageClass: "gp3",
      onDelete: "snapshot_then_delete",
      snapshotSchedule: "daily",
      snapshotRetain: 7,
    },
    secretBindings: [{ secretId: `sec_${NS}0001`, delivery: "env", target: "GITHUB_APP_KEY" }],
    createdAt: ts,
    updatedAt: ts,
  },
  {
    id: AGENT_IDS[1],
    name: "triage",
    template: "coder",
    image: digestOf("coder"),
    modelId: "anthropic.claude-haiku-4-5",
    iamIdentity: "dedicated",
    iamRoleArn: "arn:aws:iam::000000000000:role/afs/agents/afs-payments/triage",
    paused: false,
    version: 1,
    generation: 1,
    status: ok("Ready", [
      {
        type: "TemplateRetired",
        status: "True",
        lastTransitionTime: ts,
        reason: "TemplateRetired",
      },
    ]),
    secretBindings: [],
    createdAt: ts,
    updatedAt: ts,
  },
  {
    id: AGENT_IDS[2],
    name: "nightly",
    template: "coder",
    image: digestOf("coder"),
    modelId: "anthropic.claude-sonnet-4-5",
    iamIdentity: "team_shared",
    paused: true,
    version: 1,
    generation: 1,
    status: ok(),
    secretBindings: [],
    createdAt: ts,
    updatedAt: ts,
  },
  {
    id: HUB_AGENT_ID,
    name: "paperclip-hub",
    role: "orchestration",
    template: "paperclip-hub",
    image: digestOf("paperclip", "7c"),
    modelId: "anthropic.claude-sonnet-4-5",
    iamIdentity: "dedicated",
    iamRoleArn: "arn:aws:iam::000000000000:role/afs/agents/afs-payments/paperclip-hub",
    paused: false,
    version: 1,
    generation: 6,
    status: { conditions: [], observedGeneration: 6, phase: "Ready", updatedAt: ts },
    volume: {
      sizeGiB: 100,
      storageClass: "gp3",
      onDelete: "snapshot_then_delete",
      snapshotSchedule: "daily",
      snapshotRetain: 14,
    },
    secretBindings: [],
    createdAt: ts,
    updatedAt: ts,
  },
  ...(
    [
      ["ledger-maintainer", WORKER_IDS.ledger],
      ["dependency-updater", WORKER_IDS.dependency],
      ["release-notes-bot", WORKER_IDS.releaseNotes],
    ] as const
  ).map(([name, id]) => ({
    id,
    name,
    role: "worker",
    template: "coder",
    image: digestOf("coder"),
    modelId: "anthropic.claude-sonnet-4-5",
    iamIdentity: "team_shared",
    paused: false,
    version: 1,
    generation: 1,
    status: ok(),
    secretBindings: [],
    createdAt: ts,
    updatedAt: ts,
  })),
];

let agents = new Map<string, Json[]>();
let snapshots = new Map<string, Json[]>();
let seq = 0;
const seed = (): void => {
  agents = new Map();
  snapshots = new Map();
  seq = 0;
};
seed();
/** Back to the seeded agents (called by the fake server's reset). */
export const resetAgents = seed;

/** The agents of a team; only the first team has any. Other fixture modules read and edit the same store. */
export const agentsOf = (teamId: string): Json[] => {
  let a = agents.get(teamId);
  if (!a) {
    a = teamId === TEAMS[0].id ? seedAgents() : [];
    agents.set(teamId, a);
  }
  return a;
};

/** Adds the worker's `collaboration` link state (absent on the collaboration agent) and a default role. */
const decorate = (teamId: string, a: Json): Json => {
  const role = (a.role as string | undefined) ?? "worker";
  const link = role === "worker" ? linkOf(teamId, String(a.id)) : undefined;
  const models = (a.models as Json | undefined) ?? {
    access: "all",
    defaultModelId: String(a.modelId ?? "anthropic.claude-sonnet-4-5"),
    effectiveModelIds: ["anthropic.claude-sonnet-4-5", "anthropic.claude-haiku-4-5"],
  };
  return { ...a, role, models, ...(link ? { collaboration: link } : {}) };
};

const notFound = (what: string): FixtureResponse => ({
  status: 404,
  body: { code: "NotFound", message: `${what} not found`, requestId: "req_fake_nf" },
});
const invalid = (field: string, message: string): FixtureResponse => ({
  status: 400,
  body: {
    code: "ValidationError",
    message,
    requestId: "req_fake_val",
    details: { fields: [{ field, message, reason: "invalid" }] },
  },
});

const DIGEST = /@sha256:[0-9a-f]{64}$/;
const next = (a: Json, patch: Json = {}): Json => ({
  ...a,
  ...patch,
  version: Number(a.version) + 1,
  generation: Number(a.generation) + 1,
});

const find = (ctx: FixtureContext) => {
  const list = agentsOf(ctx.params.teamId ?? "");
  const i = list.findIndex((a) => a.id === ctx.params.agentId);
  return { list, i, cur: list[i] };
};

const action =
  (patch: (a: Json) => Json, status = 200): ((ctx: FixtureContext) => FixtureResponse) =>
  (ctx) => {
    const { list, i, cur } = find(ctx);
    if (!cur) return notFound("Agent");
    const upd = patch(cur);
    list[i] = upd;
    return { status, body: decorate(ctx.params.teamId ?? "", upd) };
  };

export const TEMPLATES: Json[] = [
  {
    name: "coder",
    description: "General coding agent",
    harness: "hermes",
    enabled: true,
    currentDigest: digestOf("coder"),
    allowedDigests: [digestOf("coder"), digestOf("coder", "3a")],
    defaultResources: { cpu: "2", memory: "8Gi" },
    version: 1,
  },
  {
    name: "reviewer-tpl",
    harness: "omp",
    enabled: true,
    currentDigest: digestOf("review", "9f"),
    allowedDigests: [digestOf("review", "9f")],
    defaultResources: { cpu: "1", memory: "4Gi" },
    version: 1,
  },
  {
    name: "paperclip-hub",
    description: "Paperclip collaboration agent",
    harness: "paperclip",
    enabled: true,
    capabilities: ["paperclip"],
    currentDigest: digestOf("paperclip", "7c"),
    allowedDigests: [digestOf("paperclip", "7c")],
    defaultResources: { cpu: "2", memory: "8Gi" },
    version: 1,
  },
  {
    name: "legacy",
    harness: "hermes",
    enabled: false,
    currentDigest: digestOf("legacy", "11"),
    allowedDigests: [digestOf("legacy", "11")],
    version: 1,
  },
];

export const STORAGE_CLASSES: Json[] = [
  {
    name: "gp3",
    description: "General purpose SSD, encrypted",
    enabled: true,
    volumeType: "gp3",
    version: 1,
  },
  { name: "io2", description: "Provisioned IOPS", enabled: true, volumeType: "io2", version: 1 },
];

const ULID_TAIL = "9Y0Z";
const snapId = () => `snap_${NS.slice(0, 18)}${ULID_TAIL}${String(++seq).padStart(4, "0")}`;

/** Agents, their actions and snapshots, the template and storage-class lists, usage by agent and log destinations (M2-A). */
export const agentsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/agents",
    response: ({ params, query }) => {
      const teamId = params.teamId ?? "";
      const role = query.get("role");
      const items = agentsOf(teamId)
        .map((a) => decorate(teamId, a))
        .filter((a) => !role || (a.role ?? "worker") === role);
      const max = Number(query.get("maxResults") ?? 0);
      return { status: 200, body: { items: max > 0 ? items.slice(0, max) : items } };
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/agents",
    response: ({ params, body }) => {
      const b = body as Json;
      if (typeof b.image !== "string" || !DIGEST.test(b.image))
        return invalid("image", "The image must be pinned by digest; tags are not accepted");
      const list = agentsOf(params.teamId ?? "");
      if (list.some((a) => a.name === b.name))
        return invalid("name", "An agent with this name exists");
      const role = "worker";
      seq += 1;
      const a: Json = {
        ...b,
        role,
        id: `agt_${NS}${String(100 + seq).padStart(4, "0")}`,
        iamIdentity: b.iamIdentity ?? "team_shared",
        paused: false,
        version: 1,
        generation: 1,
        status: ok("Pending"),
        secretBindings: b.secretBindings ?? [],
        createdAt: ts,
        updatedAt: ts,
      };
      list.push(a);
      for (const sb of (a.secretBindings as { secretId: string }[]) ?? [])
        bindSecret(params.teamId ?? "", sb.secretId, String(a.id));
      delete a.collaboration;
      const connect = (b.collaboration as { connect?: boolean } | undefined)?.connect === true;
      if (hasCollaboration(params.teamId ?? ""))
        addLink(params.teamId ?? "", String(a.id), String(a.name), connect);
      return { status: 201, body: decorate(params.teamId ?? "", a) };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/agents/{agentId}",
    response: (ctx) => {
      const { cur } = find(ctx);
      return cur
        ? { status: 200, body: decorate(ctx.params.teamId ?? "", cur) }
        : notFound("Agent");
    },
  },
  {
    method: "PATCH",
    path: "/v1/teams/{teamId}/agents/{agentId}",
    response: (ctx) => {
      const { list, i, cur } = find(ctx);
      if (!cur) return notFound("Agent");
      const b = ctx.body as Json;
      if (typeof b.image === "string" && !DIGEST.test(b.image))
        return invalid("image", "The image must be pinned by digest; tags are not accepted");
      const vol = b.volume as { sizeGiB?: number } | undefined;
      const curSize = (cur.volume as { sizeGiB?: number } | undefined)?.sizeGiB ?? 0;
      if (vol?.sizeGiB !== undefined && vol.sizeGiB < curSize)
        return invalid("volume.sizeGiB", "A volume can only grow");
      const retired = (cur.status as { conditions: Json[] }).conditions.filter(
        (c) => c.type !== "TemplateRetired",
      );
      const upd = next(cur, {
        ...b,
        volume: { ...(cur.volume as Json | undefined), ...(vol ?? {}) },
        status: {
          ...(cur.status as Json),
          conditions:
            b.template || b.image ? retired : (cur.status as { conditions: Json[] }).conditions,
        },
      });
      list[i] = upd;
      return { status: 200, body: decorate(ctx.params.teamId ?? "", upd) };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/agents/{agentId}",
    response: (ctx) => {
      const { cur } = find(ctx);
      if (cur?.role === "orchestration") removeCollaborationFor(ctx.params.teamId ?? "");
      return action((a) => next(a, { status: ok("Deleting") }), 202)(ctx);
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/agents/{agentId}/status",
    response: (ctx) => {
      const { cur } = find(ctx);
      return cur
        ? {
            status: 200,
            body: { id: cur.id, kind: "agent", generation: cur.generation, status: cur.status },
          }
        : notFound("Agent");
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/agents/{agentId}:pause",
    response: action((a) => next(a, { paused: true })),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/agents/{agentId}:resume",
    response: action((a) => next(a, { paused: false })),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/agents/{agentId}:restart",
    response: action((a) => next(a, { status: ok("Reconciling") }), 202),
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/agents/{agentId}/snapshots",
    response: ({ params }) => ({
      status: 200,
      body: { items: snapshots.get(`${params.teamId}/${params.agentId}`) ?? [] },
    }),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/agents/{agentId}/snapshots",
    response: ({ params }) => {
      const key = `${params.teamId}/${params.agentId}`;
      const s: Json = {
        id: snapId(),
        agentId: params.agentId,
        reason: "manual",
        state: "requested",
        requestedAt: ts,
      };
      snapshots.set(key, [...(snapshots.get(key) ?? []), s]);
      return { status: 202, body: s };
    },
  },
  {
    method: "GET",
    path: "/v1/agent-templates",
    response: ({ query }) => {
      const cap = query.get("capability");
      return {
        status: 200,
        body: {
          items: cap
            ? TEMPLATES.filter((t) =>
                ((t.capabilities as string[] | undefined) ?? []).includes(cap),
              )
            : TEMPLATES,
        },
      };
    },
  },
  {
    method: "GET",
    path: "/v1/storage-classes",
    response: { status: 200, body: { items: STORAGE_CLASSES } },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/usage",
    response: ({ params }) => {
      const rows = agentsOf(params.teamId ?? "").map((a, n) => ({
        calls: 10 * (n + 1),
        costUsd: n === 0 ? "9410.50" : "120.00",
        key: { agent: String(a.id) },
      }));
      return {
        status: 200,
        body: {
          groupBy: ["agent"],
          range: {},
          rows,
          totals: { calls: 60, costUsd: "9650.50", key: {} },
        },
      };
    },
  },
];
