import { describe, expect, it } from "vitest";
import {
  AdminOrgAccountsUseCases,
  globMatches,
  matchAccounts,
  narrowing,
  parsePatterns,
} from "./AdminOrgAccountsUseCases.js";

const A = [
  { accountId: "111122223333", name: "prod-payments", status: "active" },
  { accountId: "222233334444", name: "prod-platform", status: "active" },
  { accountId: "444455556666", name: "staging-payments", status: "active" },
];

describe("globMatches (M4-W1)", () => {
  it("matches * and ? and treats everything else literally", () => {
    expect(globMatches("*-payments", "prod-payments")).toBe(true);
    expect(globMatches("1111*", "111122223333")).toBe(true);
    expect(globMatches("11112222333?", "111122223333")).toBe(true);
    expect(globMatches("prod.payments", "prod-payments")).toBe(false);
    expect(globMatches("prod", "prod-payments")).toBe(false);
    expect(globMatches("*", "anything")).toBe(true);
  });
  it("parses patterns from lines, commas and spaces without blanks or duplicates", () => {
    expect(parsePatterns("a*,\n b?  a*")).toEqual(["a*", "b?"]);
    expect(parsePatterns("  ")).toEqual([]);
  });
});

describe("matchAccounts (M4-W1)", () => {
  it("shows the first pattern that matched and the link count", () => {
    const m = matchAccounts(["1111*", "*-payments"], A, { "111122223333": 2, "444455556666": 1 });
    expect(m.map((x) => [x.account.accountId, x.pattern, x.links])).toEqual([
      ["111122223333", "1111*", 2],
      ["444455556666", "*-payments", 1],
    ]);
  });
});

describe("narrowing (M4-W2)", () => {
  it("lists the accounts the next filter drops, with their links", () => {
    const lost = narrowing(["*-payments"], ["prod-*"], A, { "444455556666": 3 });
    expect(lost.map((l) => [l.account.accountId, l.links])).toEqual([["444455556666", 3]]);
  });
  it("is empty when the filter only widens", () => {
    expect(narrowing(["prod-payments"], ["*-payments"], A, {})).toEqual([]);
  });
});

describe("AdminOrgAccountsUseCases", () => {
  const port = {
    listOrgAccounts: async () => A,
    listAllowed: async () => [A[0] as (typeof A)[number]],
    linkCounts: async () => ({}),
  };
  it("service admins read the organization; team roles the allowed accounts", async () => {
    const u = new AdminOrgAccountsUseCases(port);
    expect(await u.accounts("t1", true)).toHaveLength(3);
    expect(await u.accounts("t1", false)).toHaveLength(1);
  });
  it("refuses an empty filter", () => {
    const u = new AdminOrgAccountsUseCases(port);
    expect(u.check([])?.fields.filter).toBeTruthy();
    expect(u.check(["*"])).toBeUndefined();
  });
});
