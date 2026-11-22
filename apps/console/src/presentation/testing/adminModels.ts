import { type Mock, vi } from "vitest";
import type {
  AdminModelsPort,
  AdminPricingPort,
  PriceRecord,
  ProposalRecord,
} from "../../application/ports/adminModels.js";
import {
  AdminModelsUseCases,
  AdminPricingUseCases,
} from "../../application/usecases/adminModels/AdminModelsUseCases.js";

const NOW = Date.parse("2026-11-22T00:00:00Z");
export const aPrice = (over: Partial<PriceRecord> = {}): PriceRecord => ({
  modelId: "anthropic.claude-haiku-4",
  effectiveFrom: "2026-10-01T00:00:00Z",
  inputUsdPerMtok: "1.00",
  outputUsdPerMtok: "5.00",
  source: "aws_price_list",
  createdBy: "priya.raman",
  ...over,
});
export const aProposal = (over: Partial<ProposalRecord> = {}): ProposalRecord => ({
  id: "prop_1",
  modelId: "anthropic.claude-haiku-4",
  effectiveFrom: "2026-12-01T00:00:00Z",
  fetchedAt: "2026-11-21T02:00:00Z",
  inputUsdPerMtok: "0.80",
  outputUsdPerMtok: "4.00",
  cacheReadUsdPerMtok: "0.08",
  cacheWriteUsdPerMtok: "1.00",
  status: "pending",
  ...over,
});

export type FakeModelsPort = { [K in keyof AdminModelsPort]: Mock<AdminModelsPort[K]> };
export type FakePricingPort = { [K in keyof AdminPricingPort]: Mock<AdminPricingPort[K]> };

export function fakeModelsPort(over: Partial<AdminModelsPort> = {}): FakeModelsPort {
  return {
    models: vi.fn(async () => [
      {
        id: "anthropic.claude-haiku-4",
        displayName: "Haiku",
        provider: "Anthropic",
        enabled: true,
        contextWindow: 200000,
        maxOutputTokens: 8000,
      },
      {
        id: "meta.llama-3",
        displayName: "Llama",
        provider: "Meta",
        enabled: false,
        contextWindow: 8000,
        maxOutputTokens: 2000,
      },
    ]),
    prices: vi.fn(async (id: string) =>
      id === "meta.llama-3"
        ? []
        : [aPrice(), aPrice({ effectiveFrom: "2026-06-01T00:00:00Z", source: "manual" })],
    ),
    ...over,
  } as unknown as FakeModelsPort;
}
export function fakePricingPort(over: Partial<AdminPricingPort> = {}): FakePricingPort {
  return {
    proposals: vi.fn(async () => [aProposal()]),
    approve: vi.fn(async () => aProposal({ status: "approved" })),
    reject: vi.fn(async () => aProposal({ status: "rejected" })),
    ...over,
  } as unknown as FakePricingPort;
}
const clock = { now: () => NOW };
export const adminModelsServices = (m: AdminModelsPort, p: AdminPricingPort) => ({
  adminModels: new AdminModelsUseCases(m, clock),
  adminPricing: new AdminPricingUseCases(p, m, clock),
});
