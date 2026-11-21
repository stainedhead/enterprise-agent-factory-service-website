import { AfsError } from "@afs/sdk";
import { AppError, type AppErrorKind } from "../../application/errors.js";
import { AuthError } from "../../application/ports/auth.js";

const KINDS: Record<string, AppErrorKind> = {
  Unauthenticated: "unauthenticated",
  AccessDenied: "access-denied",
  NotFound: "not-found",
  ValidationError: "validation",
  Conflict: "conflict",
  PreconditionFailed: "stale",
  PreconditionRequired: "stale",
  Throttled: "throttled",
  Unavailable: "unavailable",
  NetworkError: "network",
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

function fieldsOf(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, string> = {};
  if (Array.isArray(v)) {
    for (const f of v) {
      const o = f as { field?: unknown; message?: unknown };
      if (str(o?.field) && str(o?.message)) out[o.field as string] = o.message as string;
    }
  } else {
    for (const [k, m] of Object.entries(v)) if (typeof m === "string") out[k] = m;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Maps an SDK error to an {@link AppError}, keeping the request id, required permission, reason and field errors. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof AfsError) {
    const kind = KINDS[e.code] ?? "unknown";
    return new AppError({
      kind,
      message: e.message,
      requestId: e.requestId,
      requiredPermission: str(e.details.requiredPermission),
      reason: str(e.details.reason),
      fields: fieldsOf(e.details.fields),
      retryAfterSeconds: e.retryAfterSeconds,
    });
  }
  // the session could not supply a token: the same as the API saying 401 after a refresh
  if (e instanceof AuthError) return new AppError({ kind: "unauthenticated", message: e.message });
  return new AppError({
    kind: "unknown",
    message: e instanceof Error ? e.message : "Unexpected error",
  });
}
