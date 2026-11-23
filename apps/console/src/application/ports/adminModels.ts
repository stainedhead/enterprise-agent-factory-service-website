// The service model catalog and pricing (M3-P, S4): `ListAdminModels`, `ListModelPrices`,
// `ListModelPriceProposals`, `ApproveModelPriceProposal`, `RejectModelPriceProposal`.

export interface ModelRecord {
  readonly id: string;
  readonly displayName: string;
  readonly provider: string;
  /** The per-model flag; ignored (read-only) while the service access is `all` (MOD-1). */
  readonly enabled: boolean;
  readonly contextWindow: number;
  readonly maxOutputTokens: number;
  readonly version?: number | undefined;
  /** Enabled at the service level, taking the service access into account. */
  readonly serviceEnabled?: boolean | undefined;
  readonly callable?: boolean | undefined;
  /** `approved`, `pending` or `none`. */
  readonly priceState?: string | undefined;
  readonly teamsWithAccess?: number | undefined;
  /** `manual` or `bedrock_sync`. */
  readonly origin?: string | undefined;
}

export interface ServiceModelAccessRecord {
  readonly access: "all" | "selected";
  readonly enabledModels: number;
  readonly callableModels: number;
  readonly version: number;
}

export interface PriceRecord {
  readonly modelId: string;
  readonly effectiveFrom: string;
  readonly inputUsdPerMtok: string;
  readonly outputUsdPerMtok: string;
  readonly cacheReadUsdPerMtok?: string | undefined;
  readonly cacheWriteUsdPerMtok?: string | undefined;
  readonly source: string;
  readonly createdBy?: string | undefined;
}

export interface ProposalRecord {
  readonly id: string;
  readonly modelId: string;
  readonly effectiveFrom: string;
  readonly fetchedAt: string;
  readonly inputUsdPerMtok: string;
  readonly outputUsdPerMtok: string;
  readonly cacheReadUsdPerMtok?: string | undefined;
  readonly cacheWriteUsdPerMtok?: string | undefined;
  readonly status: string;
  readonly decidedAt?: string | null | undefined;
  readonly decidedBy?: string | null | undefined;
  readonly note?: string | null | undefined;
}

export interface AdminModelsPort {
  models(signal?: AbortSignal): Promise<readonly ModelRecord[]>;
  /** `PutServiceModelAccess` (`admin:models`). */
  putServiceAccess(access: "all" | "selected"): Promise<ServiceModelAccessRecord>;
  /** Enable or disable one model; the API refuses it while the service access is `all`. */
  setEnabled(
    ref: { id: string; version?: number | undefined },
    enabled: boolean,
  ): Promise<ModelRecord>;
  prices(modelId: string, signal?: AbortSignal): Promise<readonly PriceRecord[]>;
}

export interface AdminPricingPort {
  proposals(status: string, signal?: AbortSignal): Promise<readonly ProposalRecord[]>;
  approve(id: string, note?: string): Promise<ProposalRecord>;
  reject(id: string, note?: string): Promise<ProposalRecord>;
}
