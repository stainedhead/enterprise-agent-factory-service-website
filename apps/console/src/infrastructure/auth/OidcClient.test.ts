import { describe, expect, it } from "vitest";
import { FakeIdp } from "../../../e2e/fake-afs/idp.js";
import { AuthError } from "../../application/ports/auth.js";
import type { ProviderInfo } from "../../application/ports/config.js";
import { type FlowStore, type PendingFlow, SessionFlowStore } from "../storage/SessionFlowStore.js";
import { OidcClient, postCallbackToParent } from "./OidcClient.js";

const ISSUER = "http://idp.test";
const REDIRECT = "http://console.test/auth/callback";
const provider: ProviderInfo = {
  id: "idp",
  kind: "okta",
  name: "Fake",
  issuerUrl: ISSUER,
  consoleClientId: "console",
  isDefault: true,
};

function setup(opts: { ttl?: number; refresh?: boolean } = {}) {
  const idp = new FakeIdp({
    issuer: ISSUER,
    ...(opts.ttl && { ttlSeconds: opts.ttl }),
    ...(opts.refresh === false && { refreshTokens: false }),
  });
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) =>
    idp.handle(new Request(input, init))) as typeof fetch;
  const map = new Map<string, PendingFlow>();
  const flows: FlowStore = {
    put: (s, f) => void map.set(s, f),
    take: (s) => {
      const f = map.get(s);
      map.delete(s);
      return f;
    },
    discard: (s) => void map.delete(s),
  };
  const client = new OidcClient({
    flows,
    fetcher,
    allowInsecure: true,
    frameTimeoutMs: 20,
    createFrame: () => document.createElement("div") as unknown as HTMLIFrameElement,
  });
  /** Follows the authorize redirect the way a browser would, without the IdP page. */
  const authorize = async (url: string) =>
    (await fetcher(url, { redirect: "manual" })).headers.get("location") as string;
  return { idp, client, flows: map, fetcher, authorize };
}

describe("OidcClient", () => {
  it("builds a PKCE S256 authorize URL and remembers the flow", async () => {
    const { client, flows } = setup();
    const u = new URL(
      await client.begin(provider, { redirectUri: REDIRECT, returnTo: "/t/team_1" }),
    );
    expect(u.origin + u.pathname).toBe(`${ISSUER}/authorize`);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("console");
    expect(u.searchParams.get("prompt")).toBeNull();
    const state = u.searchParams.get("state") as string;
    expect(flows.get(state)?.returnTo).toBe("/t/team_1");
    // the verifier never appears in the URL
    expect(u.toString()).not.toContain(flows.get(state)?.verifier);
  });

  it("completes the code exchange, validating state and nonce, and forgets the flow", async () => {
    const { client, flows, authorize } = setup();
    const cb = await authorize(
      await client.begin(provider, { redirectUri: REDIRECT, returnTo: "/x" }),
    );
    const { tokens, returnTo } = await client.complete(cb, 1000);
    expect(returnTo).toBe("/x");
    expect(tokens.accessToken).toMatch(/^at\.svc-admin\./);
    expect(tokens.expiresAt).toBe(1000 + 300_000);
    expect(tokens.refreshToken).toBeDefined();
    expect(flows.size).toBe(0);
    await expect(client.complete(cb, 1000)).rejects.toMatchObject({ reason: "state" }); // single use
  });

  it("rejects an unknown state, an IdP error and a missing state", async () => {
    const { client } = setup();
    await expect(client.complete(`${REDIRECT}?code=x&state=nope`, 0)).rejects.toMatchObject({
      reason: "state",
    });
    await expect(client.complete(`${REDIRECT}?code=x`, 0)).rejects.toMatchObject({
      reason: "state",
    });
  });

  it("maps provider errors: login_required to interaction_required, others to denied", async () => {
    const { client, flows } = setup();
    for (const [err, reason] of [
      ["login_required", "interaction_required"],
      ["access_denied", "denied"],
    ] as const) {
      const u = new URL(await client.begin(provider, { redirectUri: REDIRECT, returnTo: "/" }));
      const state = u.searchParams.get("state") as string;
      await expect(
        client.complete(`${REDIRECT}?error=${err}&state=${state}`, 0),
      ).rejects.toMatchObject({ reason });
    }
    expect(flows.size).toBe(0);
  });

  it("rejects a code the IdP refuses (wrong verifier) as an exchange failure", async () => {
    const { client, flows, authorize } = setup();
    const url = await client.begin(provider, { redirectUri: REDIRECT, returnTo: "/" });
    const state = new URL(url).searchParams.get("state") as string;
    const flow = flows.get(state) as PendingFlow;
    flows.set(state, { ...flow, verifier: "x".repeat(50) });
    await expect(client.complete(await authorize(url), 0)).rejects.toMatchObject({
      reason: "exchange",
    });
  });

  it("rejects an ID token whose nonce does not match", async () => {
    const { client, flows, authorize } = setup();
    const url = await client.begin(provider, { redirectUri: REDIRECT, returnTo: "/" });
    const state = new URL(url).searchParams.get("state") as string;
    const flow = flows.get(state) as PendingFlow;
    flows.set(state, { ...flow, nonce: "different" });
    await expect(client.complete(await authorize(url), 0)).rejects.toMatchObject({
      reason: "nonce",
    });
  });

  it("refreshes with rotation; a reused or revoked refresh token fails", async () => {
    const { client, idp, authorize } = setup();
    const { tokens } = await client.complete(
      await authorize(await client.begin(provider, { redirectUri: REDIRECT, returnTo: "/" })),
      0,
    );
    const next = await client.refresh(provider, tokens.refreshToken as string, 5);
    expect(next.accessToken).not.toBe(tokens.accessToken);
    expect(next.refreshToken).not.toBe(tokens.refreshToken);
    await expect(client.refresh(provider, tokens.refreshToken as string, 5)).rejects.toBeInstanceOf(
      AuthError,
    );
    idp.revokeAll();
    await expect(client.refresh(provider, next.refreshToken as string, 5)).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it("builds the end-session URL, or none when the provider has no such endpoint", async () => {
    const { client } = setup();
    const u = new URL(
      (await client.endSessionUrl(provider, "idtok", "http://console.test/signed-out")) as string,
    );
    expect(u.pathname).toBe("/logout");
    expect(u.searchParams.get("id_token_hint")).toBe("idtok");
    expect(u.searchParams.get("post_logout_redirect_uri")).toBe("http://console.test/signed-out");
    const bare = new OidcClient({
      flows: new SessionFlowStore(() => globalThis.sessionStorage),
      allowInsecure: true,
      fetcher: (async () =>
        new Response(
          JSON.stringify({
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/a`,
            token_endpoint: `${ISSUER}/t`,
          }),
          { headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });
    expect(await bare.endSessionUrl(provider, undefined, "x")).toBeUndefined();
  });

  async function frameOf(): Promise<HTMLIFrameElement> {
    for (let i = 0; i < 100; i++) {
      const f = document.querySelector("div[aria-hidden]") as HTMLIFrameElement | null;
      if (f?.src) return f;
      await new Promise((r) => setTimeout(r, 1));
    }
    throw new Error("no frame");
  }

  it("silent renewal: completes from the callback the frame posts", async () => {
    const { client, idp, authorize } = setup();
    idp.sessionUser = idp.nextUser;
    const pending = client.renewInFrame(provider, "http://localhost:3000/auth/callback", 0);
    const frame = await frameOf();
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(new URL(frame.src).searchParams.get("prompt")).toBe("none");
    const cb = await authorize(frame.src);
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://evil.test",
        data: { type: "afs-callback", url: cb },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://localhost:3000",
        data: { type: "afs-callback", url: cb },
      }),
    );
    const t = await pending;
    expect(t?.accessToken).toMatch(/^at\.svc-admin\./);
    expect(document.querySelector("div[aria-hidden]")).toBeNull();
  });

  it("silent renewal: undefined when the IdP needs the user or nothing arrives", async () => {
    const { client, authorize } = setup();
    const a = client.renewInFrame(provider, "http://localhost:3000/auth/callback", 0);
    const cb = await authorize((await frameOf()).src); // no IdP session: login_required
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://localhost:3000",
        data: { type: "afs-callback", url: cb },
      }),
    );
    await expect(a).resolves.toBeUndefined();
    await expect(
      client.renewInFrame(provider, "http://localhost:3000/auth/callback", 0),
    ).resolves.toBeUndefined(); // timeout
  });

  it("silent renewal: a renewal that times out removes its own flow", async () => {
    const { client, flows } = setup();
    await expect(
      client.renewInFrame(provider, "http://localhost:3000/auth/callback", 0),
    ).resolves.toBeUndefined(); // the frame never answers: timeout
    expect(flows.size).toBe(0);
  });

  it("flows carry their creation time", async () => {
    const { client, flows } = setup();
    const before = Date.now();
    const u = new URL(await client.begin(provider, { redirectUri: REDIRECT, returnTo: "/" }));
    const created = flows.get(u.searchParams.get("state") as string)?.createdAt as number;
    expect(created).toBeGreaterThanOrEqual(before);
    expect(created).toBeLessThanOrEqual(Date.now());
  });

  it("a blocked store makes begin fail with an AuthError saying browser storage is required", async () => {
    const { fetcher } = setup();
    const client = new OidcClient({
      flows: new SessionFlowStore(() => {
        throw new Error("SecurityError");
      }),
      fetcher,
      allowInsecure: true,
    });
    const err = await client
      .begin(provider, { redirectUri: REDIRECT, returnTo: "/" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).reason).toBe("storage");
    expect((err as AuthError).message).toMatch(/browser storage is required for sign-in/i);
  });

  it("login-required carries the flow's return route (FR-013)", async () => {
    const { client, authorize } = setup();
    const url = await client.begin(provider, {
      redirectUri: REDIRECT,
      returnTo: "/t/team_1/agents",
    });
    const cb = await authorize(url); // no IdP session and prompt=none would be login_required; force it
    const withErr = new URL(cb);
    withErr.searchParams.delete("code");
    withErr.searchParams.set("error", "login_required");
    const err = await client.complete(withErr.toString(), 0).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).reason).toBe("interaction_required");
    expect((err as AuthError).returnTo).toBe("/t/team_1/agents");
  });

  it("postCallbackToParent posts only from inside a frame", () => {
    const sent: unknown[] = [];
    const top = {
      location: { href: "http://x/cb?code=1", origin: "http://x" },
    } as unknown as Window;
    (top as { parent: Window }).parent = top;
    expect(postCallbackToParent(top)).toBe(false);
    const child = {
      location: { href: "http://x/cb?code=1", origin: "http://x" },
      parent: { postMessage: (m: unknown, o: string) => sent.push([m, o]) },
    } as unknown as Window;
    expect(postCallbackToParent(child)).toBe(true);
    expect(sent).toEqual([[{ type: "afs-callback", url: "http://x/cb?code=1" }, "http://x"]]);
  });
});
