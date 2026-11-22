import { type AfsClient, swarmTemplates } from "@afs/sdk";
import type {
  SwarmTemplateRecord,
  SwarmTemplatesPort,
} from "../../application/ports/swarmTemplates.js";
import { toAppError } from "./errors.js";

type Wire = Awaited<ReturnType<ReturnType<typeof swarmTemplates>["get"]>>;

export const templateRecord = (t: Wire): SwarmTemplateRecord => ({
  id: t.id,
  name: t.name,
  kind: t.kind,
  description: t.description,
  budgetUsd: t.budgetUsd,
  ttlHours: t.ttlHours,
  teardownRule: t.teardownRule,
  enabled: t.enabled,
  spec: t.spec,
  version: t.version,
  updatedAt: t.updatedAt,
});

/** `swarmTemplates.*` mapped to {@link SwarmTemplatesPort}. */
export class SdkSwarmTemplates implements SwarmTemplatesPort {
  constructor(private readonly client: AfsClient) {}

  async list(signal?: AbortSignal) {
    try {
      const out: SwarmTemplateRecord[] = [];
      for await (const t of swarmTemplates(this.client).list({
        maxResults: 100,
        ...(signal ? { signal } : {}),
      }))
        out.push(templateRecord(t));
      return out;
    } catch (e) {
      throw toAppError(e);
    }
  }
}
