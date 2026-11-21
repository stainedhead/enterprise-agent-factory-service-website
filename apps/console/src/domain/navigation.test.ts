import { describe, expect, it } from "vitest";
import type { Me } from "./me.js";
import { EXTRA_ROUTES, NAV_ITEMS, routeFor, screenFor, visibleItems } from "./navigation.js";
import { ENTRIES } from "./permission.js";
import { SCREEN_IDS } from "./screens.js";

const perms = (role: "team_viewer" | "team_admin") =>
  ENTRIES.filter((e) => e.grants.some((g) => g.role === role && !g.condition)).map(
    (e) => e.permission,
  );
const mk = (o: Partial<Me> & Pick<Me, "teams">): Me => ({
  principal: { id: "u", type: "user" },
  serviceAdmin: false,
  securityOperator: false,
  ...o,
});
const svc = mk({ serviceAdmin: true, teams: [] });
const sec = mk({ securityOperator: true, teams: [] });
const admin = mk({
  teams: [{ teamId: "team_a", slug: "a", role: "team_admin", permissions: perms("team_admin") }],
});
const viewer = mk({
  teams: [{ teamId: "team_a", slug: "a", role: "team_viewer", permissions: perms("team_viewer") }],
});
const team = { teamId: "team_a", kind: "persistent" as const };
const ids = (items: readonly { id: string }[]) => items.map((i) => i.id);

describe("navigation (M0-D4)", () => {
  it("has every IA item of PRD §4.1", () => {
    expect(NAV_ITEMS).toHaveLength(30);
    const groups = new Set(NAV_ITEMS.map((i) => i.group));
    expect([...groups]).toEqual([
      "Service",
      "Governance",
      "Platform",
      "Team",
      "Configuration",
      "Cost",
      "History",
    ]);
    expect(ids(NAV_ITEMS)).toContain("config-values");
    expect(NAV_ITEMS.find((i) => i.id === "config-values")?.route).toBe("/t/:teamId/config");
    expect(new Set(ids(NAV_ITEMS)).size).toBe(NAV_ITEMS.length);
  });
  it("every item and extra route names a known screen", () => {
    const known = new Set<string>(SCREEN_IDS);
    for (const i of NAV_ITEMS) expect(known.has(i.screen), i.id).toBe(true);
    for (const r of EXTRA_ROUTES) expect(known.has(r.screen), r.route).toBe(true);
  });
  it("team roles never see Governance or Platform", () => {
    for (const me of [admin, viewer]) {
      const groups = new Set(visibleItems(me, team).map((i) => i.group));
      expect(groups.has("Governance")).toBe(false);
      expect(groups.has("Platform")).toBe(false);
      expect(groups.has("Service")).toBe(false);
    }
  });
  it("a viewer never sees API keys; a team-admin does", () => {
    expect(ids(visibleItems(viewer, team))).not.toContain("api-keys");
    expect(ids(visibleItems(admin, team))).toContain("api-keys");
    expect(ids(visibleItems(viewer, team))).toContain("agents");
  });
  it("Pools & stages shows only for ephemeral teams", () => {
    expect(ids(visibleItems(admin, team))).not.toContain("pools");
    expect(ids(visibleItems(admin, { ...team, kind: "ephemeral" }))).toContain("pools");
    expect(ids(visibleItems(svc, { teamId: "team_a", kind: "ephemeral" }))).toContain("pools");
    expect(ids(visibleItems(svc, { teamId: "team_a" }))).not.toContain("pools");
  });
  it("service settings are absent for team-admins and present for service admins", () => {
    expect(ids(visibleItems(admin))).not.toContain("service-settings");
    expect(ids(visibleItems(admin, team))).not.toContain("agent-templates");
    expect(ids(visibleItems(svc))).toContain("service-settings");
  });
  it("security operators see only Work orders and Swarm templates (WD-26)", () => {
    expect(ids(visibleItems(sec))).toEqual(["work-orders", "swarm-templates"]);
    expect(visibleItems(sec, team)).toHaveLength(2);
  });
  it("service admins see every service item without a team and team items with one", () => {
    expect(
      visibleItems(svc).every((i) => ["Service", "Governance", "Platform"].includes(i.group)),
    ).toBe(true);
    expect(ids(visibleItems(svc, team))).toContain("agents");
  });
  it("a caller with nothing sees nothing", () => {
    expect(visibleItems(mk({ teams: [] }), team)).toEqual([]);
  });
  it("viewers get V1 and V2; admins get T1 and T4; routes fill :teamId", () => {
    const overview = NAV_ITEMS.find((i) => i.id === "overview");
    const secrets = NAV_ITEMS.find((i) => i.id === "secrets");
    if (!overview || !secrets) throw new Error("missing");
    expect(screenFor(overview, viewer, "team_a")).toBe("V1");
    expect(screenFor(overview, admin, "team_a")).toBe("T1");
    expect(screenFor(secrets, viewer, "team_a")).toBe("V2");
    expect(screenFor(secrets, admin, "team_a")).toBe("T4");
    expect(screenFor(overview, admin)).toBe("T1");
    expect(routeFor(overview, "team_a")).toBe("/t/team_a");
    expect(routeFor(NAV_ITEMS[0]!)).toBe("/");
  });
});
