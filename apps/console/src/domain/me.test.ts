import { describe, expect, it } from "vitest";
import { activeRole, can, hasNoAccess, type Me, teamOf } from "./me.js";
import { CATALOG, ENTRIES, type Permission } from "./permission.js";

const VIEWER_PERMS = ENTRIES.filter((e) =>
  e.grants.some((g) => g.role === "team_viewer" && !g.condition),
).map((e) => e.permission);
const ADMIN_PERMS = ENTRIES.filter((e) =>
  e.grants.some((g) => g.role === "team_admin" && !g.condition),
).map((e) => e.permission);

const base = { principal: { id: "usr_1", type: "user" as const } };
const svc: Me = { ...base, serviceAdmin: true, securityOperator: false, teams: [] };
const sec: Me = { ...base, serviceAdmin: false, securityOperator: true, teams: [] };
const admin: Me = {
  ...base,
  serviceAdmin: false,
  securityOperator: false,
  teams: [{ teamId: "team_a", slug: "a", role: "team_admin", permissions: ADMIN_PERMS }],
};
const viewer: Me = {
  ...base,
  serviceAdmin: false,
  securityOperator: false,
  teams: [{ teamId: "team_a", slug: "a", role: "team_viewer", permissions: VIEWER_PERMS }],
};
const apiKey: Me = {
  principal: { id: "key_1", type: "api_key" },
  serviceAdmin: false,
  securityOperator: false,
  teams: admin.teams,
};
const none: Me = { ...base, serviceAdmin: false, securityOperator: false, teams: [] };

describe("can (M0-D1)", () => {
  it("service admin may do everything, in any team and at service level", () => {
    for (const p of CATALOG.map((e) => e.permission)) {
      expect(can(svc, p), p).toBe(true);
      expect(can(svc, p, "team_zzz"), p).toBe(true);
    }
  });
  it("security operator: service-level directory and work orders yes, admin and team routes no", () => {
    expect(can(sec, "teams:read-directory")).toBe(true);
    expect(can(sec, "work-orders:write")).toBe(true);
    expect(can(sec, "swarm-templates:read")).toBe(true);
    expect(can(sec, "admin:settings")).toBe(false);
    expect(can(sec, "teams:read", "team_a")).toBe(false);
    expect(can(sec, "teams:create")).toBe(false);
  });
  it("team-admin may write in its team only", () => {
    expect(can(admin, "agents:write", "team_a")).toBe(true);
    expect(can(admin, "agents:write", "team_b")).toBe(false);
    expect(can(admin, "teams:create", "team_a")).toBe(false);
    expect(can(admin, "teams:set-guardrails", "team_a")).toBe(false);
  });
  it("team-admin, viewer and team API key are denied teams:read-directory and service permissions", () => {
    for (const me of [admin, viewer, apiKey, none]) {
      expect(can(me, "teams:read-directory"), me.principal.id).toBe(false);
      expect(can(me, "admin:settings")).toBe(false);
    }
  });
  it("viewer reads but cannot write", () => {
    expect(can(viewer, "agents:read", "team_a")).toBe(true);
    expect(can(viewer, "agents:write", "team_a")).toBe(false);
    expect(can(viewer, "api-keys:read", "team_a")).toBe(false);
    expect(can(viewer, "members:write", "team_a")).toBe(false);
  });
  it("servicePermissions, when present, decides service-level checks (F-1)", () => {
    const me: Me = { ...sec, servicePermissions: ["work-orders:read"] };
    expect(can(me, "work-orders:read")).toBe(true);
    expect(can(me, "work-orders:write")).toBe(false);
    const emptyAdmin: Me = { ...svc, servicePermissions: [] };
    expect(can(emptyAdmin, "admin:settings")).toBe(false);
  });
  it("conditional grants follow the permissions the API put in the team entry", () => {
    const withCond: Me = {
      ...viewer,
      teams: [
        {
          ...viewer.teams[0]!,
          permissions: [...VIEWER_PERMS, "teams:get-kubeconfig" as Permission],
        },
      ],
    };
    expect(can(withCond, "teams:get-kubeconfig", "team_a")).toBe(true);
    expect(can(viewer, "teams:get-kubeconfig", "team_a")).toBe(false);
  });
});

describe("helpers", () => {
  it("teamOf, hasNoAccess and activeRole", () => {
    expect(teamOf(admin, "team_a")?.slug).toBe("a");
    expect(teamOf(admin, "x")).toBeUndefined();
    expect(hasNoAccess(none)).toBe(true);
    expect(hasNoAccess(sec)).toBe(false);
    expect(hasNoAccess(viewer)).toBe(false);
    expect(activeRole(svc)).toBe("service_admin");
    expect(activeRole(sec)).toBe("security_operator");
    expect(activeRole(admin, "team_a")).toBe("team_admin");
    expect(activeRole(viewer)).toBe("team_viewer");
    expect(activeRole(none)).toBe("none");
  });
});
