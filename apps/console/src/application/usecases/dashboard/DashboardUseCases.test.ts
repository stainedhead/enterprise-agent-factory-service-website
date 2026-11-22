import { describe, expect, it, vi } from "vitest";
import type { DashboardPort } from "../../ports/dashboard.js";
import type { AgentSummary, OverviewPort } from "../../ports/overview.js";
import type { TeamRecord, TeamsPort } from "../../ports/teams.js";
import {
  AGENT_SCAN_LIMIT,
  type AgentScan,
  agentTotals,
  attentionFor,
  DashboardUseCases,
  reconcilerHealth,
  spendSummary,
  teamCounts,
  topSpenders,
} from "./DashboardUseCases.js";

const NOW = Date.parse("2026-11-22T12:00:00Z");
const DAY = 86_400_000;
const status = (phase = "Ready", conditions: TeamRecord["status"]["conditions"] = []) => ({
  phase,
  observedGeneration: 1,
  conditions,
  updatedAt: "2026-11-22T00:00:00Z",
});
const team = (id: string, over: Partial<TeamRecord> = {}): TeamRecord =>
  ({
    id,
    slug: id,
    displayName: id.toUpperCase(),
    kind: "persistent",
    state: "active",
    namespace: `afs-${id}`,
    generation: 1,
    version: 1,
    status: status(),
    maxBudgetUsd: "1000.00",
    effectiveCeilingUsd: "1000.00",
    ...over,
  }) as TeamRecord;
const agent = (id: string, over: Partial<AgentSummary> = {}): AgentSummary => ({
  id,
  name: id,
  paused: false,
  status: status(),
  iamIdentity: "dedicated",
  ...over,
});

describe("summaries (M1-D1)", () => {
  const teams = [team("a"), team("b", { state: "suspended", kind: "ephemeral" }), team("c")];
  it("counts teams by state and kind", () => {
    expect(teamCounts(teams)).toEqual({ total: 3, active: 2, suspended: 1, ephemeral: 1 });
  });
  it("sums spend against the sum of budgets", () => {
    const s = spendSummary(teams, { a: { costUsd: "300.00" }, c: { costUsd: "450.50" } });
    expect(s).toEqual({
      spentUsd: "750.50",
      budgetUsd: "3000.00",
      percent: expect.closeTo(25.0, 0),
    });
  });
  it("is 0 percent with no budgets", () => {
    expect(spendSummary([], {}).percent).toBe(0);
  });
  it("ranks the top spenders and drops teams without spend", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g"].map((i) => team(i));
    const spend = Object.fromEntries(many.map((t, n) => [t.id, { costUsd: `${(n + 1) * 10}.00` }]));
    spend.a = { costUsd: "0.00" };
    const top = topSpenders(many, spend);
    expect(top.map((s) => s.teamId)).toEqual(["g", "f", "e", "d", "c"]);
  });
  it("totals agents and the degraded ones, ignoring paused", () => {
    const scan: AgentScan = {
      byTeam: new Map([
        [
          "a",
          [
            agent("x"),
            agent("y", { status: status("Degraded") }),
            agent("z", { paused: true, status: status("Degraded") }),
          ],
        ],
      ]),
      skippedTeams: 0,
    };
    expect(agentTotals(scan)).toEqual({ total: 3, degraded: 1 });
  });
});

describe("attentionFor (M1-D2)", () => {
  const none: AgentScan = { byTeam: new Map(), skippedTeams: 0 };
  const run = (t: TeamRecord, spend = {}, scan: AgentScan | undefined = none) =>
    attentionFor([t], spend, scan, NOW);

  it("lists nothing for a healthy team", () => {
    expect(run(team("a"))).toEqual([]);
  });
  it("flags an ephemeral team expiring within 7 days, and one already expired", () => {
    expect(
      run(team("a", { expiresAt: new Date(NOW + 3 * DAY).toISOString() }))[0]?.reasons[0],
    ).toEqual({ kind: "expiring", text: "Expires in 3 day(s)" });
    expect(
      run(team("a", { expiresAt: new Date(NOW - DAY).toISOString() }))[0]?.reasons[0]?.text,
    ).toBe("Expired");
    expect(run(team("a", { expiresAt: new Date(NOW + 8 * DAY).toISOString() }))).toEqual([]);
  });
  it("flags budget pressure from 80%, not below", () => {
    expect(run(team("a"), { a: { costUsd: "800.00" } })[0]?.reasons[0]?.kind).toBe("budget");
    expect(run(team("a"), { a: { costUsd: "799.00" } })).toEqual([]);
  });
  it("flags Budget blocked", () => {
    const t = team("a", {
      status: status("Ready", [
        { type: "BudgetExhausted", status: "True", lastTransitionTime: "x" },
      ]),
    });
    expect(run(t)[0]?.reasons.map((r) => r.kind)).toEqual(["blocked"]);
  });
  it("flags degraded agents by name", () => {
    const scan: AgentScan = {
      byTeam: new Map([["a", [agent("bad", { status: status("Degraded") })]]]),
      skippedTeams: 0,
    };
    expect(run(team("a"), {}, scan)[0]?.reasons[0]?.text).toBe("1 degraded agent: bad");
  });
  it("flags drift corrected in the last 24 hours only", () => {
    const cond = (hoursAgo: number) => [
      {
        type: "DriftCorrected",
        status: "True",
        lastTransitionTime: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
      },
    ];
    expect(run(team("a", { status: status("Ready", cond(2)) }))[0]?.reasons[0]?.kind).toBe("drift");
    expect(run(team("a", { status: status("Ready", cond(30)) }))).toEqual([]);
    const scan: AgentScan = {
      byTeam: new Map([["a", [agent("x", { status: status("Ready", cond(1)) })]]]),
      skippedTeams: 0,
    };
    expect(run(team("a"), {}, scan)[0]?.reasons[0]?.kind).toBe("drift");
  });
  it("shows every reason of a team and skips suspended teams", () => {
    const t = team("a", { expiresAt: new Date(NOW + DAY).toISOString() });
    expect(run(t, { a: { costUsd: "900.00" } })[0]?.reasons.map((r) => r.kind)).toEqual([
      "expiring",
      "budget",
    ]);
    expect(
      run(team("a", { state: "suspended", expiresAt: new Date(NOW + DAY).toISOString() })),
    ).toEqual([]);
  });
});

describe("reconcilerHealth", () => {
  it("uses the reconciler check when present", () => {
    expect(
      reconcilerHealth({ status: "ok", checks: { database: "ok", reconciler: "stale" } }),
    ).toMatchObject({ word: "Unhealthy", dot: "red" });
  });
  it("falls back to the overall status", () => {
    expect(reconcilerHealth({ status: "ok", checks: {} })).toMatchObject({
      word: "Healthy",
      dot: "green",
    });
    expect(reconcilerHealth({ status: "degraded", checks: {} }).word).toBe("Unhealthy");
  });
});

describe("DashboardUseCases fetching", () => {
  const dash: DashboardPort = {
    readiness: vi.fn(),
    varianceDays: vi.fn(),
    pendingProposals: vi.fn(),
  } as unknown as DashboardPort;

  it("pages through every team and drops deleted ones", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [team("a"), team("x", { state: "deleted" })],
        nextToken: "n",
      })
      .mockResolvedValueOnce({ items: [team("b")] });
    const uc = new DashboardUseCases({ list } as unknown as TeamsPort, {} as OverviewPort, dash, {
      now: () => NOW,
    });
    expect((await uc.allTeams()).map((t) => t.id)).toEqual(["a", "b"]);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ nextToken: "n" }));
  });

  it("reads agents of active teams only, capped, and reports the skipped ones", async () => {
    const agents = vi.fn(async () => [agent("x")]);
    const teams = [
      team("s", { state: "suspended" }),
      ...Array.from({ length: AGENT_SCAN_LIMIT + 3 }, (_, i) => team(`t${i}`)),
    ];
    const uc = new DashboardUseCases({} as TeamsPort, { agents } as unknown as OverviewPort, dash, {
      now: () => NOW,
    });
    const scan = await uc.scanAgents(teams);
    expect(agents).toHaveBeenCalledTimes(AGENT_SCAN_LIMIT);
    expect(scan.skippedTeams).toBe(3);
    expect(scan.byTeam.has("s")).toBe(false);
  });
});
