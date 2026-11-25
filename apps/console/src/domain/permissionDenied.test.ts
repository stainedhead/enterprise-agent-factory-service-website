// M6-Q7: the denied-case audit. Every Permission gets a generated denied case for each role that the
// catalog does not grant it to, and a source scan fails when the console gates on a name that is not a
// Permission (a typo would silently never match).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { can, type Me } from "./me.js";
import { PERMISSIONS, type Role, requiredRoleLabel, rolesGranting } from "./permission.js";

const base = { principal: { id: "usr_1", type: "user" as const } };

/** A caller holding exactly the catalog's unconditional grants of `role` (the `GET /v1/me` shape). */
function meWithRole(role: Role): Me {
  if (role === "service_admin")
    return { ...base, serviceAdmin: true, securityOperator: false, teams: [] };
  if (role === "security_operator")
    return { ...base, serviceAdmin: false, securityOperator: true, teams: [] };
  return {
    ...base,
    serviceAdmin: false,
    securityOperator: false,
    teams: [
      {
        teamId: "team_a",
        slug: "a",
        role,
        permissions: PERMISSIONS.filter((p) => rolesGranting(p).includes(role)),
      },
    ],
  };
}
const NOBODY: Me = { ...base, serviceAdmin: false, securityOperator: false, teams: [] };
const ROLES: readonly Role[] = [
  "team_viewer",
  "team_collaborator",
  "team_admin",
  "security_operator",
  "service_admin",
];
/** Team roles are asked inside their team; the service roles are asked without one. */
const scope = (role: Role): string | undefined =>
  role === "team_viewer" || role === "team_collaborator" || role === "team_admin"
    ? "team_a"
    : undefined;

describe("every permission has a denied case (M6-Q7)", () => {
  it.each(PERMISSIONS)("%s is allowed exactly to the roles that hold it", (p) => {
    const holders = rolesGranting(p);
    expect(can(NOBODY, p), "a caller with no access").toBe(false);
    expect(can(NOBODY, p, "team_a"), "a caller with no access, in a team").toBe(false);
    // a permission held by every role has nothing to deny but the no-access caller; only the MCP ledger is one
    // (every role reads MCP events: team roles their own team, service roles every team; v1.6.0)
    if (p !== "mcp-events:read")
      expect(holders.length, `${p} is held by every role`).toBeLessThan(ROLES.length);
    for (const r of ROLES)
      expect(can(meWithRole(r), p, scope(r)), `${r} and ${p}`).toBe(holders.includes(r));
    expect(requiredRoleLabel(p)).toBeTruthy();
  });
});

describe("model endpoint grants (MEG-WEB-5)", () => {
  const me = (r: Role) => meWithRole(r);
  it("only a service admin manages the catalog and switches providers", () => {
    for (const p of ["admin:model-endpoints", "admin:inference-providers"] as const) {
      expect(can(me("service_admin"), p)).toBe(true);
      for (const r of [
        "team_viewer",
        "team_collaborator",
        "team_admin",
        "security_operator",
      ] as const)
        expect(can(me(r), p, scope(r)), `${r} and ${p}`).toBe(false);
    }
  });
  it("every team role reads its routes; only a team-admin changes them", () => {
    for (const r of ["team_viewer", "team_collaborator", "team_admin"] as const)
      expect(can(me(r), "model-endpoints:read", "team_a")).toBe(true);
    expect(can(me("team_admin"), "model-endpoints:write", "team_a")).toBe(true);
    expect(can(me("team_viewer"), "model-endpoints:write", "team_a")).toBe(false);
    expect(can(me("team_collaborator"), "model-endpoints:write", "team_a")).toBe(false);
    expect(can(me("security_operator"), "model-endpoints:read")).toBe(false);
    expect(can(me("team_admin"), "model-endpoints:write", "team_b"), "another team").toBe(false);
  });
});

describe("MCP grants (MCP-WEB-5, PRD Appendix A)", () => {
  const me = (r: Role) => meWithRole(r);
  it("only a service admin writes enterprise servers, settings and query capture", () => {
    for (const p of ["mcp-servers:write", "mcp-settings:write"] as const) {
      expect(can(me("service_admin"), p)).toBe(true);
      for (const r of [
        "team_viewer",
        "team_collaborator",
        "team_admin",
        "security_operator",
      ] as const)
        expect(can(me(r), p, scope(r)), `${r} and ${p}`).toBe(false);
    }
  });
  it("service admins and security operators read, review and suspend; team roles do not", () => {
    for (const p of ["mcp-servers:read", "mcp-servers:review", "mcp-servers:suspend"] as const) {
      expect(can(me("service_admin"), p)).toBe(true);
      expect(can(me("security_operator"), p)).toBe(true);
      for (const r of ["team_viewer", "team_collaborator", "team_admin"] as const)
        expect(can(me(r), p, "team_a"), `${r} and ${p}`).toBe(false);
    }
  });
  it("every team role reads its servers; only a team-admin changes them", () => {
    for (const r of ["team_viewer", "team_collaborator", "team_admin"] as const) {
      expect(can(me(r), "team-mcp-servers:read", "team_a")).toBe(true);
      expect(can(me(r), "mcp-events:read", "team_a")).toBe(true);
    }
    for (const p of ["team-mcp-servers:write", "agent-federated-identities:write"] as const) {
      expect(can(me("team_admin"), p, "team_a")).toBe(true);
      expect(can(me("team_viewer"), p, "team_a")).toBe(false);
      expect(can(me("team_collaborator"), p, "team_a")).toBe(false);
      expect(can(me("security_operator"), p)).toBe(false);
      expect(can(me("team_admin"), p, "team_b"), "another team").toBe(false);
    }
    expect(can(me("security_operator"), "team-mcp-servers:read")).toBe(false);
  });
  it("a team-admin approves team servers only when the API grants it (policy condition)", () => {
    expect(can(me("team_admin"), "team-mcp-servers:approve", "team_a")).toBe(false);
    const granted: Me = {
      ...base,
      serviceAdmin: false,
      securityOperator: false,
      teams: [
        {
          teamId: "team_a",
          slug: "a",
          role: "team_admin",
          permissions: ["team-mcp-servers:approve"],
        },
      ],
    };
    expect(can(granted, "team-mcp-servers:approve", "team_a")).toBe(true);
    expect(can(me("team_viewer"), "team-mcp-servers:approve", "team_a")).toBe(false);
  });
});

describe("the console gates only on catalog permissions", () => {
  const SRC = join(import.meta.dirname, "..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const f = join(dir, n);
      if (statSync(f).isDirectory()) return files(f);
      return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [f] : [];
    });
  it("finds no unknown permission name in a gate(), can() or permission field", () => {
    const known = new Set<string>(PERMISSIONS);
    const unknown: string[] = [];
    const re =
      /(?:gate\(\s*\w+\s*,\s*|can\(\s*\w+\s*,\s*|permission:\s*|visibleWhen[^)]*\(\s*)"([a-z-]+:[a-z-]+)"/g;
    for (const f of files(SRC)) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(re))
        if (!known.has(m[1] as string)) unknown.push(`${f}: ${m[1]}`);
    }
    expect(unknown).toEqual([]);
  });
});
