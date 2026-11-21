/** Metadata of a response, attached as a non-enumerable `meta` property. */
export interface ResponseMeta {
  readonly status: number;
  readonly requestId?: string;
  readonly etag?: string;
  readonly contractVersion?: string;
  readonly idempotentReplayed: boolean;
  /** The version an id-only write was applied against (read first). */
  readonly appliedToVersion?: number;
}

/** Per-call options. Query parameters of the operation are added to this by the generated methods. */
export type CallOptions = {
  signal?: AbortSignal;
  /** Sent as `X-Request-Id`; at most 64 characters. */
  requestId?: string;
  idempotencyKey?: string;
  /** `false` sends no `If-Match`; a number sends that version; `"read"` reads the current version first. */
  ifMatch?: number | "read" | false;
};

/** A resource (or `{ id, version }`) whose version becomes `If-Match: "<version>"`. */
export interface Versioned {
  readonly version: number;
  readonly id?: string;
  readonly name?: string;
  readonly key?: string;
}

/** One page of a list operation. */
export interface Page<T> {
  readonly items: T[];
  readonly nextToken?: string;
  readonly meta: ResponseMeta;
}

/** A lazy list call: iterate items across pages, or take pages one at a time. */
export interface Paginated<T> extends AsyncIterable<T> {
  /** Iterates page by page (one request per page). */
  pages(): AsyncIterable<Page<T>>;
  /** Fetches only the first page. */
  first(): Promise<Page<T>>;
}

/** A {@link Paginated} list that can also be fetched as CSV. */
export interface PaginatedCsv<T> extends Paginated<T> {
  asCsv(): Promise<string>;
}

/** A lazy report call: await it for JSON, or call `asCsv()` for the CSV body (follows `X-Afs-Next-Token`). */
export interface ReportCall<T> extends PromiseLike<T> {
  catch<R = never>(onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<T | R>;
  finally(onfinally?: (() => void) | null): Promise<T>;
  asCsv(): Promise<string>;
}

/** Retry tuning (WEB-US-3). `random` and `sleep` are injectable for tests. */
export interface RetryOptions {
  maxRetries?: number;
  baseMs?: number;
  capMs?: number;
  maxRetryAfterSeconds?: number;
  random?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** An event for the debug hook. Never carries a body; `Authorization` is redacted. */
export interface DebugEvent {
  readonly kind: "request" | "response" | "retry";
  readonly operationId: string;
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly status?: number;
  readonly attempt: number;
  readonly delayMs?: number;
  readonly requestId?: string;
}

export interface ContractMismatch {
  readonly server: string;
  readonly client: string;
}

/** The shape of any call's second argument: call options plus the operation's query parameters. */
export type AnyCallOptions = CallOptions & Record<string, unknown>;

/** Arguments of a call: positional path values (the last may be {@link Versioned}) and the body. */
export interface CallArgs {
  path?: readonly (string | Versioned)[];
  body?: unknown;
}

/** Brand for USD amounts (decimal strings, never numbers). */
export type { Money } from "../generated/schemas.js";

/** The metadata of a response, or undefined for values that carry none (void, strings). */
export function metaOf(value: unknown): ResponseMeta | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as { meta?: ResponseMeta }).meta;
}
