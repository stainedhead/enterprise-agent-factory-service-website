import { describe, expect, it } from "vitest";
import { label } from "./labels.js";
import { isCredentialLikeName, isValidName } from "./names.js";
import { filterSearch, type SearchEntry } from "./search.js";
import { formatLocal, utcTitle } from "./time.js";

describe("names", () => {
  it("validates slugs", () => {
    for (const ok of ["payments", "a1b", "team-one-2"]) expect(isValidName(ok), ok).toBe(true);
    for (const bad of ["ab", "1abc", "Abc", "abc-", "a_b", "x".repeat(41), ""])
      expect(isValidName(bad), bad).toBe(false);
  });
  it("flags credential-like config names", () => {
    for (const n of ["DB_PASSWORD", "apiToken", "my-secret", "ssh_key", "Api-KEY"])
      expect(isCredentialLikeName(n), n).toBe(true);
    for (const n of ["region", "log-level", "feature-flag"])
      expect(isCredentialLikeName(n), n).toBe(false);
  });
});

describe("labels", () => {
  it("maps known values and passes unknown through", () => {
    expect(label("roleLinkStatus", "pending_trust")).toBe("Pending trust");
    expect(label("roleLinkStatus", "verified")).toBe("Verified");
    expect(label("roleLinkStatus", "brand_new")).toBe("brand_new");
    expect(label("workOrderStatus", "in_progress")).toBe("In progress");
    expect(label("teamKind", "ephemeral")).toBe("Ephemeral");
  });
});

describe("time", () => {
  it("formats in the given zone and gives UTC hover text", () => {
    expect(formatLocal("2026-11-21T18:00:00Z", "UTC")).toContain("18:00");
    expect(formatLocal("2026-11-21T18:00:00Z", "Asia/Tokyo")).toContain("03:00");
    expect(utcTitle("2026-11-21T18:00:00.000Z")).toBe("2026-11-21T18:00:00Z (UTC)");
    expect(formatLocal("garbage")).toBe("garbage");
    expect(utcTitle("garbage")).toBe("garbage");
    expect(formatLocal("2026-11-21T18:00:00Z")).toBeTruthy();
  });
});

describe("search (M0-D6)", () => {
  const e = (type: SearchEntry["type"], n: number, label = `${type}-${n}`): SearchEntry => ({
    type,
    id: `${type}_${n}`,
    label,
    route: `/${type}/${n}`,
  });
  const index = [
    e("agent", 1),
    e("team", 1, "Payments"),
    e("team", 2, "Payroll"),
    e("pool", 1),
    e("work-order", 1),
  ];
  it("needs at least 2 characters", () => {
    expect(filterSearch(index, "")).toEqual([]);
    expect(filterSearch(index, "p")).toEqual([]);
    expect(filterSearch(index, " p ")).toEqual([]);
  });
  it("groups by type in a stable order", () => {
    const g = filterSearch(index, "pa");
    expect(g.map((x) => x.type)).toEqual(["team"]);
    const all = filterSearch(index, "-1");
    expect(all.map((x) => x.type)).toEqual(["agent", "pool", "work-order"]);
  });
  it("matches ids as well as labels, case-insensitively", () => {
    expect(filterSearch(index, "PAYR")[0]?.entries[0]?.id).toBe("team_2");
    expect(filterSearch(index, "TEAM_1")[0]?.entries).toHaveLength(1);
  });
  it("returns at most 10 matches in total", () => {
    const many = Array.from({ length: 30 }, (_, i) => e(i % 2 ? "team" : "agent", i, `match ${i}`));
    const g = filterSearch(many, "match");
    expect(g.flatMap((x) => x.entries)).toHaveLength(10);
    expect(g.map((x) => x.type)).toEqual(["team"]);
  });
});
