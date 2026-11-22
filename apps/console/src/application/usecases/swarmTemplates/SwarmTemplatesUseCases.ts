import type { SwarmTemplateRecord, SwarmTemplatesPort } from "../../ports/swarmTemplates.js";

/** Use cases over swarm templates (M6-W reads; M6-T adds the management actions). */
export class SwarmTemplatesUseCases {
  constructor(private readonly port: SwarmTemplatesPort) {}

  list(signal?: AbortSignal): Promise<readonly SwarmTemplateRecord[]> {
    return this.port.list(signal);
  }
  /** Templates offered in *Create work order*: enabled only. */
  async enabled(signal?: AbortSignal): Promise<readonly SwarmTemplateRecord[]> {
    return (await this.port.list(signal)).filter((t) => t.enabled);
  }
}
