import { describe, expect, it, vi } from "vitest";
import type { ProviderInfo } from "../../ports/config.js";
import { Boot, PROVIDER_PREF, safeReturnTo } from "./Boot.js";
import { DraftStore } from "./DraftStore.js";
import { ListProviders } from "./ListProviders.js";
import { ReAuthenticate } from "./ReAuthenticate.js";
import type { Session } from "./Session.js";
import { SignOut } from "./SignOut.js";

const p = (id: string): ProviderInfo => ({
  id,
  kind: "oidc",
  name: id,
  issuerUrl: "https://i.test",
  consoleClientId: "c",
  isDefault: true,
});

function setup(remembered?: string, listed: ProviderInfo[] = [p("a"), p("b")]) {
  const prefs = new Map<string, string>(remembered ? [[PROVIDER_PREF, remembered]] : []);
  const begin = { execute: vi.fn(async () => {}) };
  const redirect = { navigate: vi.fn(), replaceUrl: vi.fn() };
  const drafts = new DraftStore();
  const persisted = { write: vi.fn(), take: vi.fn(() => ({ form: { name: "x" } })) };
  const boot = new Boot(
    new ListProviders({ list: async () => listed }, []),
    begin as never,
    {
      get: (k) => prefs.get(k),
      set: (k, v) => void prefs.set(k, v),
      remove: (k) => void prefs.delete(k),
    },
    drafts,
    persisted,
    redirect,
  );
  return { boot, begin, redirect, drafts, persisted };
}

describe("Boot", () => {
  it("restores carried drafts and recognises the auth routes", async () => {
    const { boot, drafts } = setup();
    expect(await boot.execute({ pathname: "/auth/callback", search: "?code=1" })).toEqual({
      kind: "callback",
    });
    expect(drafts.get("form")).toEqual({ name: "x" });
    expect(await boot.execute({ pathname: "/sign-in", search: "" })).toEqual({ kind: "auth-page" });
    expect(await boot.execute({ pathname: "/signed-out", search: "" })).toEqual({
      kind: "auth-page",
    });
  });
  it("tries a silent sign-in with the remembered provider, keeping the route", async () => {
    const { boot, begin } = setup("b");
    expect(await boot.execute({ pathname: "/t/team_1/agents", search: "?x=1" })).toEqual({
      kind: "silent",
      provider: p("b"),
    });
    expect(begin.execute).toHaveBeenCalledWith(p("b"), "/t/team_1/agents?x=1", "none");
  });
  it("goes to the sign-in page with no remembered provider, or one that is gone", async () => {
    for (const s of [setup(), setup("zz")]) {
      expect(await s.boot.execute({ pathname: "/t/x", search: "" })).toEqual({
        kind: "sign-in",
        returnTo: "/t/x",
      });
      expect(s.redirect.replaceUrl).toHaveBeenCalledWith("/sign-in?returnTo=%2Ft%2Fx");
      expect(s.begin.execute).not.toHaveBeenCalled();
    }
  });
});

describe("safeReturnTo", () => {
  it.each([
    ["/t/team_1", "/t/team_1"],
    ["//evil.test", "/"],
    ["/\\evil.test", "/"],
    ["https://evil.test", "/"],
    ["", "/"],
    [null, "/"],
    [undefined, "/"],
  ])("%s -> %s", (raw, want) => expect(safeReturnTo(raw)).toBe(want));
});

describe("SignOut", () => {
  it("lands on the provider end-session URL, else /signed-out", async () => {
    const redirect = { navigate: vi.fn(), replaceUrl: vi.fn() };
    const session = (url?: string) => ({ signOut: vi.fn(async () => url) }) as unknown as Session;
    const a = session("https://i.test/logout");
    await new SignOut(a, redirect, "https://c.test").execute();
    expect(a.signOut).toHaveBeenCalledWith("https://c.test/signed-out");
    expect(redirect.navigate).toHaveBeenLastCalledWith("https://i.test/logout");
    await new SignOut(session(), redirect, "https://c.test").execute();
    expect(redirect.navigate).toHaveBeenLastCalledWith("/signed-out");
  });
});

describe("ReAuthenticate", () => {
  it("persists drafts then starts sign-in at the same route", async () => {
    const begin = { execute: vi.fn(async () => {}) };
    const persisted = { write: vi.fn(), take: vi.fn() };
    const drafts = new DraftStore();
    drafts.save("f", { a: "1" });
    await new ReAuthenticate(begin as never, drafts, persisted).execute(p("a"), "/t/x");
    expect(persisted.write).toHaveBeenCalledWith({ f: { a: "1" } });
    expect(begin.execute).toHaveBeenCalledWith(p("a"), "/t/x");
  });
});
