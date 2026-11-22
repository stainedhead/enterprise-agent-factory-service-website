import { type AfsClient, adminModels, adminPriceProposals, adminPrices } from "@afs/sdk";
import type {
  AdminModelsPort,
  AdminPricingPort,
  ModelRecord,
  PriceRecord,
  ProposalRecord,
} from "../../application/ports/adminModels.js";
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

/** `admin.models` and `admin.prices` mapped to {@link AdminModelsPort}. */
export class SdkAdminModels implements AdminModelsPort {
  constructor(private readonly client: AfsClient) {}
  models(signal?: AbortSignal): Promise<readonly ModelRecord[]> {
    return wrap(() => all(adminModels(this.client).list({ maxResults: 100, ...sig(signal) })));
  }
  prices(modelId: string, signal?: AbortSignal): Promise<readonly PriceRecord[]> {
    return wrap(() =>
      all(adminPrices(this.client).list(modelId, { maxResults: 100, ...sig(signal) })),
    );
  }
}

/** `admin.priceProposals` mapped to {@link AdminPricingPort}. */
export class SdkAdminPricing implements AdminPricingPort {
  constructor(private readonly client: AfsClient) {}
  proposals(status: string, signal?: AbortSignal): Promise<readonly ProposalRecord[]> {
    return wrap(() =>
      all(adminPriceProposals(this.client).list({ status, maxResults: 100, ...sig(signal) })),
    );
  }
  approve(id: string, note?: string): Promise<ProposalRecord> {
    return wrap(() => adminPriceProposals(this.client).approve(id, note ? { note } : {}));
  }
  reject(id: string, note?: string): Promise<ProposalRecord> {
    return wrap(() => adminPriceProposals(this.client).reject(id, note ? { note } : {}));
  }
}
