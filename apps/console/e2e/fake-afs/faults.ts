// Request fault hook for the fake AFS API (FR-002, FR-003): fail the next N calls of one operation with a
// chosen status, for the statuses `Injection` cannot produce (401 and 403) and for operation-level control.
// Owned by stream C of specs/261122-website-feature-complete-auto-review.

export type FaultStatus = 401 | 403 | 429 | 500 | 503;

export interface Fault {
  /** The OpenAPI `operationId`, for example `CreateSecret`. */
  readonly operationId: string;
  readonly status: FaultStatus;
  /** How many calls fail; later calls pass through. */
  readonly times: number;
  /** For a 403: `details.requiredPermission`. */
  readonly requiredPermission?: string;
}

export interface FaultResponse {
  readonly status: FaultStatus;
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

const CODES: Record<FaultStatus, string> = {
  401: "Unauthenticated",
  403: "AccessDenied",
  429: "Throttled",
  500: "InternalError",
  503: "Unavailable",
};

/** A payload on the `/__inject` control channel is a fault when it names an operation. */
export const isFault = (x: object): x is Fault => "operationId" in x;

export class Faults {
  #pending: { fault: Fault; left: number }[] = [];

  /** Fails the next `count` calls of `operationId` with `status`. */
  failNext(
    operationId: string,
    status: FaultStatus,
    count = 1,
    opts: { requiredPermission?: string } = {},
  ): void {
    this.add({ operationId, status, times: count, ...opts });
  }

  add(f: Fault): void {
    this.#pending.push({ fault: f, left: f.times });
  }

  /** The response for this call when a fault is armed for it, consuming one use. */
  take(operationId: string | undefined): FaultResponse | undefined {
    const hit = this.#pending.find((p) => p.left > 0 && p.fault.operationId === operationId);
    if (!hit) return undefined;
    hit.left--;
    const { status, requiredPermission } = hit.fault;
    return {
      status,
      code: CODES[status],
      message: "Injected fault",
      ...(requiredPermission !== undefined && { details: { requiredPermission } }),
    };
  }

  clear(): void {
    this.#pending = [];
  }
}
