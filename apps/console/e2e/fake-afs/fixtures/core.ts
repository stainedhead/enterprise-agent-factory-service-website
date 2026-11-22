import { readFileSync } from "node:fs";
import type { Fixture } from "./index.js";

// A service admin holds every permission (contract: `servicePermissions` is "all for service admins").
const ALL_PERMISSIONS: string[] = (
  JSON.parse(
    readFileSync(
      new URL("../../../../../packages/sdk/contract/permissions.json", import.meta.url),
      "utf8",
    ),
  ) as { permissions: { name: string }[] }
).permissions.map((p) => p.name);

const ts = "2026-11-21T18:00:00Z";

export const TEAMS = [
  { id: "team_01JD2Q3R4S5T6V7W8X9Y0Z0001", slug: "payments", displayName: "Payments" },
  { id: "team_01JD2Q3R4S5T6V7W8X9Y0Z0002", slug: "platform", displayName: "Platform" },
] as const;

export const team = (t: { id: string; slug: string; displayName: string }) => ({
  allowedAwsAccounts: [],
  createdAt: ts,
  displayName: t.displayName,
  effectiveCeilingUsd: "5000.00",
  generation: 1,
  id: t.id,
  isolationTier: "shared",
  kind: "persistent",
  maxBudgetUsd: "5000.00",
  mayAddExternalSystems: false,
  mayManageAwsAccounts: false,
  namespace: `afs-${t.slug}`,
  slug: t.slug,
  state: "active",
  status: { conditions: [], observedGeneration: 1, phase: "Ready", updatedAt: ts },
  updatedAt: ts,
  version: 1,
  viewerKubectl: false,
});

const teamPerms = {
  team_admin: [
    "teams:read",
    "teams:write",
    "teams:suspend",
    "work-orders:read",
    "agents:read",
    "agents:write",
    "members:read",
    "members:write",
    "budgets:read",
    "revisions:read",
    "audit:read",
  ],
  team_viewer: [
    "teams:read",
    "work-orders:read",
    "agents:read",
    "members:read",
    "budgets:read",
    "revisions:read",
  ],
};

/** Identity, providers, teams and health: what the shell needs (M0). */
export const coreFixtures: readonly Fixture[] = [
  { method: "GET", path: "/healthz", response: { status: 200, body: { status: "ok" } } },
  {
    method: "GET",
    path: "/v1/identity-providers",
    response: ({ config }) => ({
      status: 200,
      body: {
        items: [
          {
            id: "idp_01JD2Q3R4S5T6V7W8X9Y0Z0001",
            kind: "okta",
            name: "Corporate SSO",
            issuerUrl: config.idpIssuer,
            consoleClientId: "afs-console",
            cliClientId: "afs-cli",
            isDefault: true,
          },
        ],
      },
    }),
  },
  {
    method: "GET",
    path: "/v1/me",
    response: ({ principal }) => {
      if (!principal)
        return {
          status: 401,
          body: { code: "Unauthenticated", message: "Unknown token", requestId: "req_unauth" },
        };
      const principalBody = {
        id: `usr_${principal.id}`,
        type: "user",
        email: principal.email,
        name: principal.name,
      };
      switch (principal.id) {
        case "svc-admin":
          return {
            status: 200,
            body: {
              principal: principalBody,
              serviceAdmin: true,
              securityOperator: false,
              servicePermissions: ALL_PERMISSIONS,
              teams: [],
            },
          };
        case "sec-op":
          return {
            status: 200,
            body: {
              principal: principalBody,
              serviceAdmin: false,
              securityOperator: true,
              servicePermissions: ["audit:read"],
              teams: [],
            },
          };
        case "team-admin":
          return {
            status: 200,
            body: {
              principal: principalBody,
              serviceAdmin: false,
              securityOperator: false,
              servicePermissions: [],
              teams: [
                {
                  teamId: TEAMS[0].id,
                  slug: TEAMS[0].slug,
                  role: "team_admin",
                  permissions: teamPerms.team_admin,
                },
              ],
            },
          };
        default:
          return {
            status: 200,
            body: {
              principal: principalBody,
              serviceAdmin: false,
              securityOperator: false,
              servicePermissions: [],
              teams: [
                {
                  teamId: TEAMS[0].id,
                  slug: TEAMS[0].slug,
                  role: "team_viewer",
                  permissions: teamPerms.team_viewer,
                },
              ],
            },
          };
      }
    },
  },
  {
    method: "GET",
    path: "/v1/teams",
    response: ({ principal }) => {
      const visible = principal?.id === "svc-admin" ? TEAMS : TEAMS.slice(0, 1);
      return { status: 200, body: { items: visible.map(team) } };
    },
  },
];
