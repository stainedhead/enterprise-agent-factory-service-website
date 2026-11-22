import { type Fixture, type FixtureResponse, fixtureModules } from "./fixtures/index.js";
import { Contract, type RouteDef } from "./openapi.js";
import { principalFromToken, type SeedUser } from "./users.js";

export interface RecordedRequest {
  readonly at: number;
  readonly method: string;
  readonly path: string;
  readonly query: string;
  readonly operationId: string | undefined;
  readonly principal: string | undefined;
  readonly status: number;
  readonly mutating: boolean;
}

export interface Injection {
  /** Matches `METHOD path` (a regular expression source or a substring). */
  readonly match: string;
  readonly status: 429 | 503;
  readonly times: number;
  readonly retryAfterSeconds?: number;
}

export interface FakeAfsOptions {
  /** The fake IdP's issuer URL, returned by `ListSignInProviders`. */
  readonly idpIssuer: string;
  /** Overrides the contract version header, for the "newer server" notice. */
  readonly contractVersion?: string;
  readonly fixtures?: readonly (readonly Fixture[])[];
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
  });

/**
 * An in-process stand-in for afs-api: routes from the pinned OpenAPI, fixtures validated against it,
 * the principal taken from the bearer token, `If-Match` and `Idempotency-Key` rules, error injection,
 * CORS and a request recorder. It never contacts a real service.
 */
export class FakeAfs {
  readonly contract = new Contract();
  readonly recorded: RecordedRequest[] = [];
  contractVersion: string;
  readonly #opts: FakeAfsOptions;
  readonly #fixtures = new Map<string, Fixture>();
  readonly #versions = new Map<string, number>();
  readonly #idem = new Map<string, { hash: string; status: number; body: unknown }>();
  #injections: { inj: Injection; left: number }[] = [];
  #seq = 0;

  constructor(opts: FakeAfsOptions) {
    this.#opts = opts;
    this.contractVersion = opts.contractVersion ?? this.contract.version;
    for (const f of (opts.fixtures ?? fixtureModules).flat())
      this.#fixtures.set(`${f.method} ${f.path}`, f);
    this.#validateAtLoad();
  }

  /** Static fixtures are checked against the contract when the server is built; a mismatch throws. */
  #validateAtLoad(): void {
    const problems: string[] = [];
    for (const [key, f] of this.#fixtures) {
      const route = this.contract.routes.find(
        (r) => r.method === f.method && r.template === f.path,
      );
      if (!route) {
        problems.push(`${key}: not in the pinned OpenAPI`);
        continue;
      }
      if (typeof f.response !== "function")
        problems.push(
          ...this.contract
            .validateResponse(route, f.response.status, f.response.body)
            .map((e) => `${key} ${e}`),
        );
    }
    if (problems.length > 0)
      throw new Error(`Fake AFS fixtures violate the contract:\n${problems.join("\n")}`);
  }

  inject(i: Injection): void {
    this.#injections.push({ inj: i, left: i.times });
  }
  clearInjections(): void {
    this.#injections = [];
  }
  reset(): void {
    this.recorded.length = 0;
    this.#versions.clear();
    this.#idem.clear();
    this.clearInjections();
    this.contractVersion = this.#opts.contractVersion ?? this.contract.version;
  }

  #cors(req: Request): Record<string, string> {
    const origin = req.headers.get("origin");
    return {
      "access-control-allow-origin": origin ?? "*",
      vary: "Origin",
      "access-control-allow-headers":
        "Authorization, Content-Type, If-Match, Idempotency-Key, X-Request-Id",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-expose-headers":
        "ETag, X-Request-Id, X-Afs-Contract-Version, X-Afs-Next-Token, Retry-After, Idempotent-Replayed",
    };
  }

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const requestId = req.headers.get("x-request-id") ?? `req_fake_${++this.#seq}`;
    const base = {
      ...this.#cors(req),
      "x-request-id": requestId,
      "x-afs-contract-version": this.contractVersion,
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: base });

    const record = (
      operationId: string | undefined,
      principal: SeedUser | undefined,
      status: number,
    ) =>
      this.recorded.push({
        at: Date.now(),
        method: req.method,
        path: url.pathname,
        query: url.search,
        operationId,
        principal: principal?.id,
        status,
        mutating: req.method !== "GET" && req.method !== "HEAD",
      });
    const done = (
      operationId: string | undefined,
      principal: SeedUser | undefined,
      status: number,
      body: unknown,
      headers: Record<string, string> = {},
    ) => {
      record(operationId, principal, status);
      return json(status, body, { ...base, ...headers });
    };
    const errorBody = (code: string, message: string) => ({ code, message, requestId });

    const found = this.contract.match(req.method, url.pathname);
    if (!found) return done(undefined, undefined, 404, errorBody("NotFound", "No such route"));
    const { route, params } = found;

    const bearer = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
    const principal = bearer ? principalFromToken(bearer) : undefined;
    if (route.scope !== "public" && !principal)
      return done(
        route.operationId,
        undefined,
        401,
        errorBody("Unauthenticated", "Missing or unknown bearer token"),
      );

    const key = `${req.method} ${url.pathname}`;
    const inj = this.#injections.find((x) => x.left > 0 && new RegExp(x.inj.match).test(key));
    if (inj) {
      inj.left--;
      const retry = inj.inj.retryAfterSeconds;
      return done(
        route.operationId,
        principal,
        inj.inj.status,
        errorBody(inj.inj.status === 429 ? "Throttled" : "Unavailable", "Injected failure"),
        retry !== undefined ? { "retry-after": String(retry) } : {},
      );
    }

    const fixture = this.#fixtures.get(`${route.method} ${route.template}`);
    if (!fixture)
      return done(
        route.operationId,
        principal,
        501,
        errorBody("NotImplemented", `No fixture for ${route.operationId}`),
      );

    const text = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
    let body: unknown;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return done(
          route.operationId,
          principal,
          400,
          errorBody("ValidationError", "Body is not JSON"),
        );
      }
    }

    const concurrency = this.#concurrency(req, route, url.pathname);
    if (concurrency)
      return done(
        route.operationId,
        principal,
        concurrency.status,
        errorBody(concurrency.code, concurrency.message),
      );

    const idem = this.#idempotency(req, route, url.pathname, text);
    if (idem?.replay)
      return done(route.operationId, principal, idem.replay.status, idem.replay.body, {
        "idempotent-replayed": "true",
      });
    if (idem?.conflict)
      return done(
        route.operationId,
        principal,
        409,
        errorBody("Conflict", "Idempotency-Key reused with a different request"),
      );

    const resp: FixtureResponse =
      typeof fixture.response === "function"
        ? fixture.response({
            principal,
            params,
            query: url.searchParams,
            body,
            config: { idpIssuer: this.#opts.idpIssuer },
          })
        : fixture.response;
    const problems = this.contract.validateResponse(route, resp.status, resp.body);
    if (problems.length > 0)
      return done(
        route.operationId,
        principal,
        500,
        errorBody("InternalError", `Fixture violates the contract: ${problems.join("; ")}`),
      );

    const headers: Record<string, string> = { ...resp.headers };
    const version = (resp.body as { version?: unknown } | undefined)?.version;
    if (req.method === "GET" && typeof version === "number") {
      this.#versions.set(url.pathname, version);
      headers.etag = `"${version}"`;
    }
    if (idem?.key)
      this.#idem.set(idem.key, { hash: idem.hash, status: resp.status, body: resp.body });
    return done(route.operationId, principal, resp.status, resp.body, headers);
  }

  /** `If-Match` rules: missing on a required route is 428; a stale version is 412. */
  #concurrency(
    req: Request,
    route: RouteDef,
    pathname: string,
  ): { status: number; code: string; message: string } | undefined {
    if (route.ifMatch === "none" || req.method === "GET") return undefined;
    const sent = req.headers.get("if-match");
    if (sent === null)
      return route.ifMatch === "required"
        ? { status: 428, code: "PreconditionRequired", message: "If-Match is required" }
        : undefined;
    const current = this.#versions.get(pathname) ?? 1;
    return sent.replaceAll('"', "") === String(current)
      ? undefined
      : {
          status: 412,
          code: "PreconditionFailed",
          message: "The resource changed; reload and retry",
        };
  }

  #idempotency(req: Request, route: RouteDef, pathname: string, text: string) {
    if (!route.idempotent || req.method !== "POST") return undefined;
    const k = req.headers.get("idempotency-key");
    if (!k) return undefined;
    const key = `${pathname}|${k}`;
    const hash = text;
    const prior = this.#idem.get(key);
    if (!prior)
      return { key, hash } as {
        key: string;
        hash: string;
        replay?: { status: number; body: unknown };
        conflict?: boolean;
      };
    return prior.hash === hash ? { key, hash, replay: prior } : { key, hash, conflict: true };
  }
}
