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
    response: ({ params }) => ({ status: 200, body: { items: secretsOf(params.teamId ?? "") } }),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/secrets",
    response: ({ params, body }) => {
      const b = body as Json;
      const list = secretsOf(params.teamId ?? "");
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
