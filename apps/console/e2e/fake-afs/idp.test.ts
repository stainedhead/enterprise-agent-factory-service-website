// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FakeIdp } from "./idp.js";

const ISS = "http://idp.test";
const authorize = (idp: FakeIdp, q: Record<string, string>) =>
  idp.handle(
    new Request(
      `${ISS}/authorize?${new URLSearchParams({ redirect_uri: "http://c.test/cb", state: "s1", code_challenge: "x", code_challenge_method: "S256", client_id: "c", ...q })}`,
      { redirect: "manual" },
    ),
  );

describe("FakeIdp", () => {
  it("publishes discovery and an empty JWKS", async () => {
    const idp = new FakeIdp({ issuer: ISS });
    const d = (await (
      await idp.handle(new Request(`${ISS}/.well-known/openid-configuration`))
    ).json()) as Record<string, string>;
    expect(d.issuer).toBe(ISS);
    expect(d.end_session_endpoint).toBe(`${ISS}/logout`);
    expect(
      ((await (await idp.handle(new Request(`${ISS}/jwks`))).json()) as { keys: unknown[] }).keys,
    ).toEqual([]);
    expect((await idp.handle(new Request(`${ISS}/other`))).status).toBe(404);
  });
  it("prompt=none needs an IdP session; interactive sign-in creates one for the chosen user; logout ends it", async () => {
    const idp = new FakeIdp({ issuer: ISS });
    const none = await authorize(idp, { prompt: "none" });
    expect(none.headers.get("location")).toContain("error=login_required");
    expect(none.headers.get("location")).toContain("state=s1");
    idp.signInAs("viewer");
    expect((await authorize(idp, {})).headers.get("location")).toContain("code=");
    expect(idp.sessionUser?.id).toBe("viewer");
    expect((await authorize(idp, { prompt: "none" })).headers.get("location")).toContain("code=");
    expect((await authorize(idp, { login_hint: "sec-op" })).status).toBe(302);
    expect(idp.sessionUser?.id).toBe("sec-op");
    const out = await idp.handle(
      new Request(`${ISS}/logout?post_logout_redirect_uri=http://c.test/signed-out`, {
        redirect: "manual",
      }),
    );
    expect(out.headers.get("location")).toBe("http://c.test/signed-out");
    expect(idp.sessionUser).toBeUndefined();
    expect((await idp.handle(new Request(`${ISS}/logout`))).status).toBe(200);
  });
  it("answers CORS preflight and tags every response with CORS headers", async () => {
    const idp = new FakeIdp({ issuer: ISS });
    const pre = await idp.handle(new Request(`${ISS}/token`, { method: "OPTIONS" }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("*");
    expect(
      (await idp.handle(new Request(`${ISS}/jwks`))).headers.get("access-control-allow-origin"),
    ).toBe("*");
  });
  it("rejects a malformed authorize request, an unknown seed user and unsupported grants", async () => {
    const idp = new FakeIdp({ issuer: ISS });
    expect((await authorize(idp, { code_challenge_method: "plain" })).status).toBe(400);
    expect(() => idp.signInAs("nobody")).toThrow(/unknown seed user/);
    const form = new FormData();
    form.set("grant_type", "password");
    expect(
      (await idp.handle(new Request(`${ISS}/token`, { method: "POST", body: form }))).status,
    ).toBe(400);
  });
  it("issues no refresh token when disabled and honours the configured lifetime", async () => {
    const idp = new FakeIdp({ issuer: ISS, ttlSeconds: 30, refreshTokens: false });
    const loc = (
      await authorize(idp, { code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" })
    ).headers.get("location") as string;
    const code = new URL(loc).searchParams.get("code") as string;
    const form = new FormData();
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("redirect_uri", "http://c.test/cb");
    form.set("client_id", "c");
    form.set("code_verifier", "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
    const tok = (await (
      await idp.handle(new Request(`${ISS}/token`, { method: "POST", body: form }))
    ).json()) as Record<string, unknown>;
    expect(tok.expires_in).toBe(30);
    expect(tok.refresh_token).toBeUndefined();
    idp.setTtl(60);
    idp.setRefreshTokens(true);
  });
});
