import { AppError } from "../../errors.js";
import type {
  AdminAgentTemplatesPort,
  AdminStorageClassesPort,
  AgentTemplateInput,
  StorageClassInput,
} from "../../ports/adminCatalogs.js";
import type { AgentTemplateRecord, StorageClassRecord } from "../../ports/agents.js";

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

export const STORAGE_NAME = /^[a-z][a-z0-9-]{0,62}$/;
export const TEMPLATE_NAME = /^[a-z][a-z0-9-]{1,62}$/;
export const HARNESS = /^[a-z][a-z0-9-]*$/;
export const DIGEST = /^sha256:[0-9a-f]{64}$/;

const ref = (r: { name: string; version?: number | undefined }) => ({
  name: r.name,
  ...(r.version !== undefined && { version: r.version }),
});

/** Storage classes of the service (WEB-US-20.3): add, edit, remove and mark the default (the first enabled one). */
export class AdminStorageClassesUseCases {
  constructor(private readonly port: AdminStorageClassesPort) {}
  list(signal?: AbortSignal) {
    return this.port.list(signal);
  }
  /** A new class (no `existing`) or an edit of it. */
  put(name: string, input: StorageClassInput, existing?: StorageClassRecord) {
    if (!STORAGE_NAME.test(name))
      return Promise.reject(invalid("name", "Use lower-case letters, digits and hyphens"));
    if (!["gp3", "io2"].includes(input.volumeType))
      return Promise.reject(invalid("volumeType", "Choose gp3 or io2"));
    return this.port.put(ref({ name, version: existing?.version }), input);
  }
  setEnabled(c: StorageClassRecord, enabled: boolean) {
    return this.port.put(ref(c), { volumeType: c.volumeType, description: c.description, enabled });
  }
  delete(c: StorageClassRecord) {
    return this.port.delete(ref(c));
  }
}

/** Agent templates of the service (WEB-US-20.4, 22.1). */
export class AdminAgentTemplatesUseCases {
  constructor(private readonly port: AdminAgentTemplatesPort) {}
  list(signal?: AbortSignal) {
    return this.port.list(signal);
  }
  put(name: string, input: AgentTemplateInput, existing?: AgentTemplateRecord) {
    if (!TEMPLATE_NAME.test(name))
      return Promise.reject(invalid("name", "Use 2 to 63 lower-case letters, digits and hyphens"));
    if (!HARNESS.test(input.harness))
      return Promise.reject(invalid("harness", "Enter the harness"));
    if (input.allowedDigests.length === 0 || !input.allowedDigests.every((d) => DIGEST.test(d)))
      return Promise.reject(
        invalid("allowedDigests", "Enter at least one digest, such as sha256:<64 hex digits>"),
      );
    if (!input.allowedDigests.includes(input.currentDigest))
      return Promise.reject(invalid("currentDigest", "The current digest must be an allowed one"));
    return this.port.put(ref({ name, version: existing?.version }), input);
  }
  setEnabled(t: AgentTemplateRecord, enabled: boolean) {
    return this.port.put(ref(t), {
      harness: t.harness,
      allowedDigests: t.allowedDigests,
      currentDigest: t.currentDigest,
      description: t.description,
      defaultResources: t.defaultResources,
      enabled,
    });
  }
  delete(t: AgentTemplateRecord) {
    return this.port.delete(ref(t));
  }
}
