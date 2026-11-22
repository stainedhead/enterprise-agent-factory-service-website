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

export interface SwarmTemplatesPort {
  list(signal?: AbortSignal): Promise<readonly SwarmTemplateRecord[]>;
}
