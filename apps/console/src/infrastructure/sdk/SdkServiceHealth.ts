import type { AfsClient } from "@afs/sdk";
import type { ServiceHealthPort } from "../../application/ports/ServiceHealthPort.js";

/** Adapter: implements ServiceHealthPort with @afs/sdk. */
export class SdkServiceHealth implements ServiceHealthPort {
  constructor(private readonly client: AfsClient) {}

  async check(signal?: AbortSignal): Promise<{ healthy: boolean }> {
    const res = await this.client.health(signal);
    return { healthy: res.status === "ok" };
  }
}
