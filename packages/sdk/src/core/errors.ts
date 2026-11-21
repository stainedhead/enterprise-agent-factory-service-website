/** Error codes of the contract; open so a newer server's code is kept, not rejected. */
export type AfsErrorCode =
  | "ValidationError"
  | "Unauthenticated"
  | "AccessDenied"
  | "NotFound"
  | "Conflict"
  | "PreconditionFailed"
  | "PreconditionRequired"
  | "Throttled"
  | "InternalError"
  | "Unavailable"
  | (string & {});

export interface AfsErrorInit {
  status: number;
  code: AfsErrorCode;
  message: string;
  requestId?: string | undefined;
  details?: Record<string, unknown> | undefined;
  retryAfterSeconds?: number | undefined;
}

/** An error returned by afs-api (or synthesized for a non-API failure). Branch on `code`, not `message`. */
export class AfsError extends Error {
  readonly status: number;
  readonly code: AfsErrorCode;
  readonly requestId: string | undefined;
  readonly details: Record<string, unknown>;
  readonly retryAfterSeconds: number | undefined;

  constructor(init: AfsErrorInit) {
    super(init.message);
    this.name = "AfsError";
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.details = init.details ?? {};
    this.retryAfterSeconds = init.retryAfterSeconds;
  }

  get isValidationError(): boolean {
    return this.code === "ValidationError";
  }
  get isUnauthenticated(): boolean {
    return this.code === "Unauthenticated";
  }
  get isAccessDenied(): boolean {
    return this.code === "AccessDenied";
  }
  get isNotFound(): boolean {
    return this.code === "NotFound";
  }
  get isConflict(): boolean {
    return this.code === "Conflict";
  }
  get isPreconditionFailed(): boolean {
    return this.code === "PreconditionFailed";
  }
  get isPreconditionRequired(): boolean {
    return this.code === "PreconditionRequired";
  }
  get isThrottled(): boolean {
    return this.code === "Throttled";
  }
  get isUnavailable(): boolean {
    return this.code === "Unavailable";
  }
  get isInternalError(): boolean {
    return this.code === "InternalError";
  }

  /** A JSON-safe form: never includes a stack, a token or a request body. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      status: this.status,
      code: this.code,
      message: this.message,
      requestId: this.requestId,
      details: this.details,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }
}

/** A network failure after retries: `status` 0, `code` "NetworkError". */
export class AfsNetworkError extends AfsError {
  constructor(message: string, requestId?: string) {
    super({ status: 0, code: "NetworkError", message, requestId });
    this.name = "AfsNetworkError";
  }
}

const STATUS_CODES: Record<number, AfsErrorCode> = {
  400: "ValidationError",
  401: "Unauthenticated",
  403: "AccessDenied",
  404: "NotFound",
  412: "PreconditionFailed",
  428: "PreconditionRequired",
  429: "Throttled",
  503: "Unavailable",
};

/** Builds an AfsError from a failed response body (JSON error object, or any other text). */
export function errorFromBody(
  status: number,
  text: string,
  headers: { get(name: string): string | null },
  scrub: readonly string[] = [],
): AfsError {
  const headerId = headers.get("X-Request-Id") ?? undefined;
  const ra = Number(headers.get("Retry-After"));
  const retryAfterSeconds = Number.isFinite(ra) && ra > 0 ? ra : undefined;
  const clean = (s: string) =>
    scrub.reduce((acc, v) => (v ? acc.split(v).join("[redacted]") : acc), s);
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (j && typeof j === "object" && typeof j.code === "string") {
      const rawDetails = (j.details && typeof j.details === "object" ? j.details : {}) as Record<
        string,
        unknown
      >;
      const details =
        scrub.length > 0
          ? (JSON.parse(clean(JSON.stringify(rawDetails))) as Record<string, unknown>)
          : rawDetails;
      return new AfsError({
        status,
        code: j.code,
        message: clean(typeof j.message === "string" ? j.message.slice(0, 500) : j.code),
        requestId: typeof j.requestId === "string" ? j.requestId : headerId,
        details,
        retryAfterSeconds,
      });
    }
  } catch {
    // not JSON: fall through
  }
  const snippet = clean(
    text
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).slice(0, 200);
  return new AfsError({
    status,
    code: STATUS_CODES[status] ?? "InternalError",
    message: snippet || `HTTP ${status}`,
    requestId: headerId,
    retryAfterSeconds,
  });
}
