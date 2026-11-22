import { type AfsClient, adminAgentTemplates, adminStorageClasses } from "@afs/sdk";
import type {
  AdminAgentTemplatesPort,
  AdminStorageClassesPort,
  AgentTemplateInput,
  CatalogRef,
  StorageClassInput,
} from "../../application/ports/adminCatalogs.js";
import type { AgentTemplateRecord, StorageClassRecord } from "../../application/ports/agents.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};
async function all<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}
const target = (r: CatalogRef) =>
  r.version === undefined ? r.name : { name: r.name, version: r.version };
const compact = (o: object): never =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as never;

/** `admin.storageClasses.*` mapped to {@link AdminStorageClassesPort}. */
export class SdkAdminStorageClasses implements AdminStorageClassesPort {
  constructor(private readonly client: AfsClient) {}
  list(signal?: AbortSignal) {
    return wrap<readonly StorageClassRecord[]>(() =>
      all(adminStorageClasses(this.client).list({ maxResults: 100, ...sig(signal) })),
    );
  }
  put(ref: CatalogRef, input: StorageClassInput) {
    return wrap<StorageClassRecord>(() =>
      adminStorageClasses(this.client).put(target(ref), compact(input)),
    );
  }
  delete(ref: CatalogRef) {
    return wrap(() => adminStorageClasses(this.client).delete(target(ref)));
  }
}

/** `admin.agentTemplates.*` mapped to {@link AdminAgentTemplatesPort}. */
export class SdkAdminAgentTemplates implements AdminAgentTemplatesPort {
  constructor(private readonly client: AfsClient) {}
  list(signal?: AbortSignal) {
    return wrap<readonly AgentTemplateRecord[]>(() =>
      all(adminAgentTemplates(this.client).list({ maxResults: 100, ...sig(signal) })),
    );
  }
  put(ref: CatalogRef, input: AgentTemplateInput) {
    return wrap<AgentTemplateRecord>(() =>
      adminAgentTemplates(this.client).put(
        target(ref),
        compact({
          ...input,
          allowedDigests: [...input.allowedDigests],
          ...(input.capabilities && { capabilities: [...input.capabilities] }),
        }),
      ),
    );
  }
  delete(ref: CatalogRef) {
    return wrap(() => adminAgentTemplates(this.client).delete(target(ref)));
  }
}
