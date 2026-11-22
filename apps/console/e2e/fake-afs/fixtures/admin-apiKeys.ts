import type { Fixture } from "./index.js";
import { SENTINEL_SECRET } from "./members.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";

const seedKeys = (): Json[] => [
  {
    id: "key_01JD2Q3R4S5T6V7W8X9Y0ZA001",
    name: "work-order-pipeline",
    role: "security_operator",
    keyPrefix: "afsk_7c1d",
    expiresAt: "2026-12-20T00:00:00Z",
    createdAt: ts,
    lastUsedAt: "2026-11-21T12:00:00Z",
  },
];
const seedOperators = (): Json[] => [
  {
    id: "rb_01JD2Q3R4S5T6V7W8X9Y0ZB001",
    subjectType: "user",
    email: "sec.op@example.test",
    version: 1,
    createdAt: ts,
  },
  {
    id: "rb_01JD2Q3R4S5T6V7W8X9Y0ZB002",
    subjectType: "group",
    groupName: "security-operations",
    version: 1,
    createdAt: ts,
  },
];

let keys = seedKeys();
let operators = seedOperators();
let seq = 0;

/** Back to the seeded service keys and operators (called by the fake server's reset). */
export const resetAdminApiKeys = (): void => {
  keys = seedKeys();
  operators = seedOperators();
  seq = 0;
};

const nextId = (prefix: string) =>
  `${prefix}_01JD2Q3R4S5T6V7W8X9Y0ZC${String(++seq).padStart(3, "0")}`;
const notFound = (what: string) => ({
  status: 404,
  body: { code: "NotFound", message: `${what} not found`, requestId: "req_fake_nf", details: {} },
});

export const adminApiKeysFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/admin/api-keys",
    response: () => ({ status: 200, body: { items: keys } }),
  },
  {
    method: "POST",
    path: "/v1/admin/api-keys",
    response: ({ body }) => {
      const b = body as { name: string; role: string; expiresAt: string };
      const key: Json = {
        id: nextId("key"),
        name: b.name,
        role: b.role,
        keyPrefix: "afsk_e2e2",
        expiresAt: b.expiresAt,
        createdAt: ts,
        lastUsedAt: null,
      };
      keys.push(key);
      if (b.name === "replay-me")
        return { status: 201, body: key, headers: { "Idempotent-Replayed": "true" } };
      return { status: 201, body: { ...key, secretKey: SENTINEL_SECRET } };
    },
  },
  {
    method: "DELETE",
    path: "/v1/admin/api-keys/{keyId}",
    response: ({ params }) => {
      const i = keys.findIndex((k) => k.id === params.keyId);
      if (i < 0) return notFound("API key");
      keys.splice(i, 1);
      return { status: 204 };
    },
  },
  {
    method: "GET",
    path: "/v1/admin/security-operators",
    response: () => ({ status: 200, body: { items: operators } }),
  },
  {
    method: "POST",
    path: "/v1/admin/security-operators",
    response: ({ body }) => {
      const b = body as Json;
      const o: Json = {
        id: nextId("rb"),
        subjectType: b.subjectType,
        ...(b.email ? { email: b.email } : {}),
        ...(b.groupName ? { groupName: b.groupName } : {}),
        version: 1,
        createdAt: ts,
      };
      operators.push(o);
      return { status: 201, body: o };
    },
  },
  {
    method: "DELETE",
    path: "/v1/admin/security-operators/{bindingId}",
    response: ({ params }) => {
      const i = operators.findIndex((o) => o.id === params.bindingId);
      if (i < 0) return notFound("Security operator");
      operators.splice(i, 1);
      return { status: 204 };
    },
  },
];
