import { describe, expect, it, vi } from "vitest";
import type { AppError } from "../../errors.js";
import type { AuditPort, RevisionRecord, RevisionsPort } from "../../ports/history.js";
import { cleanFilter, HistoryUseCases, snapshotText } from "./HistoryUseCases.js";

const rev = (
  revision: number,
  snapshot: Record<string, unknown>,
  over: Partial<RevisionRecord> = {},
): RevisionRecord => ({
  revision,
  resourceKind: "team",
  resourceId: "team_1",
  operation: "update",
  changedBy: "usr_a",
  changedAt: "2026-11-21T10:00:00Z",
  snapshot,
  ...over,
});

const setup = () => {
  const audit = {
    list: vi.fn(async () => ({ items: [] })),
    csv: vi.fn(async () => "id,action\n1,x\n"),
  };
  const revisions = {
    list: vi.fn(async () => ({ items: [] })),
    get: vi.fn(async (_t: string, n: number) => rev(n, { name: `v${n}`, b: 2, a: 1 })),
  };
  return {
    audit,
    revisions,
    uc: new HistoryUseCases(audit as unknown as AuditPort, revisions as unknown as RevisionsPort),
  };
};

describe("snapshotText", () => {
  it("orders keys at every level so equal snapshots are equal text", () => {
    expect(snapshotText({ b: 1, a: { d: 1, c: 2 } })).toBe(
      snapshotText({ a: { c: 2, d: 1 }, b: 1 }),
    );
    expect(snapshotText({ b: 1, a: 2 })).toBe('{\n  "a": 2,\n  "b": 1\n}');
  });
  it("renders a missing snapshot as an empty object", () => {
    expect(snapshotText(undefined)).toBe("{}");
  });
});

describe("audit (M1-H1)", () => {
  it("drops blank filter fields from the query", async () => {
    const { audit, uc } = setup();
    await uc.auditPage(
      "team_1",
      { actorId: " ", action: "agents.create", outcome: "" },
      { maxResults: 25 },
    );
    expect(audit.list).toHaveBeenCalledWith(
      "team_1",
      { action: "agents.create" },
      { maxResults: 25 },
    );
    expect(cleanFilter({ from: "", to: "x" })).toEqual({ to: "x" });
  });

  it("refuses an end before the start without calling the API", async () => {
    const { audit, uc } = setup();
    const err = await uc
      .auditPage(
        "team_1",
        { from: "2026-11-02T00:00:00Z", to: "2026-11-01T00:00:00Z" },
        { maxResults: 25 },
      )
      .catch((e) => e);
    expect((err as AppError).fields.to).toBeTruthy();
    expect(audit.list).not.toHaveBeenCalled();
  });

  it("builds the CSV download for the current filter", async () => {
    const { audit, uc } = setup();
    const r = await uc.auditCsv("team_1", { outcome: "denied" });
    expect(r).toEqual({ filename: "audit-team_1.csv", text: "id,action\n1,x\n" });
    expect(audit.csv).toHaveBeenCalledWith("team_1", { outcome: "denied" }, undefined);
  });
});

describe("diff (M1-H2)", () => {
  it("orders the two revisions older to newer whatever the selection order", async () => {
    const { uc, revisions } = setup();
    revisions.get.mockImplementation(async (_t, n) => rev(n, { name: `v${n}` }));
    const d = await uc.diff("team_1", 7, 3);
    expect([d.older.revision, d.newer.revision]).toEqual([3, 7]);
    expect(d.before).toContain("v3");
    expect(d.after).toContain("v7");
  });

  it("refuses the same revision twice and revisions of different resources", async () => {
    const { uc, revisions } = setup();
    expect(
      ((await uc.diff("team_1", 1, 1).catch((e) => e)) as AppError).fields.revision,
    ).toBeTruthy();
    revisions.get.mockImplementation(async (_t, n) => rev(n, {}, { resourceId: `r${n}` }));
    expect(((await uc.diff("team_1", 1, 2).catch((e) => e)) as AppError).fields.revision).toContain(
      "same resource",
    );
  });
});
