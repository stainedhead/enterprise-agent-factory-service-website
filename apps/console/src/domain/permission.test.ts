import { describe, expect, it } from "vitest";
import { can, isServiceAdmin, type Principal } from "./permission.js";

const admin: Principal = { subject: "a", displayName: "A", bindings: [{ role: "service_admin" }] };
const teamAdmin: Principal = {
  subject: "t",
  displayName: "T",
  bindings: [{ role: "team_admin", teamId: "team_a" }],
};
const viewer: Principal = {
  subject: "v",
  displayName: "V",
  bindings: [{ role: "team_viewer", teamId: "team_a" }],
};

describe("can", () => {
  it.each([
    [admin, "teams:create", "", true],
    [admin, "agents:write", "team_b", true],
    [teamAdmin, "agents:write", "team_a", true],
    [teamAdmin, "agents:write", "team_b", false],
    [teamAdmin, "teams:create", "", false],
    [teamAdmin, "budgets:set-ceiling", "team_a", false],
    [viewer, "agents:read", "team_a", true],
    [viewer, "secrets:read-metadata", "team_a", true],
    [viewer, "secrets:write", "team_a", false],
    [viewer, "teams:read", "team_b", false],
  ] as const)("%o %s on %s -> %s", (p, perm, team, want) => {
    expect(can(p, perm, team)).toBe(want);
  });

  it("identifies service admins", () => {
    expect(isServiceAdmin(admin)).toBe(true);
    expect(isServiceAdmin(teamAdmin)).toBe(false);
  });
});
