import { describe, expect, it } from "vitest";
import type { ProviderInfo } from "../../ports/config.js";
import { chooseProvider, resolveTeamDeepLink } from "./chooseProvider.js";
import { DraftStore } from "./DraftStore.js";
import { ListProviders } from "./ListProviders.js";

const p = (id: string, isDefault = false): ProviderInfo => ({
  id,
  kind: "oidc",
  name: id,
  issuerUrl: "https://i.test",
  consoleClientId: "c",
  isDefault,
});

describe("chooseProvider", () => {
  it("none when there are no providers", () =>
    expect(chooseProvider({ providers: [] })).toEqual({ kind: "none" }));
  it("redirects on a deep-link provider", () => {
    expect(chooseProvider({ providers: [p("a"), p("b")], deepLinkProvider: "b" })).toEqual({
      kind: "redirect",
      provider: p("b"),
    });
  });
  it("ignores an unknown deep-link provider", () => {
    expect(
      chooseProvider({ providers: [p("a"), p("b", true)], deepLinkProvider: "zz" }),
    ).toMatchObject({ kind: "pick", preselected: "b" });
  });
  it("redirects straight to a sole provider", () => {
    expect(chooseProvider({ providers: [p("a")] })).toEqual({ kind: "redirect", provider: p("a") });
  });
  it("preselects remembered, then default, then first", () => {
    const ps = [p("a"), p("b", true), p("c")];
    expect(chooseProvider({ providers: ps, remembered: "c" })).toMatchObject({ preselected: "c" });
    expect(chooseProvider({ providers: ps })).toMatchObject({ preselected: "b" });
    expect(chooseProvider({ providers: [p("a"), p("c")] })).toMatchObject({ preselected: "a" });
  });
});

describe("resolveTeamDeepLink", () => {
  const teams = [{ teamId: "team_1" }];
  it("none without a teamId", () =>
    expect(resolveTeamDeepLink(teams, undefined)).toEqual({ kind: "none" }));
  it("routes to a visible team", () =>
    expect(resolveTeamDeepLink(teams, "team_1")).toEqual({ kind: "team", route: "/t/team_1" }));
  it("is not-found for a team the caller cannot see", () =>
    expect(resolveTeamDeepLink(teams, "team_2")).toEqual({ kind: "not-found" }));
});

describe("ListProviders", () => {
  it("uses the API list", async () => {
    const r = await new ListProviders({ list: async () => [p("a")] }, [p("f")]).execute();
    expect(r).toEqual({ providers: [p("a")], usedFallback: false });
  });
  it("falls back on error or an empty list", async () => {
    const bad = await new ListProviders(
      {
        list: async () => {
          throw new Error("down");
        },
      },
      [p("f")],
    ).execute();
    expect(bad).toEqual({ providers: [p("f")], usedFallback: true });
    const empty = await new ListProviders({ list: async () => [] }, [p("f")]).execute();
    expect(empty.usedFallback).toBe(true);
  });
});

describe("DraftStore", () => {
  it("saves copies, restores a snapshot, discards and clears", () => {
    const d = new DraftStore();
    const f = { name: "x" };
    d.save("form", f);
    f.name = "changed";
    expect(d.get("form")).toEqual({ name: "x" });
    const snap = d.snapshot();
    const e = new DraftStore();
    e.restore(snap);
    expect(e.get("form")).toEqual({ name: "x" });
    expect(e.get("none")).toBeUndefined();
    e.discard("form");
    expect(e.get("form")).toBeUndefined();
    d.clear();
    expect(d.snapshot()).toEqual({});
  });
});
