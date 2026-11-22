import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
/** The one-time secret the sentinel e2e looks for after the dialog closes. */
export const SENTINEL_SECRET = "afsk_SENTINEL_9d2f7c41b8e04a6f";

let members = new Map<string, Json[]>();
let keys = new Map<string, Json[]>();
let seq = 0;

const seed = (): void => {
  seq = 0;
  members = new Map();
  keys = new Map();
};
seed();

/** Back to an empty store; the first read of a team seeds it (called by the fake server's reset). */
export const resetMembers = seed;

const id = (prefix: string) => `${prefix}_01JD2Q3R4S5T6V7W8X9Y0Z9${String(++seq).padStart(3, "0")}`;

const membersOf = (teamId: string): Json[] => {
  let m = members.get(teamId);
  if (!m) {
    m = [
      {
        id: "rb_01JD2Q3R4S5T6V7W8X9Y0Z0001",
        role: "team_admin",
        subjectType: "user",
        email: "team.admin@example.test",
        version: 1,
        createdAt: ts,
      },
      {
        id: "rb_01JD2Q3R4S5T6V7W8X9Y0Z0002",
        role: "team_viewer",
        subjectType: "group",
        groupName: "payments-eng",
        version: 1,
        createdAt: ts,
      },
    ];
    members.set(teamId, m);
  }
  return m;
};

const keysOf = (teamId: string): Json[] => {
  let k = keys.get(teamId);
  if (!k) {
    k = [
      {
        id: "key_01JD2Q3R4S5T6V7W8X9Y0Z0001",
        name: "ci-pipeline",
        role: "team_viewer",
        keyPrefix: "afsk_3f9a",
        expiresAt: "2026-12-15T00:00:00Z",
        createdAt: ts,
        lastUsedAt: "2026-11-21T12:00:00Z",
      },
    ];
    keys.set(teamId, k);
  }
  return k;
};

const notFound = (what: string) => ({
  status: 404,
  body: { code: "NotFound", message: `${what} not found`, requestId: "req_fake_nf" },
});

export const membersFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/members",
    response: ({ params }) => ({ status: 200, body: { items: membersOf(params.teamId ?? "") } }),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/members",
    response: ({ params, body }) => {
      const b = body as Json;
      if (b.role !== "team_admin" && b.role !== "team_viewer")
        return {
          status: 400,
          body: {
            code: "ValidationError",
            message: "role must be team_admin or team_viewer",
            requestId: "req_fake_val",
            details: {
              fields: [{ field: "role", message: "Not a team role", reason: "invalid_role" }],
            },
          },
        };
      const m: Json = {
        id: id("rb"),
        role: b.role,
        subjectType: b.subjectType,
        ...(b.email ? { email: b.email } : {}),
        ...(b.groupName ? { groupName: b.groupName } : {}),
        version: 1,
        createdAt: ts,
      };
      membersOf(params.teamId ?? "").push(m);
      return { status: 201, body: m };
    },
  },
  {
    method: "PATCH",
    path: "/v1/teams/{teamId}/members/{bindingId}",
    response: ({ params, body }) => {
      const list = membersOf(params.teamId ?? "");
      const i = list.findIndex((m) => m.id === params.bindingId);
      const cur = list[i];
      if (!cur) return notFound("Member");
      const next = { ...cur, ...(body as Json), version: Number(cur.version) + 1 };
      list[i] = next;
      return { status: 200, body: next };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/members/{bindingId}",
    response: ({ params }) => {
      const list = membersOf(params.teamId ?? "");
      const i = list.findIndex((m) => m.id === params.bindingId);
      if (i < 0) return notFound("Member");
      list.splice(i, 1);
      return { status: 204 };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/api-keys",
    response: ({ params }) => ({ status: 200, body: { items: keysOf(params.teamId ?? "") } }),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/api-keys",
    response: ({ params, body }) => {
      const b = body as { name: string; role: string; expiresAt: string };
      const key: Json = {
        id: id("key"),
        name: b.name,
        role: b.role,
        keyPrefix: "afsk_e2e1",
        expiresAt: b.expiresAt,
        createdAt: ts,
        lastUsedAt: null,
      };
      keysOf(params.teamId ?? "").push(key);
      // a retried create (D52) is stored once and answered without the secret
      if (b.name === "replay-me")
        return { status: 201, body: key, headers: { "Idempotent-Replayed": "true" } };
      return { status: 201, body: { ...key, secretKey: SENTINEL_SECRET } };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/api-keys/{keyId}",
    response: ({ params }) => {
      const list = keysOf(params.teamId ?? "");
      const i = list.findIndex((k) => k.id === params.keyId);
      if (i < 0) return notFound("API key");
      list.splice(i, 1);
      return { status: 204 };
    },
  },
];
