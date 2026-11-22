import { type AfsClient, money, swarmTemplates } from "@afs/sdk";
import type {
  SwarmTemplateInput,
  SwarmTemplatePatch,
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

const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};
const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const idOf = (ref: { id: string; version?: number | undefined }) =>
  ref.version === undefined ? ref.id : { id: ref.id, version: ref.version };

/** `swarmTemplates.*` mapped to {@link SwarmTemplatesPort}. */
export class SdkSwarmTemplates implements SwarmTemplatesPort {
  constructor(private readonly client: AfsClient) {}

  list(signal?: AbortSignal) {
    return wrap(async () => {
      const out: SwarmTemplateRecord[] = [];
      for await (const t of swarmTemplates(this.client).list({ maxResults: 100, ...sig(signal) }))
        out.push(templateRecord(t));
      return out;
    });
  }
  get(id: string, signal?: AbortSignal) {
    return wrap(async () => templateRecord(await swarmTemplates(this.client).get(id, sig(signal))));
  }
  create(input: SwarmTemplateInput) {
    return wrap(async () =>
      templateRecord(
        await swarmTemplates(this.client).create({
          name: input.name,
          kind: input.kind,
          ...(input.description && { description: input.description }),
          budgetUsd: money(input.budgetUsd),
          ttlHours: input.ttlHours,
          teardownRule: input.teardownRule,
          enabled: input.enabled,
          spec: input.spec as never,
        }),
      ),
    );
  }
  update(ref: { id: string; version?: number | undefined }, patch: SwarmTemplatePatch) {
    return wrap(async () =>
      templateRecord(
        await swarmTemplates(this.client).update(idOf(ref), {
          ...(patch.description !== undefined && { description: patch.description }),
          ...(patch.budgetUsd !== undefined && { budgetUsd: money(patch.budgetUsd) }),
          ...(patch.ttlHours !== undefined && { ttlHours: patch.ttlHours }),
          ...(patch.teardownRule !== undefined && { teardownRule: patch.teardownRule }),
          ...(patch.spec !== undefined && { spec: patch.spec as never }),
        }),
      ),
    );
  }
  delete(ref: { id: string; version?: number | undefined }) {
    return wrap(() => swarmTemplates(this.client).delete(idOf(ref)));
  }
  enable(id: string) {
    return wrap(async () => templateRecord(await swarmTemplates(this.client).enable(id)));
  }
  disable(id: string) {
    return wrap(async () => templateRecord(await swarmTemplates(this.client).disable(id)));
  }
}
