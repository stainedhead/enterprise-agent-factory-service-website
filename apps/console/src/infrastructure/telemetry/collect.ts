import { onCLS, onINP, onLCP } from "web-vitals";
import type { TelemetryPort } from "../../application/ports/telemetry.js";
import { type EventContext, errorEvent, webVitalEvent } from "./payload.js";

export interface CollectOptions {
  readonly port: TelemetryPort;
  readonly build: string;
  readonly target?: Pick<Window, "addEventListener" | "removeEventListener">;
  readonly pathname?: () => string;
  readonly now?: () => number;
  /** Injected for tests; defaults to web-vitals. */
  readonly vitals?: (report: (m: { name: string; value: number }) => void) => void;
}

const defaultVitals = (report: (m: { name: string; value: number }) => void) => {
  onLCP(report);
  onINP(report);
  onCLS(report);
};

/**
 * Starts Web Vitals (LCP, INP, CLS) and uncaught-error reporting (M1-Y1). Returns a stop function.
 * Events carry the route template, build and request ids only.
 */
export function startTelemetry(o: CollectOptions): () => void {
  const target = o.target ?? window;
  const ctx = (): EventContext => ({
    pathname: o.pathname ? o.pathname() : window.location.pathname,
    build: o.build,
    now: o.now ?? Date.now,
  });
  (o.vitals ?? defaultVitals)((m) => o.port.send(webVitalEvent(m, ctx())));
  const onError = (ev: Event) => o.port.send(errorEvent((ev as ErrorEvent).error ?? ev, ctx()));
  const onRejection = (ev: Event) =>
    o.port.send(errorEvent((ev as PromiseRejectionEvent).reason, ctx()));
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
