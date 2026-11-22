import type { TelemetryEvent, TelemetryPort } from "../../application/ports/telemetry.js";

type Beacon = (url: string, data: Blob) => boolean;

/** Sends events with `navigator.sendBeacon` to `telemetryUrl`; with no URL configured it does nothing. */
export class BeaconTelemetry implements TelemetryPort {
  constructor(
    private readonly url: string | undefined,
    private readonly beacon: Beacon | undefined = typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
      ? (u, d) => navigator.sendBeacon(u, d)
      : undefined,
  ) {}

  send(event: TelemetryEvent): void {
    if (!this.url || !this.beacon) return;
    try {
      this.beacon(this.url, new Blob([JSON.stringify(event)], { type: "application/json" }));
    } catch {
      // telemetry must never affect the page
    }
  }
}
