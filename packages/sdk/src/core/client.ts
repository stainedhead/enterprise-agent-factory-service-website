import { CONTRACT_VERSION, type OperationId, operations } from "../generated/operations.js";
import type { AuthProvider } from "./auth.js";
import { AfsError, AfsNetworkError, errorFromBody } from "./errors.js";
import type { OperationDef } from "./operation.js";
import { makePaginated } from "./pagination.js";
import { abortError, backoffMs, type ResolvedRetry, resolveRetry } from "./retry.js";
import type {
  AnyCallOptions,
  CallArgs,
  ContractMismatch,
  DebugEvent,
  Paginated,
  PaginatedCsv,
  ReportCall,
  ResponseMeta,
  RetryOptions,
  Versioned,
} from "./types.js";

/** Options of {@link AfsClient}. */
export interface AfsClientOptions {
  /** Base URL of afs-api without a trailing slash, for example `https://afs.example.internal`. */
  endpoint: string;
  auth?: AuthProvider;
  /** Injected for tests and non-browser runtimes. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  retry?: RetryOptions;
  /** Receives request, response and retry events; never a body, `Authorization` redacted. */
  onDebug?: (e: DebugEvent) => void;
  /** Called once per client when the server reports a newer contract version. */
  onContractMismatch?: (m: ContractMismatch) => void;
  /** Overrides `crypto.randomUUID()` for generated idempotency keys. */
  idempotencyKey?: () => string;
}

const ops = operations as Record<string, OperationDef>;

function semverGt(a: string, b: string): boolean {
  const pa = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

function isVersioned(v: unknown): v is Versioned {
  return typeof v === "object" && v !== null && "version" in v;
}

/** Picks the identifier of a {@link Versioned} for path parameter `param`. */
function idFrom(v: string | Versioned, param: string): string {
  if (typeof v === "string") return v;
  const cands = [param, "id", param.replace(/Id$/, ""), "name", "key"];
  for (const c of cands) {
    const x = (v as unknown as Record<string, unknown>)[c];
    if (typeof x === "string") return x;
  }
  throw new TypeError(`Cannot derive {${param}} from the versioned value`);
}

/** Parses a 2xx JSON body; a body that is not JSON (proxy page, truncation) becomes an AfsError, never the text. */
function parseJsonBody(text: string, meta: ResponseMeta): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AfsError({
      status: meta.status,
      code: "InternalError",
      message: "The response body was not valid JSON",
      requestId: meta.requestId,
    });
  }
}

const SAFE_TO_REPEAT = new Set(["GET", "PUT", "DELETE"]);

/** SDK-6: network errors and `idempotency_in_progress` repeat only GET, PUT, DELETE and POST with an `Idempotency-Key`. */
function isRetryable(method: OperationDef["method"], headers: Record<string, string>): boolean {
  return SAFE_TO_REPEAT.has(method) || (method === "POST" && "Idempotency-Key" in headers);
}

function define(target: object, meta: ResponseMeta): void {
  Object.defineProperty(target, "meta", { value: meta, enumerable: false, configurable: true });
}

interface Sent {
  res: Response;
  meta: ResponseMeta;
}

/** Low-level client: executes generated operations with auth, retry, idempotency and concurrency rules. */
export class AfsClient {
  readonly #endpoint: string;
  readonly #auth: AuthProvider | undefined;
  readonly #fetch: typeof fetch;
  readonly #retry: ResolvedRetry;
  readonly #onDebug: AfsClientOptions["onDebug"];
  readonly #onMismatch: AfsClientOptions["onContractMismatch"];
  readonly #keyGen: () => string;
  #mismatchReported = false;

  constructor(options: AfsClientOptions) {
    this.#endpoint = options.endpoint.replace(/\/+$/, "");
    this.#auth = options.auth;
    this.#fetch = options.fetch ?? ((...a) => globalThis.fetch(...a));
    this.#retry = resolveRetry(options.retry);
    this.#onDebug = options.onDebug;
    this.#onMismatch = options.onContractMismatch;
    this.#keyGen = options.idempotencyKey ?? (() => globalThis.crypto.randomUUID());
  }

  /** Executes an operation and returns its decoded body (with a non-enumerable `meta`). */
  async call<T>(
    operationId: OperationId,
    args: CallArgs = {},
    opts: AnyCallOptions = {},
  ): Promise<T> {
    const def = this.#def(operationId);
    const { sent, applied } = await this.#execute(operationId, def, args, opts, "application/json");
    const { res, meta } = sent;
    const m: ResponseMeta = applied === undefined ? meta : { ...meta, appliedToVersion: applied };
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get("Content-Type") ?? "";
    if (def.yaml || ct.includes("yaml")) return (await res.text()) as T;
    const text = await res.text();
    const body = text ? parseJsonBody(text, meta) : undefined;
    if (body && typeof body === "object") define(body, m);
    return body as T;
  }

  /** A lazy list call following `nextToken`. */
  paginate<T>(
    operationId: OperationId,
    args: CallArgs = {},
    opts: AnyCallOptions = {},
  ): PaginatedCsv<T> {
    const def = this.#def(operationId);
    if (!def.list) throw new TypeError(`${operationId} is not a list operation`);
    return makePaginated<T>(
      async (token) => {
        const o: AnyCallOptions = token === undefined ? opts : { ...opts, nextToken: token };
        const body = await this.call<{ items: T[]; nextToken?: string }>(operationId, args, o);
        const meta = (body as { meta?: ResponseMeta }).meta as ResponseMeta;
        const page = { items: body.items, meta } as {
          items: T[];
          nextToken?: string;
          meta: ResponseMeta;
        };
        if (body.nextToken) page.nextToken = body.nextToken;
        return page;
      },
      opts.nextToken as string | undefined,
      () => this.csv(operationId, args, opts),
    ) as PaginatedCsv<T>;
  }

  /** A lazy report call: await for JSON, `asCsv()` for CSV. */
  report<T>(
    operationId: OperationId,
    args: CallArgs = {},
    opts: AnyCallOptions = {},
  ): ReportCall<T> {
    let p: Promise<T> | undefined;
    const run = () => {
      p ??= this.call<T>(operationId, args, opts);
      return p;
    };
    return {
      // biome-ignore lint/suspicious/noThenProperty: a report call is intentionally a lazy thenable
      then: (a, b) => run().then(a, b),
      catch: (b) => run().catch(b),
      finally: (f) => run().finally(f),
      asCsv: () => this.csv(operationId, args, opts),
    };
  }

  /** The CSV body, following `X-Afs-Next-Token` and keeping one header row. */
  async csv(
    operationId: OperationId,
    args: CallArgs = {},
    opts: AnyCallOptions = {},
  ): Promise<string> {
    const def = this.#def(operationId);
    if (!def.csv) throw new TypeError(`${operationId} has no CSV form`);
    let token = opts.nextToken as string | undefined;
    let out = "";
    for (let first = true; ; first = false) {
      const o = token === undefined ? opts : { ...opts, nextToken: token };
      const { sent } = await this.#execute(operationId, def, args, o, "text/csv");
      const text = await sent.res.text();
      if (first) out = text;
      else {
        const nl = text.indexOf("\n");
        out += nl >= 0 ? text.slice(nl + 1) : "";
      }
      token = sent.res.headers.get("X-Afs-Next-Token") ?? undefined;
      if (!token) return out;
    }
  }

  #def(id: string): OperationDef {
    const d = ops[id];
    if (!d) throw new TypeError(`Unknown operation ${id}`);
    return d;
  }

  #url(def: OperationDef, path: string[], opts: AnyCallOptions): string {
    let i = 0;
    const p = def.path.replace(/\{[^}]+\}/g, () => encodeURIComponent(path[i++] ?? ""));
    const qs = new URLSearchParams();
    for (const name of def.query) {
      const v = opts[name];
      if (v === undefined || v === null) continue;
      qs.set(name, Array.isArray(v) ? v.join(",") : String(v));
    }
    const q = qs.toString();
    return `${this.#endpoint}${p}${q ? `?${q}` : ""}`;
  }

  async #resolveIfMatch(
    def: OperationDef,
    args: CallArgs,
    opts: AnyCallOptions,
  ): Promise<{ header?: string; applied?: number }> {
    if (def.ifMatch === "none" || opts.ifMatch === false) return {};
    if (typeof opts.ifMatch === "number")
      return { header: `"${opts.ifMatch}"`, applied: opts.ifMatch };
    const raw = args.path ?? [];
    const last = raw[raw.length - 1];
    if (isVersioned(last) && opts.ifMatch !== "read") {
      return { header: `"${last.version}"`, applied: last.version };
    }
    const ids = raw.map((v, i) => idFrom(v, def.pathParams[i] as string));
    if (!def.reader) {
      if (def.ifMatch === "required")
        throw new TypeError("This operation needs a versioned resource");
      return {};
    }
    const version = await this.#read(def, ids, opts.signal);
    if (version === undefined) {
      if (def.ifMatch === "required") {
        throw new AfsError({
          status: 404,
          code: "NotFound",
          message: "The resource was not found",
        });
      }
      return {};
    }
    return { header: `"${version}"`, applied: version };
  }

  async #read(def: OperationDef, ids: string[], signal?: AbortSignal): Promise<number | undefined> {
    const r = def.reader as NonNullable<OperationDef["reader"]>;
    const readerDef = this.#def(r.operationId);
    const callOpts: AnyCallOptions = signal ? { signal } : {};
    if (r.kind === "get") {
      try {
        const res = await this.call<{ version?: number }>(
          r.operationId as OperationId,
          { path: ids },
          callOpts,
        );
        return def.versionless ? 1 : res.version;
      } catch (e) {
        if (e instanceof AfsError && e.isNotFound && def.ifMatch === "optional") return undefined;
        throw e;
      }
    }
    const parentIds = ids.slice(0, readerDef.pathParams.length);
    const rest = ids.slice(readerDef.pathParams.length);
    const wanted: [string, string][] = [];
    let k = 0;
    for (const [param, prop] of r.match) {
      const n = param.includes("/") ? 2 : 1;
      wanted.push([prop, rest.slice(k, k + n).join("/")]);
      k += n;
    }
    for await (const item of this.paginate<Record<string, unknown>>(
      r.operationId as OperationId,
      { path: parentIds },
      callOpts,
    )) {
      if (wanted.every(([prop, v]) => String(item[prop]) === v)) {
        return def.versionless ? 1 : (item.version as number | undefined);
      }
    }
    return undefined;
  }

  async #execute(
    operationId: string,
    def: OperationDef,
    args: CallArgs,
    opts: AnyCallOptions,
    accept: string,
  ): Promise<{ sent: Sent; applied?: number | undefined }> {
    if (opts.requestId !== undefined && opts.requestId.length > 64) {
      throw new TypeError("requestId must be at most 64 characters");
    }
    const raw = args.path ?? [];
    const path = raw.map((v, i) => idFrom(v, def.pathParams[i] as string));
    const cond = await this.#resolveIfMatch(def, args, opts);
    const headers: Record<string, string> = { Accept: accept };
    if (opts.requestId) headers["X-Request-Id"] = opts.requestId;
    if (cond.header) headers["If-Match"] = cond.header;
    if (def.idempotent) headers["Idempotency-Key"] = opts.idempotencyKey ?? this.#keyGen();
    let body: string | undefined;
    if (def.body && args.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(args.body);
    }
    const url = this.#url(def, path, opts);
    const scrub = def.secretFields
      .map((f) => (args.body as Record<string, unknown> | undefined)?.[f])
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    const sent = await this.#attempts(operationId, def, url, headers, body, opts.signal, scrub);
    return { sent, applied: cond.applied };
  }

  #emit(kind: DebugEvent["kind"], base: Omit<DebugEvent, "kind">): void {
    this.#onDebug?.({ kind, ...base });
  }

  async #attempts(
    operationId: string,
    def: OperationDef,
    url: string,
    headers: Record<string, string>,
    body: string | undefined,
    signal: AbortSignal | undefined,
    scrub: string[],
  ): Promise<Sent> {
    const r = this.#retry;
    let retries = 0;
    let refreshed = false;
    let forceRefresh = false;
    let attempt = 0;
    const secrets: string[] = [...scrub];
    const retryable = isRetryable(def.method, headers);
    for (;;) {
      attempt++;
      if (signal?.aborted) throw abortError();
      const h: Record<string, string> = { ...headers };
      let tokenForScrub = "";
      if (this.#auth) {
        h.Authorization = await this.#auth.authorization({ forceRefresh });
        tokenForScrub = h.Authorization.replace(/^Bearer /, "");
        if (!secrets.includes(tokenForScrub)) secrets.push(tokenForScrub);
      }
      forceRefresh = false;
      const dbg = { operationId, method: def.method, url, attempt };
      this.#emit("request", {
        ...dbg,
        headers: { ...h, ...(h.Authorization ? { Authorization: "[redacted]" } : {}) },
      });
      let res: Response;
      try {
        res = await this.#fetch(url, {
          method: def.method,
          headers: h,
          ...(body !== undefined && { body }),
          ...(signal && { signal }),
        });
      } catch (e) {
        if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) throw e;
        if (!retryable || retries >= r.maxRetries) {
          throw new AfsNetworkError(
            e instanceof Error ? e.message.slice(0, 200) : "Network error",
            headers["X-Request-Id"],
          );
        }
        const delay = backoffMs(r, retries++);
        this.#emit("retry", { ...dbg, headers: {}, delayMs: delay });
        await r.sleep(delay, signal);
        continue;
      }
      const requestId = res.headers.get("X-Request-Id") ?? undefined;
      this.#emit("response", {
        ...dbg,
        headers: {},
        status: res.status,
        ...(requestId && { requestId }),
      });
      const contractVersion = res.headers.get("X-Afs-Contract-Version") ?? undefined;
      this.#checkContract(contractVersion);
      if (res.ok) {
        const meta: ResponseMeta = {
          status: res.status,
          idempotentReplayed: res.headers.get("Idempotent-Replayed") === "true",
          ...(requestId && { requestId }),
          ...(res.headers.get("ETag") && { etag: res.headers.get("ETag") as string }),
          ...(contractVersion && { contractVersion }),
        };
        return { res, meta };
      }
      const text = await res.text();
      const err = errorFromBody(res.status, text, res.headers, secrets);
      if (res.status === 401 && this.#auth?.kind === "bearer" && !refreshed) {
        refreshed = true;
        forceRefresh = true;
        continue;
      }
      const inProgress = res.status === 409 && err.details.reason === "idempotency_in_progress";
      const transient = res.status === 429 || res.status === 503 || (inProgress && retryable);
      if (!transient || retries >= r.maxRetries) throw err;
      let delay: number;
      if (err.retryAfterSeconds !== undefined || inProgress) {
        const secs = err.retryAfterSeconds ?? 1;
        if (secs > r.maxRetryAfterSeconds) throw err;
        delay = secs * 1000;
      } else {
        delay = backoffMs(r, retries);
      }
      retries++;
      this.#emit("retry", {
        ...dbg,
        headers: {},
        status: res.status,
        delayMs: delay,
        ...(requestId && { requestId }),
      });
      await r.sleep(delay, signal);
    }
  }

  #checkContract(server: string | undefined): void {
    if (!server || this.#mismatchReported || !this.#onMismatch) return;
    if (semverGt(server, CONTRACT_VERSION)) {
      this.#mismatchReported = true;
      this.#onMismatch({ server, client: CONTRACT_VERSION });
    }
  }
}

export type { Paginated };
