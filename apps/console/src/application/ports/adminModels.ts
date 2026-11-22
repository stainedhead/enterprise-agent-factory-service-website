// The service model catalog and pricing (M3-P, S4): `ListAdminModels`, `ListModelPrices`,
// `ListModelPriceProposals`, `ApproveModelPriceProposal`, `RejectModelPriceProposal`.

export interface ModelRecord {
  readonly id: string;
  readonly displayName: string;
  readonly provider: string;
  readonly enabled: boolean;
  readonly contextWindow: number;
  readonly maxOutputTokens: number;
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
  prices(modelId: string, signal?: AbortSignal): Promise<readonly PriceRecord[]>;
}

export interface AdminPricingPort {
  proposals(status: string, signal?: AbortSignal): Promise<readonly ProposalRecord[]>;
  approve(id: string, note?: string): Promise<ProposalRecord>;
  reject(id: string, note?: string): Promise<ProposalRecord>;
}
