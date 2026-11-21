import { SEED_USERS, type SeedUser, userById } from "./users.js";

export interface IdpOptions {
  /** Issuer URL, no trailing slash, for example `http://127.0.0.1:4401`. */
  readonly issuer: string;
  /** Access-token lifetime in seconds. */
  readonly ttlSeconds?: number;
  /** Whether the token endpoint issues refresh tokens (otherwise the console renews in a frame). */
  readonly refreshTokens?: boolean;
}

interface Code {
  user: SeedUser;
  nonce: string | null;
  challenge: string;
  clientId: string;
  redirectUri: string;
}

const b64url = (b: ArrayBuffer | string) =>
  Buffer.from(typeof b === "string" ? b : new Uint8Array(b))
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * A fake OIDC provider for tests: discovery, authorize with auto-consent, token with refresh rotation,
 * JWKS and end-session. ID tokens are unsigned-in-effect (the console client does not verify signatures;
 * it relies on TLS to the token endpoint). One simulated browser session per instance.
 */
export class FakeIdp {
  readonly #o: { -readonly [K in keyof IdpOptions]-?: IdpOptions[K] };
  readonly #codes = new Map<string, Code>();
  readonly #refresh = new Map<string, { user: SeedUser; clientId: string }>();
  #n = 0;
  /** The user with an active IdP session; `prompt=none` succeeds only while this is set. */
  sessionUser: SeedUser | undefined;
  /** The user chosen for the next interactive authorize (the "login form"). */
  nextUser: SeedUser = SEED_USERS[0] as SeedUser;
  readonly requests: { method: string; path: string }[] = [];

  constructor(options: IdpOptions) {
    this.#o = { ttlSeconds: 300, refreshTokens: true, ...options };
  }

  setTtl(seconds: number): void {
    this.#o.ttlSeconds = seconds;
  }
  setRefreshTokens(on: boolean): void {
    this.#o.refreshTokens = on;
  }
  signInAs(id: string): void {
    const u = userById(id);
    if (!u) throw new Error(`unknown seed user ${id}`);
    this.nextUser = u;
  }
  /** Drops the IdP session and every refresh token, as an administrator revoking the user would. */
  revokeAll(): void {
    this.sessionUser = undefined;
    this.#refresh.clear();
  }

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    this.requests.push({ method: req.method, path: url.pathname });
    const iss = this.#o.issuer;
    switch (url.pathname) {
      case "/.well-known/openid-configuration":
        return json({
          issuer: iss,
          authorization_endpoint: `${iss}/authorize`,
          token_endpoint: `${iss}/token`,
          jwks_uri: `${iss}/jwks`,
          end_session_endpoint: `${iss}/logout`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        });
      case "/jwks":
        return json({ keys: [] });
      case "/authorize":
        return this.#authorize(url);
      case "/token":
        return this.#token(await req.formData().catch(() => new FormData()));
      case "/logout": {
        this.sessionUser = undefined;
        const back = url.searchParams.get("post_logout_redirect_uri");
        return back
          ? new Response(null, { status: 302, headers: { location: back } })
          : json({ ok: true });
      }
      default:
        return json({ error: "not_found" }, 404);
    }
  }

  #authorize(url: URL): Response {
    const q = url.searchParams;
    const redirect = q.get("redirect_uri");
    const state = q.get("state") ?? "";
    if (!redirect || q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) {
      return json({ error: "invalid_request" }, 400);
    }
    const back = (params: Record<string, string>) => {
      const r = new URL(redirect);
      for (const [k, v] of Object.entries({ ...params, state })) r.searchParams.set(k, v);
      return new Response(null, { status: 302, headers: { location: r.toString() } });
    };
    const hint = q.get("login_hint");
    let user = this.sessionUser;
    if (q.get("prompt") === "none") {
      if (!user) return back({ error: "login_required" });
    } else {
      user = (hint ? userById(hint) : undefined) ?? this.nextUser;
      this.sessionUser = user;
    }
    const code = `code-${++this.#n}`;
    this.#codes.set(code, {
      user,
      nonce: q.get("nonce"),
      challenge: q.get("code_challenge") as string,
      clientId: q.get("client_id") ?? "",
      redirectUri: redirect,
    });
    return back({ code });
  }

  async #token(form: FormData): Promise<Response> {
    const grant = form.get("grant_type");
    if (grant === "authorization_code") {
      const c = this.#codes.get(String(form.get("code")));
      this.#codes.delete(String(form.get("code")));
      if (!c || c.redirectUri !== form.get("redirect_uri") || c.clientId !== form.get("client_id"))
        return json({ error: "invalid_grant" }, 400);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(String(form.get("code_verifier"))),
      );
      if (b64url(digest) !== c.challenge) return json({ error: "invalid_grant" }, 400);
      return this.#issue(c.user, c.clientId, c.nonce);
    }
    if (grant === "refresh_token") {
      const rt = String(form.get("refresh_token"));
      const r = this.#refresh.get(rt);
      this.#refresh.delete(rt);
      if (!r) return json({ error: "invalid_grant" }, 400);
      return this.#issue(r.user, r.clientId, null);
    }
    return json({ error: "unsupported_grant_type" }, 400);
  }

  #issue(user: SeedUser, clientId: string, nonce: string | null): Response {
    const n = ++this.#n;
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: this.#o.issuer,
      sub: user.subject,
      aud: clientId,
      exp: now + 3600,
      iat: now,
      email: user.email,
      name: user.name,
      ...(nonce && { nonce }),
    };
    const idToken = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "fake" }))}.${b64url(JSON.stringify(claims))}.${b64url("sig")}`;
    const body: Record<string, unknown> = {
      access_token: `at.${user.id}.${n}`,
      token_type: "Bearer",
      expires_in: this.#o.ttlSeconds,
      id_token: idToken,
    };
    if (this.#o.refreshTokens) {
      const rt = `rt-${n}`;
      this.#refresh.set(rt, { user, clientId });
      body.refresh_token = rt;
    }
    return json(body);
  }
}
