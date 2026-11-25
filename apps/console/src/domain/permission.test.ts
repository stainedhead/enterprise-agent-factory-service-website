import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG, PERMISSIONS, requiredRoleLabel, rolesGranting } from "./permission.js";

interface Json {
  roles: string[];
  permissions: { name: string; grants: { role: string; condition?: string }[] }[];
}
const json = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../../../packages/sdk/contract/permissions.json"),
    "utf8",
  ),
) as Json;

describe("catalog drift (M0-D2)", () => {
  it("has every permission, role and condition of permissions.json and nothing else", () => {
    expect(PERMISSIONS).toHaveLength(77);
    expect(CATALOG.map((e) => e.permission)).toEqual(json.permissions.map((p) => p.name));
    for (const p of json.permissions) {
      const entry = CATALOG.find((e) => e.permission === p.name);
      expect(entry?.grants, p.name).toEqual(p.grants);
    }
  });
  it("uses only the four roles (plus workload)", () => {
    const roles = new Set(CATALOG.flatMap((e) => e.grants.map((g) => g.role)));
    for (const r of roles) expect([...json.roles, "workload"]).toContain(r);
  });
});

describe("requiredRoleLabel", () => {
  it.each([
    ["teams:read", "team viewer"],
    ["teams:write", "team-admin"],
    ["members:write", "team-admin"],
    ["teams:create", "service admin"],
    ["admin:settings", "service admin"],
    ["teams:set-aws-accounts", "service admin"],
    ["teams:get-kubeconfig", "service admin"],
    ["work-orders:read", "service admin"],
    ["teams:read-directory", "service admin"],
    ["swarm-templates:read", "service admin"],
    ["collaboration:manage", "team-admin"],
    ["collaboration:contribute", "team-collaborator"],
    ["collaboration:api", "team-collaborator"],
    ["collaboration:access", "team viewer"],
    ["collaboration:read", "team viewer"],
    ["admin:model-endpoints", "service admin"],
    ["admin:inference-providers", "service admin"],
    ["model-endpoints:read", "team viewer"],
    ["model-endpoints:write", "team-admin"],
    ["mcp-servers:read", "service admin"],
    ["mcp-servers:review", "service admin"],
    ["mcp-servers:write", "service admin"],
    ["mcp-settings:write", "service admin"],
    ["team-mcp-servers:read", "team viewer"],
    ["team-mcp-servers:write", "team-admin"],
    ["team-mcp-servers:approve", "service admin"],
    ["mcp-events:read", "team viewer"],
    ["agent-federated-identities:write", "team-admin"],
  ] as const)("%s needs %s", (perm, label) => {
    expect(requiredRoleLabel(perm)).toBe(label);
  });
  it("lists the unconditional roles in ascending order", () => {
    expect(rolesGranting("teams:read")).toEqual([
      "team_viewer",
      "team_collaborator",
      "team_admin",
      "service_admin",
    ]);
    expect(rolesGranting("work-orders:read")).toEqual(["service_admin", "security_operator"]);
  });
});

describe("collaborator grants (WEB-US-55)", () => {
  const holds = (role: string) =>
    new Set(
      json.permissions
        .filter((p) => p.grants.some((g) => g.role === role && !g.condition))
        .map((p) => p.name),
    );
  it("inherits every unconditional viewer grant", () => {
    for (const p of holds("team_viewer")) expect(holds("team_collaborator").has(p), p).toBe(true);
  });
  it("inherits the conditional viewer grants with the same condition", () => {
    const cond = (role: string) =>
      json.permissions.flatMap((p) =>
        p.grants
          .filter((g) => g.role === role && g.condition)
          .map((g) => `${p.name}:${g.condition}`),
      );
    expect(cond("team_collaborator").sort()).toEqual(cond("team_viewer").sort());
  });
  it("collaboration permissions by role", () => {
    const by = (name: string) =>
      json.permissions
        .find((p) => p.name === name)
        ?.grants.map((g) => g.role)
        .sort();
    expect(by("collaboration:read")).toEqual([
      "service_admin",
      "team_admin",
      "team_collaborator",
      "team_viewer",
    ]);
    expect(by("collaboration:access")).toEqual([
      "service_admin",
      "team_admin",
      "team_collaborator",
      "team_viewer",
    ]);
    expect(by("collaboration:manage")).toEqual(["service_admin", "team_admin"]);
    expect(by("collaboration:contribute")).toEqual([
      "service_admin",
      "team_admin",
      "team_collaborator",
    ]);
    expect(by("collaboration:api")).toEqual(["service_admin", "team_admin", "team_collaborator"]);
    expect(by("teams:set-guardrails")).toEqual(["service_admin"]);
  });
});
