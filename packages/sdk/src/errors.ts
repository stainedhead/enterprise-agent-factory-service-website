/** Error codes returned by the Agent Factory API (solution design section 10). */
export type AfsErrorCode =
  | "ValidationError"
  | "NotFound"
  | "Conflict"
  | "PreconditionFailed"
  | "AccessDenied"
  | "Unauthenticated"
  | "BudgetExceeded"
  | "Throttled"
  | "InternalError";

/** Thrown for any non-2xx API response. */
export class AfsError extends Error {
  override readonly name = "AfsError";

  constructor(
    readonly status: number,
    readonly code: AfsErrorCode | string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
  }

  /** True when the API denied the call for lack of permission. */
  get isAccessDenied(): boolean {
    return this.code === "AccessDenied";
  }
}
