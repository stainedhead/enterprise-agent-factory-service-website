import type { ServiceHealthPort } from "../ports/ServiceHealthPort.js";

export type ServiceHealth = { state: "up" } | { state: "down"; reason: string };

/** Use case: check the API so the shell can show a connection banner. */
export class CheckServiceHealth {
  constructor(private readonly health: ServiceHealthPort) {}

  async execute(signal?: AbortSignal): Promise<ServiceHealth> {
    try {
      const { healthy } = await this.health.check(signal);
      return healthy ? { state: "up" } : { state: "down", reason: "API reported unhealthy" };
    } catch (err) {
      return { state: "down", reason: err instanceof Error ? err.message : "unreachable" };
    }
  }
}
