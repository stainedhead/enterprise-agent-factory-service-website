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

/** Conditional grants the API adds to a team-admin's `permissions[]` (`mayManageAwsAccounts`, M4-W). */
export const teamGrants = { awsAccounts: false, kubectl: false };

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
    "api-keys:read",
    "api-keys:write",
    "budgets:read",
    "revisions:read",
    "audit:read",
    "usage:read",
    "logs:read",
    "models:read",
    "secrets:read-metadata",
    "secrets:write",
    "config:read",
    "config:write",
    "external-systems:read",
    "external-systems:write",
    "budgets:write",
    "reports:read",
    "reports:schedule",
    "tags:read",
    "tags:write",
    "notifications:read",
    "notifications:write",
    "identities:read",
    "identities:write",
    "logs:write",
    "revisions:restore",
    "pools:read",
    "pools:write",
    "collaboration:read",
    "collaboration:manage",
    "collaboration:access",
    "collaboration:contribute",
    "collaboration:api",
  ],
  team_collaborator: [
    "teams:read",
    "work-orders:read",
    "agents:read",
    "members:read",
    "budgets:read",
    "revisions:read",
    "usage:read",
    "logs:read",
    "models:read",
    "secrets:read-metadata",
    "config:read",
    "external-systems:read",
    "reports:read",
    "tags:read",
    "notifications:read",
    "identities:read",
    "pools:read",
    "collaboration:read",
    "collaboration:access",
    "collaboration:contribute",
    "collaboration:api",
  ],
  team_viewer: [
    "teams:read",
    "work-orders:read",
    "agents:read",
    "members:read",
    "budgets:read",
    "revisions:read",
    "usage:read",
    "logs:read",
    "models:read",
    "secrets:read-metadata",
    "config:read",
    "external-systems:read",
    "reports:read",
    "tags:read",
    "notifications:read",
    "identities:read",
    "pools:read",
    "collaboration:read",
    "collaboration:access",
  ],
};
// 1.2.0 model endpoint gateway (permissions.json, contract 1.5.0)
teamPerms.team_admin.push("model-endpoints:read", "model-endpoints:write");
teamPerms.team_collaborator.push("model-endpoints:read");
teamPerms.team_viewer.push("model-endpoints:read");
// 1.3.0 governed MCP servers (permissions.json, contract 1.6.0). team-mcp-servers:approve is conditional on
// mcp.team_server_approval; the fake's settings leave it at the team-admin-may-approve-low default.
teamPerms.team_admin.push(
  "team-mcp-servers:read",
  "team-mcp-servers:write",
  "team-mcp-servers:approve",
  "mcp-events:read",
  "agent-federated-identities:write",
);
teamPerms.team_collaborator.push("team-mcp-servers:read", "mcp-events:read");
teamPerms.team_viewer.push("team-mcp-servers:read", "mcp-events:read");

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
              servicePermissions: [
                "teams:read-directory",
                "work-orders:read",
                "work-orders:write",
                "swarm-templates:read",
                "mcp-servers:read",
                "mcp-servers:review",
                "mcp-servers:suspend",
                "mcp-events:read",
              ],
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
                  permissions: [
                    ...teamPerms.team_admin,
                    ...(teamGrants.awsAccounts ? ["teams:set-aws-accounts"] : []),
                    ...(teamGrants.kubectl ? ["teams:get-kubeconfig"] : []),
                  ],
                },
              ],
            },
          };
        case "collaborator":
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
                  role: "team_collaborator",
                  permissions: [
                    ...teamPerms.team_collaborator,
                    ...(teamGrants.kubectl ? ["teams:get-kubeconfig"] : []),
                  ],
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
                  permissions: [
                    ...teamPerms.team_viewer,
                    ...(teamGrants.kubectl ? ["teams:get-kubeconfig"] : []),
                  ],
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
