import { AfsError } from "@afs/sdk";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../application/errors.js";
import type { TelemetryEvent } from "../../application/ports/telemetry.js";
import { BeaconTelemetry } from "./BeaconTelemetry.js";
import { startTelemetry } from "./collect.js";
import { errorEvent, errorName, routeTemplate, webVitalEvent } from "./payload.js";

const ctx = { pathname: "/t/team_01ABC/agents", build: "0.2.0", now: () => 1000 };

describe("telemetry payloads (M1-Y1)", () => {
  it("uses the route template, never ids or the query", () => {
    expect(routeTemplate("/t/team_01ABC/agents")).toBe("/t/:teamId/agents");
    expect(routeTemplate("/teams/team_9/admin")).toBe("/teams/:teamId/admin");
    expect(routeTemplate("/who/knows/usr_secret")).toBe("/:unknown");
  });

  it("a web vital carries only name, value, route, build and time", () => {
    expect(webVitalEvent({ name: "LCP", value: 1234 }, ctx)).toEqual({
      kind: "web-vital",
      name: "LCP",
      value: 1234,
      route: "/t/:teamId/agents",
      build: "0.2.0",
      ts: 1000,
    });
  });

  it("an error event holds no message, stack, email, token or form value", () => {
    const e = new AfsError({
      status: 500,
      code: "InternalError",
      message: "failed for alice@example.com token=SENTINEL-TOKEN field=SENTINEL-FORM",
      requestId: "req_abc123",
      details: { value: "SENTINEL-SECRET" },
    });
    const json = JSON.stringify(errorEvent(e, ctx));
    for (const s of ["alice@example.com", "SENTINEL"]) expect(json).not.toContain(s);
    expect(JSON.parse(json)).toEqual({
      kind: "error",
      name: "AfsError",
      route: "/t/:teamId/agents",
      build: "0.2.0",
      requestIds: ["req_abc123"],
      ts: 1000,
    });
  });

  it("takes request ids from AppError and ignores odd ones", () => {
    expect(
      errorEvent(new AppError({ kind: "unknown", message: "m", requestId: "req_1" }), ctx)
        .requestIds,
    ).toEqual(["req_1"]);
    expect(
      errorEvent(new AppError({ kind: "unknown", message: "m", requestId: "a b@c.d" }), ctx)
        .requestIds,
    ).toBeUndefined();
  });

  it("an odd error name becomes Error", () => {
    const e = new Error("x");
    e.name = "bob@example.com";
    expect(errorName(e)).toBe("Error");
    expect(errorName("a string")).toBe("Error");
    expect(errorName(new TypeError("x"))).toBe("TypeError");
  });

  it("a non-finite vital is reported as 0", () => {
    expect(webVitalEvent({ name: "CLS", value: Number.NaN }, ctx).value).toBe(0);
  });
});

describe("BeaconTelemetry", () => {
  const ev: TelemetryEvent = { kind: "error", name: "Error", route: "/", build: "b", ts: 1 };
  it("sends JSON with sendBeacon when a URL is configured", async () => {
    const beacon = vi.fn(() => true);
    new BeaconTelemetry("https://t.example/rum", beacon).send(ev);
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe("https://t.example/rum");
    expect(JSON.parse(await blob.text())).toEqual(ev);
  });
  it("does nothing without a URL and swallows beacon failures", () => {
    const beacon = vi.fn(() => true);
    new BeaconTelemetry(undefined, beacon).send(ev);
    expect(beacon).not.toHaveBeenCalled();
    expect(() =>
      new BeaconTelemetry("https://t", () => {
        throw new Error("blocked");
      }).send(ev),
    ).not.toThrow();
  });
});

describe("startTelemetry", () => {
  it("reports vitals and uncaught errors and stops on request", () => {
    const sent: TelemetryEvent[] = [];
    const listeners = new Map<string, (e: Event) => void>();
    const target = {
      addEventListener: (t: string, f: (e: Event) => void) => listeners.set(t, f),
      removeEventListener: (t: string) => listeners.delete(t),
    } as unknown as Window;
    let report: (m: { name: string; value: number }) => void = () => {};
    const stop = startTelemetry({
      port: { send: (e) => sent.push(e) },
      build: "b",
      target,
      pathname: () => "/t/team_1",
      now: () => 5,
      vitals: (r) => {
        report = r;
      },
    });
    report({ name: "INP", value: 80 });
    listeners.get("error")?.({ error: new TypeError("secret text") } as unknown as Event);
    listeners.get("unhandledrejection")?.({ reason: new Error("x") } as unknown as Event);
    expect(sent.map((e) => `${e.kind}:${e.name}`)).toEqual([
      "web-vital:INP",
      "error:TypeError",
      "error:Error",
    ]);
    expect(JSON.stringify(sent)).not.toContain("secret text");
    stop();
    expect(listeners.size).toBe(0);
  });
});
