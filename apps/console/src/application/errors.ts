export type AppErrorKind =
  | "unauthenticated"
  | "access-denied"
  | "not-found"
  | "validation"
  | "conflict"
  | "stale"
  | "throttled"
  | "unavailable"
  | "network"
  | "unknown";

export interface AppErrorInit {
  readonly kind: AppErrorKind;
  readonly message: string;
  readonly requestId?: string | undefined;
  /** `details.requiredPermission` of an `AccessDenied` (WEB-US-8.9). */
  readonly requiredPermission?: string | undefined;
  /** `details.reason`, for example a policy reason. */
  readonly reason?: string | undefined;
  /** `details.fields`: field name to message, for form validation. */
  readonly fields?: Readonly<Record<string, string>> | undefined;
  readonly retryAfterSeconds?: number | undefined;
}

/** The error the UI deals in; the SDK's `AfsError` is mapped to it at the infrastructure edge. */
export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly requestId: string | undefined;
  readonly requiredPermission: string | undefined;
  readonly reason: string | undefined;
  readonly fields: Readonly<Record<string, string>>;
  readonly retryAfterSeconds: number | undefined;

  constructor(init: AppErrorInit) {
    super(init.message);
    this.name = "AppError";
    this.kind = init.kind;
    this.requestId = init.requestId;
    this.requiredPermission = init.requiredPermission;
    this.reason = init.reason;
    this.fields = init.fields ?? {};
    this.retryAfterSeconds = init.retryAfterSeconds;
  }

  get isAccessDenied(): boolean {
    return this.kind === "access-denied";
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
