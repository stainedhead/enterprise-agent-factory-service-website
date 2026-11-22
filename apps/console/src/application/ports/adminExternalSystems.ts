// The service catalog of external systems (M2-F, S7): `ListCatalogSystems`, `CreateCatalogSystem`,
// `UpdateCatalogSystem`, `DeleteCatalogSystem`.
import type { ExternalSystemRecord, SystemRef } from "./externalSystems.js";

export interface CatalogSystemInput {
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly endpoints: readonly string[];
  readonly description?: string | undefined;
  readonly docsUrl?: string | undefined;
  readonly enabled?: boolean | undefined;
}

export interface CatalogSystemUpdate {
  readonly name?: string | undefined;
  readonly endpoints?: readonly string[] | undefined;
  readonly description?: string | undefined;
  readonly docsUrl?: string | undefined;
  /** The service-level switch. */
  readonly enabled?: boolean | undefined;
}

export interface AdminExternalSystemsPort {
  list(signal?: AbortSignal): Promise<readonly ExternalSystemRecord[]>;
  create(input: CatalogSystemInput): Promise<ExternalSystemRecord>;
  update(ref: SystemRef, patch: CatalogSystemUpdate): Promise<ExternalSystemRecord>;
  delete(ref: SystemRef): Promise<void>;
}
