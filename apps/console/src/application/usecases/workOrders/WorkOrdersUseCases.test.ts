import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors.js";
import type { WorkOrderRecord, WorkOrdersPort } from "../../ports/workOrders.js";
import {
  emptyRepo,
  ownerProblems,
  parseRepoRef,
  prefillOwners,
  repoArg,
  reposOfTeams,
  toCreateInput,
  validateWorkOrder,
  type WorkOrderDraft,
  WorkOrdersUseCases,
} from "./WorkOrdersUseCases.js";

const draft = (over: Partial<WorkOrderDraft> = {}): WorkOrderDraft => ({
  kind: "cve_remediation",
  cveId: "CVE-2026-1234",
  severity: "critical",
  title: "OpenSSL RCE",
  slaDueAt: "2026-11-28T18:00",
  templateId: "swt_1",
  budgetUsd: "500",
  repos: [{ ref: "github.com/acme/payments-api", teamId: "", email: "" }],
  ...over,
});
const wo = (over: Partial<WorkOrderRecord> = {}): WorkOrderRecord => ({
  id: "wo_1",
  title: "t",
  severity: "high",
  status: "open",
  slaState: "on_track",
  slaDueAt: "2026-11-25T00:00:00Z",
  ...over,
});

describe("validateWorkOrder (M6-W3)", () => {
  it("accepts a complete draft", () => expect(validateWorkOrder(draft(), ["swt_1"])).toEqual({}));
  it("refuses each missing or malformed field", () => {
    const e = validateWorkOrder(
      draft({
        title: " ",
        cveId: "CVE-1",
        slaDueAt: "",
        templateId: "swt_2",
        budgetUsd: "abc",
        repos: [{ ref: "nope", teamId: "", email: "bad" }],
      }),
      ["swt_1"],
    );
    expect(Object.keys(e).sort()).toEqual(
      [
        "budgetUsd",
        "cveId",
        "repos.0.email",
        "repos.0.ref",
        "slaDueAt",
        "templateId",
        "title",
      ].sort(),
    );
  });
  it("needs a repository, an enabled template, and no repository twice", () => {
    expect(validateWorkOrder(draft({ repos: [] }), ["swt_1"]).repos).toBeTruthy();
    expect(validateWorkOrder(draft({ templateId: "" }), ["swt_1"]).templateId).toBeTruthy();
    const dup = validateWorkOrder(
      draft({
        repos: [
          draft().repos[0] as never,
          { ref: "GitHub.com/acme/Payments-API", teamId: "", email: "" },
        ],
      }),
      ["swt_1"],
    );
    expect(dup["repos.1.ref"]).toBe("Listed twice");
  });
  it("needs a CVE only for a CVE remediation, and a budget above zero", () => {
    expect(validateWorkOrder(draft({ kind: "general", cveId: "" }), ["swt_1"])).toEqual({});
    expect(validateWorkOrder(draft({ budgetUsd: "0" }), ["swt_1"]).budgetUsd).toBeTruthy();
  });
});

describe("repository references and owners (M6-W3, M6-W4)", () => {
  it("splits host/owner/repo", () => {
    expect(parseRepoRef("github.com/acme/api")).toEqual({ host: "github.com", repo: "acme/api" });
    expect(parseRepoRef("acme/api")).toBeUndefined();
  });
  it("renders the --repos entry for none, a team, an email and both", () => {
    const r = { ...emptyRepo, ref: "github.com/acme/api" };
    expect(repoArg(r)).toBe("github.com/acme/api");
    expect(repoArg({ ...r, teamId: "team_1" })).toBe("github.com/acme/api=team_1");
    expect(repoArg({ ...r, email: "ops@example.com" })).toBe("github.com/acme/api=ops@example.com");
    expect(repoArg({ ...r, teamId: "team_1", email: "ops@example.com" })).toBe(
      "github.com/acme/api=team_1,ops@example.com",
    );
  });
  it("builds the request with the owners that were chosen", () => {
    const i = toCreateInput(
      draft({
        repos: [{ ref: "github.com/acme/api", teamId: "team_1", email: " ops@example.com " }],
      }),
    );
    expect(i.repos).toEqual([
      {
        host: "github.com",
        repo: "acme/api",
        owningTeamId: "team_1",
        owningContact: "ops@example.com",
      },
    ]);
    expect(i.budgetUsd).toBe("500.00");
    expect(i.slaDueAt).toMatch(/Z$/);
    expect(toCreateInput(draft({ kind: "general" })).cveId).toBeUndefined();
  });
  it("reads ambiguous and unowned repositories from a 400 and pre-fills the first candidate", () => {
    const e = new AppError({
      kind: "validation",
      message: "owners",
      details: {
        ambiguousRepos: [{ repo: "github.com/acme/api", teamIds: ["team_2", "team_3"] }],
        unownedRepos: ["github.com/acme/web"],
      },
    });
    const p = ownerProblems(e);
    expect(p?.unowned.has("github.com/acme/web")).toBe(true);
    const out = prefillOwners(
      [
        { ref: "github.com/acme/api", teamId: "", email: "" },
        { ref: "github.com/acme/web", teamId: "", email: "" },
      ],
      p as NonNullable<typeof p>,
    );
    expect(out.map((r) => r.teamId)).toEqual(["team_2", ""]);
  });
  it("does not override an owner already chosen, and ignores other errors", () => {
    const p = ownerProblems(
      new AppError({
        kind: "validation",
        message: "x",
        details: { ambiguousRepos: [{ repo: "github.com/a/b", teamIds: ["team_2"] }] },
      }),
    );
    expect(
      prefillOwners([{ ref: "github.com/a/b", teamId: "team_9", email: "" }], p as never)[0]
        ?.teamId,
    ).toBe("team_9");
    expect(ownerProblems(new AppError({ kind: "validation", message: "x" }))).toBeUndefined();
    expect(ownerProblems(new AppError({ kind: "conflict", message: "x" }))).toBeUndefined();
    expect(ownerProblems(new Error("x"))).toBeUndefined();
  });
  it("keeps only the repositories an owning team holds", () => {
    const r = (id: string | null) => ({
      host: "h",
      repo: "o/r",
      status: "pending",
      owningTeamId: id,
      notifications: [],
    });
    expect(reposOfTeams([r("team_1"), r("team_2"), r(null)], ["team_1"])).toHaveLength(1);
  });
});

describe("WorkOrdersUseCases", () => {
  const port = (over: Partial<WorkOrdersPort> = {}) =>
    ({
      listForTeam: vi.fn(),
      list: vi.fn(async () => [
        wo({ id: "a", severity: "low" }),
        wo({ id: "b", severity: "critical" }),
      ]),
      create: vi.fn(async () => ({ ...wo(), repos: [] })),
      get: vi.fn(),
      cancel: vi.fn(async () => wo({ status: "cancelled" })),
      update: vi.fn(),
      repos: vi.fn(),
      updateRepo: vi.fn(),
      ...over,
    }) as unknown as WorkOrdersPort;

  it("lists most severe first", async () => {
    expect((await new WorkOrdersUseCases(port()).list({})).map((w) => w.id)).toEqual(["b", "a"]);
  });
  it("refuses an invalid draft without calling the API", async () => {
    const p = port();
    await expect(
      new WorkOrdersUseCases(p).create(draft({ title: "" }), ["swt_1"]),
    ).rejects.toMatchObject({
      kind: "validation",
      fields: { title: "Enter a title" },
    });
    expect(p.create).not.toHaveBeenCalled();
  });
  it("creates with a valid draft", async () => {
    const p = port();
    await new WorkOrdersUseCases(p).create(draft(), ["swt_1"]);
    expect(p.create).toHaveBeenCalledOnce();
  });
  it("cancels only with a reason", async () => {
    const p = port();
    const uc = new WorkOrdersUseCases(p);
    await expect(uc.cancel("wo_1", "  ")).rejects.toMatchObject({ kind: "validation" });
    await uc.cancel("wo_1", " duplicate ");
    expect(p.cancel).toHaveBeenCalledWith("wo_1", "duplicate");
  });
  it("finds the open work order for a CVE, never a closed one", async () => {
    const p = port({
      list: vi.fn(async () => [
        wo({ id: "x", cveId: "CVE-2026-1", status: "done" }),
        wo({ id: "y", cveId: "CVE-2026-1", status: "in_progress" }),
      ]),
    });
    expect((await new WorkOrdersUseCases(p).openForCve("CVE-2026-1"))?.id).toBe("y");
    expect(await new WorkOrdersUseCases(p).openForCve("CVE-2026-2")).toBeUndefined();
  });
});
