import { TEAMS } from "./core.js";
import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
const seedSettings = (): Json[] => [
  {
    key: "audit.retention_days",
    value: 365,
    default: 365,
    type: "integer",
    allowed: "30 to 3650",
    min: 30,
    max: 3650,
    version: 1,
  },
  {
    key: "billing.tag_activation_acknowledged",
    value: false,
    default: false,
    type: "boolean",
    allowed: "true or false",
    version: 1,
  },
  {
    key: "gateway.fail_closed",
    value: true,
    default: true,
    type: "boolean",
    allowed: "true or false",
    version: 1,
    updatedAt: ts,
  },
];
const seedIdps = (): Json[] => [
  {
    id: "idp_01JD2Q3R4S5T6V7W8X9Y0Z0001",
    kind: "okta",
    name: "Corporate SSO",
    issuerUrl: "https://corp.okta.example.test",
    consoleClientId: "afs-console",
    cliClientId: "afs-cli",
    groupsClaim: "groups",
    isDefault: true,
    enabled: true,
    version: 1,
    clientSecretArn: "arn:aws:secretsmanager:eu-west-1:000000000000:secret:idp-corp",
  },
  {
    id: "idp_01JD2Q3R4S5T6V7W8X9Y0Z0002",
    kind: "entra_id",
    name: "Contractors",
    issuerUrl: "https://login.example.test/tenant/v2.0",
    consoleClientId: "afs-console-c",
    cliClientId: "afs-cli-c",
    groupsClaim: "groups",
    isDefault: false,
    enabled: true,
    version: 1,
    clientSecretArn: null,
  },
];

let settings = seedSettings();
let idps = seedIdps();
let seq = 0;

/** Back to the seeded settings and providers (called by the fake server's reset). */
export const resetSettings = (): void => {
  settings = seedSettings();
  idps = seedIdps();
  seq = 0;
};

const notFound = (what: string) => ({
  status: 404,
  body: { code: "NotFound", message: `${what} not found`, requestId: "req_fake_nf" },
});

/** The first seeded team is the one that uses the first provider. */
const usedBy = (id: string) =>
  id === idps[0]?.id
    ? [{ id: TEAMS[0].id, slug: TEAMS[0].slug, displayName: TEAMS[0].displayName }]
    : [];

export const settingsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/admin/settings",
    response: () => ({ status: 200, body: { items: settings } }),
  },
  {
    method: "PUT",
    path: "/v1/admin/settings/{key}",
    response: ({ params, body }) => {
      const i = settings.findIndex((s) => s.key === params.key);
      const cur = settings[i];
      if (!cur) return notFound("Setting");
      const value = (body as { value: unknown }).value;
      if (
        cur.type === "integer" &&
        (typeof value !== "number" || value < Number(cur.min) || value > Number(cur.max))
      )
        return {
          status: 400,
          body: {
            code: "ValidationError",
            message: "The value is outside the allowed range",
            requestId: "req_fake_val",
            details: {
              fields: [
                { field: "value", message: `Must be ${cur.allowed}`, reason: "out_of_range" },
              ],
            },
          },
        };
      const next = { ...cur, value, updatedAt: ts, version: Number(cur.version) + 1 };
      settings[i] = next;
      return { status: 200, body: next };
    },
  },
  {
    method: "GET",
    path: "/v1/admin/identity-providers",
    response: () => ({ status: 200, body: { items: idps } }),
  },
  {
    method: "POST",
    path: "/v1/admin/identity-providers",
    response: ({ body }) => {
      const b = body as Json;
      const created: Json = {
        id: `idp_01JD2Q3R4S5T6V7W8X9Y0Z9${String(++seq).padStart(3, "0")}`,
        groupsClaim: "groups",
        isDefault: false,
        enabled: true,
        clientSecretArn: null,
        ...b,
        version: 1,
      };
      if (created.isDefault) idps = idps.map((p) => ({ ...p, isDefault: false }));
      idps.push(created);
      return { status: 201, body: created };
    },
  },
  {
    method: "GET",
    path: "/v1/admin/identity-providers/{id}",
    response: ({ params }) => {
      const p = idps.find((x) => x.id === params.id);
      return p
        ? { status: 200, body: { ...p, teams: usedBy(String(p.id)) } }
        : notFound("Identity provider");
    },
  },
  {
    method: "PATCH",
    path: "/v1/admin/identity-providers/{id}",
    response: ({ params, body }) => {
      const i = idps.findIndex((x) => x.id === params.id);
      const cur = idps[i];
      if (!cur) return notFound("Identity provider");
      const patch = body as Json;
      if (patch.enabled === false && usedBy(String(cur.id)).length > 0)
        return {
          status: 409,
          body: {
            code: "Conflict",
            message: "Identity provider is in use by 1 team",
            requestId: "req_fake_409",
          },
        };
      if (patch.isDefault === true) idps = idps.map((p) => ({ ...p, isDefault: false }));
      const next = { ...(idps[i] as Json), ...patch, version: Number(cur.version) + 1 };
      idps[i] = next;
      return { status: 200, body: next };
    },
  },
  {
    method: "DELETE",
    path: "/v1/admin/identity-providers/{id}",
    response: ({ params }) => {
      const i = idps.findIndex((x) => x.id === params.id);
      if (i < 0) return notFound("Identity provider");
      idps.splice(i, 1);
      return { status: 204 };
    },
  },
];
