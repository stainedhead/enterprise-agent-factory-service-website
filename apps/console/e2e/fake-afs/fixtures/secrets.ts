import { BOOT_SECRET_NAMES, HUB_AGENT_ID } from "./collaboration.js";
import { TEAMS } from "./core.js";
import type { Fixture, FixtureResponse } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
const AGENT_REVIEWER = `agt_${NS}0001`;
/** The value the sentinel e2e types into create and rotate; it must never be echoed or stored by the console. */
export const SECRET_SENTINEL = "s3ntinel-9d2f7c41b8e04a6f-value";

const seedSecrets = (): Json[] => [
  {
    id: `sec_${NS}0001`,
    name: "github-bot-key",
    scope: "team",
    description: "GitHub App key",
    boundTo: [AGENT_REVIEWER],
    rotation: { enabled: true, days: 90 },
    secretsManagerPath: "afs/afs-payments/github-bot-key",
    lastChangedAt: "2026-11-15T10:00:00Z",
    createdAt: ts,
    version: 1,
  },
  {
    id: `sec_${NS}0002`,
    name: "artifactory-reader",
    scope: "team",
    boundTo: [],
    secretsManagerPath: "afs/afs-payments/artifactory-reader",
    lastChangedAt: "2026-11-10T10:00:00Z",
    createdAt: ts,
    version: 1,
  },
  ...(
    [
      ["paperclip-github-connector", "paperclip", "2026-11-22T08:10:00Z"],
      ["paperclip-jira-sync-token", "paperclip", "2026-11-22T08:12:00Z"],
      ["paperclip-better-auth-secret", "afs", "2026-11-22T09:00:00Z"],
    ] as const
  ).map(
    ([name, managedBy, at], i): Json => ({
      id: `sec_${NS}${String(200 + i).padStart(4, "0")}`,
      name,
      scope: "agent",
      agentId: HUB_AGENT_ID,
      managedBy,
      boundTo: [],
      secretsManagerPath: `afs/afs-payments/agents/paperclip-hub/${name}`,
      lastChangedAt: at,
      createdAt: ts,
      version: 1,
    }),
  ),
];

let secrets = new Map<string, Json[]>();
let seq = 0;
const seed = (): void => {
  secrets = new Map();
  seq = 0;
};
seed();
export const resetSecrets = seed;

/** The secrets of a team; only the first team has any. */
export const secretsOf = (teamId: string): Json[] => {
  let s = secrets.get(teamId);
  if (!s) {
    s = teamId === TEAMS[0].id ? seedSecrets() : [];
    secrets.set(teamId, s);
  }
  return s;
};

/** The three boot secrets AFS writes when a collaboration agent is created (managedBy afs). */
export const addBootSecrets = (teamId: string, agentId: string): void => {
  const list = secretsOf(teamId);
  for (const name of BOOT_SECRET_NAMES) {
    seq += 1;
    list.push({
      id: `sec_${NS}${String(400 + seq).padStart(4, "0")}`,
      name,
      scope: "agent",
      agentId,
      managedBy: "afs",
      boundTo: [],
      secretsManagerPath: `afs/${teamId}/agents/${agentId}/${name}`,
      lastChangedAt: ts,
      createdAt: ts,
      version: 1,
    });
  }
};

const managed = (cur: Json): FixtureResponse | undefined =>
  cur.managedBy === "afs" || cur.managedBy === "paperclip"
    ? {
        status: 409,
        body: {
          code: "Conflict",
          message: `This secret is managed by ${cur.managedBy === "afs" ? "AFS" : "Paperclip"}`,
          requestId: "req_fake_managed",
          details: { reason: "managed_secret" },
        },
      }
    : undefined;

/** Records that an agent now uses a secret (called when an agent is created with a binding). */
export const bindSecret = (teamId: string, secretId: string, agentId: string): void => {
  const s = secretsOf(teamId).find((x) => x.id === secretId);
  if (s) s.boundTo = [...((s.boundTo as string[]) ?? []), agentId];
};

const notFound = (): FixtureResponse => ({
  status: 404,
  body: { code: "NotFound", message: "Secret not found", requestId: "req_fake_nf" },
});

const bad = (field: string, message: string): FixtureResponse => ({
  status: 400,
  body: {
    code: "ValidationError",
    message,
    requestId: "req_fake_val",
    details: { fields: [{ field, message, reason: "invalid" }] },
  },
});

/** Secret metadata only; a value is accepted and dropped, never stored or returned. */
export const secretsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/secrets",
    response: ({ params, query }) => {
      const by = query.get("managedBy");
      const items = secretsOf(params.teamId ?? "")
        .map((x) => ({ ...x, managedBy: x.managedBy ?? "user" }))
        .filter((x) => !by || x.managedBy === by);
      return { status: 200, body: { items } };
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/secrets",
    response: ({ params, body }) => {
      const b = body as Json;
      const list = secretsOf(params.teamId ?? "");
      const name = String(b.name ?? "");
      if (
        (name === "paperclip" || name.startsWith("paperclip-")) &&
        !(name === "paperclip-agent-api-key" && b.scope === "agent")
      )
        return {
          status: 400,
          body: {
            code: "ValidationError",
            message: "This name is reserved for Paperclip",
            requestId: "req_fake_reserved",
            details: {
              fields: [
                {
                  field: "name",
                  message: "This name is reserved for Paperclip",
                  reason: "reserved_name",
                },
              ],
            },
          },
        };
      if (list.some((s) => s.name === b.name)) return bad("name", "A secret with this name exists");
      seq += 1;
      const s: Json = {
        id: `sec_${NS}${String(100 + seq).padStart(4, "0")}`,
        name: b.name,
        scope: b.scope,
        ...(b.description ? { description: b.description } : {}),
        ...(b.agentId ? { agentId: b.agentId } : {}),
        ...(b.externalSystemId ? { externalSystemId: b.externalSystemId } : {}),
        boundTo: [],
        secretsManagerPath: `afs/afs-payments/${b.name}`,
        lastChangedAt: ts,
        createdAt: ts,
        version: 1,
      };
      list.push(s);
      return { status: 201, body: s };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/secrets/{secretId}",
    response: ({ params }) => {
      const s = secretsOf(params.teamId ?? "").find((x) => x.id === params.secretId);
      return s ? { status: 200, body: s } : notFound();
    },
  },
  {
    method: "PATCH",
    path: "/v1/teams/{teamId}/secrets/{secretId}",
    response: ({ params, body }) => {
      const list = secretsOf(params.teamId ?? "");
      const i = list.findIndex((x) => x.id === params.secretId);
      const cur = list[i];
      if (!cur) return notFound();
      const m = managed(cur);
      if (m) return m;
      const upd = { ...cur, ...(body as Json), version: Number(cur.version) + 1 };
      list[i] = upd;
      return { status: 200, body: upd };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/secrets/{secretId}",
    response: ({ params }) => {
      const list = secretsOf(params.teamId ?? "");
      const i = list.findIndex((x) => x.id === params.secretId);
      const cur = list[i];
      if (!cur) return notFound();
      const m = managed(cur);
      if (m) return m;
      if (((cur.boundTo as string[]) ?? []).length > 0)
        return {
          status: 409,
          body: {
            code: "Conflict",
            message: "The secret is bound to agents",
            requestId: "req_fake_in_use",
            details: { reason: "secret_in_use" },
          },
        };
      list.splice(i, 1);
      return { status: 204 };
    },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/secrets/{secretId}/value",
    response: ({ params }) => {
      const list = secretsOf(params.teamId ?? "");
      const i = list.findIndex((x) => x.id === params.secretId);
      const cur = list[i];
      if (!cur) return notFound();
      const m = managed(cur);
      if (m) return m;
      list[i] = { ...cur, lastChangedAt: "2026-11-22T09:00:00Z", version: Number(cur.version) + 1 };
      return { status: 204 };
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/secrets/{secretId}:rotate",
    response: ({ params }) => {
      const list = secretsOf(params.teamId ?? "");
      const i = list.findIndex((x) => x.id === params.secretId);
      const cur = list[i];
      if (!cur) return notFound();
      if (cur.name === "paperclip-secrets-master-key")
        return {
          status: 400,
          body: {
            code: "ValidationError",
            message: "Paperclip could no longer decrypt its stored identities",
            requestId: "req_fake_master",
            details: { reason: "master_key_not_rotatable" },
          },
        };
      if (cur.managedBy === "paperclip") return managed(cur) as FixtureResponse;
      const upd = {
        ...cur,
        lastChangedAt: "2026-11-22T09:00:00Z",
        version: Number(cur.version) + 1,
      };
      list[i] = upd;
      return { status: 200, body: upd };
    },
  },
];
