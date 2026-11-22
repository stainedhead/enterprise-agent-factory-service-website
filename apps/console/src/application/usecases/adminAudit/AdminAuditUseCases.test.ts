import { describe, expect, it, vi } from "vitest";
import type { AdminAuditEventRecord, AdminAuditPort } from "../../ports/adminAudit.js";
import { AdminAuditUseCases, eventNote } from "./AdminAuditUseCases.js";

const ev = (over: Partial<AdminAuditEventRecord> = {}): AdminAuditEventRecord => ({
  id: 1,
  occurredAt: "2026-11-21T10:00:00Z",
  actorId: "usr_1",
  actorType: "user",
  action: "teams.suspend",
  outcome: "allowed",
  ...over,
});
const port = (): { [K in keyof AdminAuditPort]: ReturnType<typeof vi.fn> } & AdminAuditPort =>
  ({
    list: vi.fn(async () => ({ items: [ev()] })),
    csv: vi.fn(async () => "id\n1\n"),
  }) as never;

describe("AdminAuditUseCases (M4-A1, M4-A3)", () => {
  it("sends the filter without blank fields", async () => {
    const p = port();
    await new AdminAuditUseCases(p).page(
      { teamId: "team_1", actorId: " ", outcome: "denied" },
      { maxResults: 25 },
    );
    expect(p.list).toHaveBeenCalledWith(
      { teamId: "team_1", outcome: "denied" },
      { maxResults: 25 },
    );
  });
  it("refuses an end before the start without a request", async () => {
    const p = port();
    const u = new AdminAuditUseCases(p);
    await expect(
      u.page({ from: "2026-11-21T00:00:00Z", to: "2026-11-20T00:00:00Z" }, { maxResults: 25 }),
    ).rejects.toMatchObject({ fields: { to: expect.any(String) } });
    expect(p.list).not.toHaveBeenCalled();
  });
  it("downloads the CSV for the same filter and names the file by team", async () => {
    const p = port();
    const u = new AdminAuditUseCases(p);
    expect(await u.csv({ teamId: "team_1", action: "x" })).toEqual({
      filename: "audit-team_1.csv",
      text: "id\n1\n",
    });
    expect(p.csv).toHaveBeenCalledWith({ teamId: "team_1", action: "x" }, undefined);
    expect((await u.csv({})).filename).toBe("audit-service.csv");
  });
});

describe("eventNote (M4-A2)", () => {
  it("names the permission a denied request needed", () => {
    expect(
      eventNote(ev({ outcome: "denied", after: { requiredPermission: "teams:write" } })),
    ).toEqual({ kind: "denied", permission: "teams:write" });
    expect(eventNote(ev({ outcome: "denied" }))).toEqual({ kind: "denied", permission: undefined });
  });
  it("names the object a drift correction touched", () => {
    expect(
      eventNote(ev({ action: "drift.corrected", resourceKind: "agent", resourceId: "agt_1" })),
    ).toEqual({ kind: "drift", object: "agent agt_1" });
  });
  it("has no note for an ordinary allowed event", () => {
    expect(eventNote(ev())).toBeUndefined();
  });
});
