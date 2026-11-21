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
    expect(PERMISSIONS).toHaveLength(58);
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
  ] as const)("%s needs %s", (perm, label) => {
    expect(requiredRoleLabel(perm)).toBe(label);
  });
  it("lists the unconditional roles in ascending order", () => {
    expect(rolesGranting("teams:read")).toEqual(["team_viewer", "team_admin", "service_admin"]);
    expect(rolesGranting("work-orders:read")).toEqual(["service_admin", "security_operator"]);
  });
});
