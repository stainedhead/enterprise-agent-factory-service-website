import { AfsError } from "@afs/sdk";
import { isAppError } from "../../application/errors.js";
import type { TelemetryEvent } from "../../application/ports/telemetry.js";
import { resolveRoute } from "../../domain/routes.js";

/** The route template of a location: ids and the query string never leave the browser. */
export function routeTemplate(pathname: string): string {
  const hit = resolveRoute(pathname);
  if (hit) return hit.route.path;
  // an unmatched path is reported as one bucket, never its text (it may hold an id)
  return "/:unknown";
}

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_.$]{0,63}$/;

/** The class name of an error; anything unusual becomes `Error` so free text cannot leak through it. */
export function errorName(e: unknown): string {
  const n = e instanceof Error ? e.name : "Error";
  return SAFE_NAME.test(n) ? n : "Error";
}

const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Request ids carried by an API error, when they look like request ids. */
export function requestIdsOf(e: unknown): string[] {
  const id = isAppError(e) || e instanceof AfsError ? e.requestId : undefined;
  return id && REQUEST_ID.test(id) ? [id] : [];
}

export interface EventContext {
  readonly pathname: string;
  readonly build: string;
  readonly now: () => number;
}

export function webVitalEvent(
  metric: { name: string; value: number },
  ctx: EventContext,
): TelemetryEvent {
  return {
    kind: "web-vital",
    name: metric.name,
    value: Number.isFinite(metric.value) ? metric.value : 0,
    route: routeTemplate(ctx.pathname),
    build: ctx.build,
    ts: ctx.now(),
  };
}

export function errorEvent(e: unknown, ctx: EventContext): TelemetryEvent {
  const ids = requestIdsOf(e);
  return {
    kind: "error",
    // the message, stack and any form value stay local
    name: errorName(e),
    route: routeTemplate(ctx.pathname),
    build: ctx.build,
    ...(ids.length > 0 && { requestIds: ids }),
    ts: ctx.now(),
  };
}
