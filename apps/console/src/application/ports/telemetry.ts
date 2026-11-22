/** One telemetry event (data-dictionary §6): no identity, no form content, no secrets (NFR-5, WD-15). */
export interface TelemetryEvent {
  readonly kind: "web-vital" | "error";
  /** `LCP`, `INP`, `CLS`, or an error's class name. */
  readonly name: string;
  readonly value?: number;
  /** The route template, for example `/t/:teamId/agents`: never an id, never a query. */
  readonly route: string;
  readonly build: string;
  /** Request ids of failed API calls, so an operator can find them in the service logs. */
  readonly requestIds?: readonly string[];
  readonly ts: number;
}

/** Fire-and-forget delivery; never throws and never blocks the UI. */
export interface TelemetryPort {
  send(event: TelemetryEvent): void;
}
