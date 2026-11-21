import { type AfsClient, health } from "@afs/sdk";
import type { ServiceHealthPort } from "../../application/ports/ServiceHealthPort.js";

/** Adapter: implements ServiceHealthPort with @afs/sdk. */
export class SdkServiceHealth implements ServiceHealthPort {
  readonly #health: ReturnType<typeof health>;
  constructor(client: AfsClient) {
    this.#health = health(client);
  }

  async check(signal?: AbortSignal): Promise<{ healthy: boolean }> {
    const res = await this.#health.get(signal ? { signal } : undefined);
    return { healthy: res.status === "ok" };
  }
}
