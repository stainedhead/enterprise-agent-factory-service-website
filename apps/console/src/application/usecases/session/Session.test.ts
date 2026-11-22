import { describe, expect, it, vi } from "vitest";
import { AuthError, type ClockPort, type OidcPort, type SessionTokens } from "../../ports/auth.js";
import type { ProviderInfo } from "../../ports/config.js";
import { BeginSignIn, CompleteSignIn } from "./CompleteSignIn.js";
import { IdleMonitor } from "./IdleMonitor.js";
import { Session } from "./Session.js";

const provider: ProviderInfo = {
  id: "idp",
  kind: "oidc",
  name: "Corp",
  issuerUrl: "https://i.test",
  consoleClientId: "c",
  isDefault: true,
};

class FakeClock implements ClockPort {
  t = 1_000_000;
  timers = new Map<number, { at: number; fn: () => void }>();
  #n = 0;
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = ++this.#n;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  }
  clearTimeout(h: unknown) {
    this.timers.delete(h as number);
  }
  async advance(ms: number) {
    this.t += ms;
    for (const [id, tm] of [...this.timers])
      if (tm.at <= this.t) {
        this.timers.delete(id);
        tm.fn();
      }
    await Promise.resolve();
    await Promise.resolve();
  }
}

const tokens = (clock: FakeClock, over: Partial<SessionTokens> = {}): SessionTokens => ({
  accessToken: "at1",
  idToken: "id1",
  refreshToken: "rt1",
  expiresAt: clock.t + 300_000,
  providerId: "idp",
  ...over,
});

function setup(over: Partial<OidcPort> = {}) {
  const clock = new FakeClock();
  const handlers: ((m: string) => void)[] = [];
  const posts: string[] = [];
  const oidc: OidcPort = {
    begin: vi.fn(async () => "https://i.test/authorize?x"),
    complete: vi.fn(async () => ({ tokens: tokens(clock), returnTo: "/t/team_1" })),
    refresh: vi.fn(async (_p, _r, now) => ({
      accessToken: "at2",
      expiresAt: now + 300_000,
      providerId: "idp",
    })),
    endSessionUrl: vi.fn(async () => "https://i.test/logout"),
    renewInFrame: vi.fn(async (_p, _r, now) => ({
      accessToken: "at3",
      expiresAt: now + 300_000,
      providerId: "idp",
    })),
    ...over,
  };
  const clear = vi.fn();
  const session = new Session({
    oidc,
    clock,
    redirectUri: "https://c.test/cb",
    clearCaches: clear,
    providerById: (id) => (id === "idp" ? provider : undefined),
    channel: {
      post: (m) => posts.push(m),
      subscribe: (h) => {
        handlers.push(h);
        return () => handlers.splice(handlers.indexOf(h), 1);
      },
    },
  });
  return { clock, oidc, session, handlers, posts, clear };
}

describe("Session", () => {
  it("serves the access token while fresh and renews at exp-60s with the refresh token", async () => {
    const { clock, oidc, session } = setup();
    session.establish(tokens(clock));
    expect(session.state).toBe("active");
    expect(await session.accessToken({ forceRefresh: false })).toBe("at1");
    await clock.advance(239_000);
    expect(oidc.refresh).not.toHaveBeenCalled();
    await clock.advance(1_000);
    expect(oidc.refresh).toHaveBeenCalledOnce();
    expect(await session.accessToken({ forceRefresh: false })).toBe("at2");
    expect(session.idToken).toBeUndefined();
    expect(session.providerId).toBe("idp");
  });
  it("renews in a frame when there is no refresh token", async () => {
    const { clock, oidc, session } = setup();
    session.establish(tokens(clock, { refreshToken: undefined as unknown as string }));
    expect(await session.accessToken({ forceRefresh: true })).toBe("at3");
    expect(oidc.renewInFrame).toHaveBeenCalled();
  });
  it("shares one renewal between concurrent callers", async () => {
    const { clock, oidc, session } = setup();
    session.establish(tokens(clock));
    const [a, b] = await Promise.all([
      session.accessToken({ forceRefresh: true }),
      session.accessToken({ forceRefresh: true }),
    ]);
    expect(a).toBe("at2");
    expect(b).toBe("at2");
    expect(oidc.refresh).toHaveBeenCalledOnce();
  });
  it("renews on demand inside the lead window", async () => {
    const { clock, session } = setup();
    session.establish(tokens(clock, { expiresAt: clock.t + 30_000 }));
    expect(await session.accessToken({ forceRefresh: false })).toBe("at2");
  });
  it("expires when renewal needs the user, and rejects the token request", async () => {
    const { clock, session, clear } = setup({ renewInFrame: async () => undefined });
    const seen: string[] = [];
    session.onChange((s) => seen.push(s));
    session.establish(tokens(clock, { refreshToken: undefined as unknown as string }));
    await expect(session.accessToken({ forceRefresh: true })).rejects.toMatchObject({
      reason: "interaction_required",
    });
    expect(session.state).toBe("expired");
    expect(seen).toEqual(["active", "expired"]);
    expect(clear).not.toHaveBeenCalled(); // the page and its cache stay for re-authentication
    await expect(session.accessToken({ forceRefresh: false })).rejects.toBeInstanceOf(AuthError);
  });
  it("expires when the refresh grant throws or the provider is unknown", async () => {
    const a = setup({
      refresh: async () => {
        throw new Error("invalid_grant");
      },
    });
    a.session.establish(tokens(a.clock));
    await expect(a.session.accessToken({ forceRefresh: true })).rejects.toBeInstanceOf(AuthError);
    expect(a.session.state).toBe("expired");
    const b = setup();
    b.session.establish(tokens(b.clock, { providerId: "other" }));
    await expect(b.session.accessToken({ forceRefresh: true })).rejects.toBeInstanceOf(AuthError);
    expect(b.session.state).toBe("expired");
  });
  it("sign-out clears tokens and caches, broadcasts and returns the end-session URL", async () => {
    const { clock, session, posts, clear } = setup();
    session.establish(tokens(clock));
    expect(await session.signOut("https://c.test/signed-out")).toBe("https://i.test/logout");
    expect(session.state).toBe("signed-out");
    expect(posts).toEqual(["signout"]);
    expect(clear).toHaveBeenCalled();
    expect(clock.timers.size).toBe(0);
  });
  it("sign-out still completes when the end-session lookup fails or there is no session", async () => {
    const { clock, session } = setup({
      endSessionUrl: async () => {
        throw new Error("x");
      },
    });
    session.establish(tokens(clock));
    expect(await session.signOut("/x")).toBeUndefined();
    expect(await session.signOut("/x")).toBeUndefined();
  });
  it("signs out when another tab broadcasts, and ignores other messages", () => {
    const { clock, session, handlers } = setup();
    session.establish(tokens(clock));
    handlers[0]?.("hello");
    expect(session.state).toBe("active");
    handlers[0]?.("signout");
    expect(session.state).toBe("signed-out");
  });
  it("ignores a renewal that finishes after sign-out", async () => {
    let release: (t: SessionTokens) => void = () => {};
    const { clock, session } = setup({
      refresh: () =>
        new Promise((r) => {
          release = r;
        }),
    });
    session.establish(tokens(clock));
    const p = session.accessToken({ forceRefresh: true });
    await session.signOut("/x");
    release(tokens(clock));
    await expect(p).rejects.toBeInstanceOf(AuthError);
    expect(session.state).toBe("signed-out");
  });
  it("dispose stops the timer and listeners", () => {
    const { clock, session, handlers } = setup();
    session.establish(tokens(clock));
    session.dispose();
    expect(clock.timers.size).toBe(0);
    expect(handlers.length).toBe(0);
  });
});

describe("BeginSignIn and CompleteSignIn", () => {
  it("navigates to the authorize URL", async () => {
    const { oidc } = setup();
    const navigate = vi.fn();
    await new BeginSignIn(
      oidc,
      { navigate, replaceUrl: vi.fn() },
      { redirectUri: "https://c.test/cb" },
    ).execute(provider, "/t/x", "none");
    expect(oidc.begin).toHaveBeenCalledWith(provider, {
      redirectUri: "https://c.test/cb",
      returnTo: "/t/x",
      prompt: "none",
    });
    expect(navigate).toHaveBeenCalledWith("https://i.test/authorize?x");
    await new BeginSignIn(oidc, { navigate, replaceUrl: vi.fn() }, { redirectUri: "r" }).execute(
      provider,
      "/",
    );
    expect(oidc.begin).toHaveBeenLastCalledWith(provider, { redirectUri: "r", returnTo: "/" });
  });
  it("establishes the session on success", async () => {
    const { oidc, session, clock } = setup();
    expect(
      await new CompleteSignIn(oidc, session, clock).execute("https://c.test/cb?code=x"),
    ).toEqual({ kind: "signed-in", returnTo: "/t/team_1" });
    expect(session.state).toBe("active");
  });
  it("maps refusals: login_required, other auth errors, unknown errors", async () => {
    const mk = (e: unknown) => {
      const s = setup({
        complete: async () => {
          throw e;
        },
      });
      return new CompleteSignIn(s.oidc, s.session, s.clock).execute("u");
    };
    expect(await mk(new AuthError("interaction_required", "x"))).toEqual({
      kind: "login-required",
    });
    expect(await mk(new AuthError("state", "bad state"))).toMatchObject({
      kind: "error",
      error: { reason: "state" },
    });
    expect(await mk(new Error("boom"))).toMatchObject({
      kind: "error",
      error: { reason: "exchange" },
    });
  });
});

describe("IdleMonitor", () => {
  it("fires after the idle period and resets on activity", async () => {
    const clock = new FakeClock();
    const idle = vi.fn();
    const m = new IdleMonitor(clock, 5, idle);
    m.touch();
    await clock.advance(10 * 60_000);
    expect(idle).not.toHaveBeenCalled(); // not started
    m.start();
    await clock.advance(4 * 60_000);
    m.touch();
    await clock.advance(4 * 60_000);
    expect(idle).not.toHaveBeenCalled();
    await clock.advance(60_000);
    expect(idle).toHaveBeenCalledOnce();
    m.touch();
    expect(clock.timers.size).toBe(0);
  });
  it("stop cancels", async () => {
    const clock = new FakeClock();
    const idle = vi.fn();
    const m = new IdleMonitor(clock, 5, idle);
    m.start();
    m.stop();
    await clock.advance(10 * 60_000);
    expect(idle).not.toHaveBeenCalled();
  });
});
