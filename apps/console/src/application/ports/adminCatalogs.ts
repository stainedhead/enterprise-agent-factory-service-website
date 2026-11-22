// Service-level storage classes and agent templates (M2-G, S10): `ListStorageClassesAdmin`, `PutStorageClass`,
// `DeleteStorageClass`, `ListAdminAgentTemplates`, `PutAgentTemplate`, `DeleteAgentTemplate`.
import type { AgentTemplateRecord, ResourcesRecord, StorageClassRecord } from "./agents.js";

export interface CatalogRef {
  readonly name: string;
  /** Absent for a new entry; present for an edit (sent as `If-Match`). */
  readonly version?: number | undefined;
}

export interface StorageClassInput {
  readonly volumeType: string;
  readonly description?: string | undefined;
  readonly enabled?: boolean | undefined;
}

export interface AgentTemplateInput {
  readonly harness: string;
  readonly allowedDigests: readonly string[];
  readonly currentDigest: string;
  readonly description?: string | undefined;
  readonly enabled?: boolean | undefined;
  readonly defaultResources?: ResourcesRecord | undefined;
}

export interface AdminStorageClassesPort {
  list(signal?: AbortSignal): Promise<readonly StorageClassRecord[]>;
  put(ref: CatalogRef, input: StorageClassInput): Promise<StorageClassRecord>;
  delete(ref: CatalogRef): Promise<void>;
}

export interface AdminAgentTemplatesPort {
  list(signal?: AbortSignal): Promise<readonly AgentTemplateRecord[]>;
  put(ref: CatalogRef, input: AgentTemplateInput): Promise<AgentTemplateRecord>;
  delete(ref: CatalogRef): Promise<void>;
}
