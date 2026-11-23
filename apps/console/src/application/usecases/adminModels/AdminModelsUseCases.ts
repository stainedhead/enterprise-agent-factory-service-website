import type {
  AdminModelsPort,
  AdminPricingPort,
  ModelRecord,
  PriceRecord,
  ProposalRecord,
} from "../../ports/adminModels.js";
import type { ClockPort } from "../../ports/auth.js";

export interface CatalogRow {
  readonly model: ModelRecord;
  /** The price in effect now (the latest with `effectiveFrom` not in the future), if any. */
  readonly current: PriceRecord | undefined;
}

/** A pending proposal beside the price it would replace. */
export interface ProposalRow {
  readonly proposal: ProposalRecord;
  readonly old: PriceRecord | undefined;
}

const byDateDesc = (a: PriceRecord, b: PriceRecord) =>
  Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom);

/** The price in effect at `now`: the latest effective date not after it. */
export function priceAt(prices: readonly PriceRecord[], now: number): PriceRecord | undefined {
  return [...prices].sort(byDateDesc).find((p) => Date.parse(p.effectiveFrom) <= now);
}

/** Models and their effective-dated prices (M3-P1). */
export class AdminModelsUseCases {
  constructor(
    private readonly port: AdminModelsPort,
    private readonly clock: Pick<ClockPort, "now">,
  ) {}

  async catalog(signal?: AbortSignal): Promise<readonly CatalogRow[]> {
    const models = await this.port.models(signal);
    const now = this.clock.now();
    return Promise.all(
      models.map(async (model) => ({
        model,
        current: priceAt(await this.port.prices(model.id, signal), now),
      })),
    );
  }

  /** *Save* of the service model access (`admin:models`): `all` ignores the per-model flag (MOD-1). */
  putServiceAccess(access: "all" | "selected") {
    return this.port.putServiceAccess(access);
  }

  /** *Enable* or *Disable* one model; the API refuses it while the service access is `all`. */
  setEnabled(model: Pick<ModelRecord, "id" | "version">, enabled: boolean) {
    return this.port.setEnabled({ id: model.id, version: model.version }, enabled);
  }

  /** The price history of one model, newest first. */
  async history(modelId: string, signal?: AbortSignal): Promise<readonly PriceRecord[]> {
    return [...(await this.port.prices(modelId, signal))].sort(byDateDesc);
  }
}

/** Price proposals awaiting a decision (M3-P1). The API decides who may approve. */
export class AdminPricingUseCases {
  constructor(
    private readonly port: AdminPricingPort,
    private readonly models: AdminModelsPort,
    private readonly clock: Pick<ClockPort, "now">,
  ) {}

  async pending(signal?: AbortSignal): Promise<readonly ProposalRow[]> {
    const list = await this.port.proposals("pending", signal);
    const now = this.clock.now();
    const ids = [...new Set(list.map((p) => p.modelId))];
    const current = new Map(
      await Promise.all(
        ids.map(async (id) => [id, priceAt(await this.models.prices(id, signal), now)] as const),
      ),
    );
    return list.map((proposal) => ({ proposal, old: current.get(proposal.modelId) }));
  }

  decide(id: string, decision: "approve" | "reject", note?: string): Promise<ProposalRecord> {
    const n = note?.trim() || undefined;
    return decision === "approve" ? this.port.approve(id, n) : this.port.reject(id, n);
  }
}
