// Swarm templates (P5; M6-W reads them for *Create work order*, M6-T manages them).

export interface SwarmTemplateRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly description?: string | undefined;
  readonly budgetUsd: string;
  readonly ttlHours: number;
  readonly teardownRule: string;
  readonly enabled: boolean;
  readonly spec: SwarmTemplateSpec;
  readonly version: number;
  readonly updatedAt?: string | undefined;
}

export interface SwarmTemplateSpec {
  readonly stages: readonly Readonly<Record<string, unknown>>[];
  readonly pools: readonly Readonly<Record<string, unknown>>[];
  readonly handoffs?: readonly Readonly<Record<string, unknown>>[] | undefined;
  readonly secrets?: readonly Readonly<Record<string, unknown>>[] | undefined;
  readonly configValues?: readonly Readonly<Record<string, unknown>>[] | undefined;
}

export interface SwarmTemplatesReadPort {
  list(signal?: AbortSignal): Promise<readonly SwarmTemplateRecord[]>;
}

export type TeardownRule = "at_expiry" | "at_cap_or_expiry" | "at_work_complete";

export interface SwarmTemplateInput {
  readonly name: string;
  readonly kind: "cve_remediation" | "general";
  readonly description?: string | undefined;
  readonly budgetUsd: string;
  readonly ttlHours: number;
  readonly teardownRule: TeardownRule;
  readonly enabled: boolean;
  readonly spec: SwarmTemplateSpec;
}

export interface SwarmTemplatePatch {
  readonly description?: string | undefined;
  readonly budgetUsd?: string | undefined;
  readonly ttlHours?: number | undefined;
  readonly teardownRule?: TeardownRule | undefined;
  readonly spec?: SwarmTemplateSpec | undefined;
}

export interface SwarmTemplatesWritePort {
  get(id: string, signal?: AbortSignal): Promise<SwarmTemplateRecord>;
  create(input: SwarmTemplateInput): Promise<SwarmTemplateRecord>;
  /** Replaces the changed fields; `version` is sent as `If-Match`. */
  update(
    ref: { id: string; version?: number | undefined },
    patch: SwarmTemplatePatch,
  ): Promise<SwarmTemplateRecord>;
  delete(ref: { id: string; version?: number | undefined }): Promise<void>;
  enable(id: string): Promise<SwarmTemplateRecord>;
  disable(id: string): Promise<SwarmTemplateRecord>;
}

export interface SwarmTemplatesPort extends SwarmTemplatesReadPort, SwarmTemplatesWritePort {}
