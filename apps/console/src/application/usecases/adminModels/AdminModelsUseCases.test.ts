import { describe, expect, it, vi } from "vitest";
import type {
  AdminModelsPort,
  AdminPricingPort,
  PriceRecord,
  ProposalRecord,
} from "../../ports/adminModels.js";
import { AdminModelsUseCases, AdminPricingUseCases, priceAt } from "./AdminModelsUseCases.js";

const NOW = Date.parse("2026-11-22T00:00:00Z");
const clock = { now: () => NOW };
const price = (effectiveFrom: string, input = "3.00"): PriceRecord => ({
  modelId: "m1",
  effectiveFrom,
  inputUsdPerMtok: input,
  outputUsdPerMtok: "15.00",
  source: "manual",
});
const proposal = (over: Partial<ProposalRecord> = {}): ProposalRecord => ({
  id: "prop_1",
  modelId: "m1",
  effectiveFrom: "2026-12-01T00:00:00Z",
  fetchedAt: "2026-11-21T02:00:00Z",
  inputUsdPerMtok: "0.80",
  outputUsdPerMtok: "4.00",
  status: "pending",
  ...over,
});

const models: AdminModelsPort = {
  putServiceAccess: vi.fn(async (access: "all" | "selected") => ({
    access,
    enabledModels: 0,
    callableModels: 0,
    version: 1,
  })),
  setEnabled: vi.fn(),
  models: vi.fn(async () => [
    {
      id: "m1",
      displayName: "One",
      provider: "Anthropic",
      enabled: true,
      contextWindow: 1,
      maxOutputTokens: 1,
    },
    {
      id: "m2",
      displayName: "Two",
      provider: "Amazon",
      enabled: false,
      contextWindow: 1,
      maxOutputTokens: 1,
    },
  ]),
  prices: vi.fn(async (id: string) =>
    id === "m1"
      ? [
          price("2026-06-01T00:00:00Z", "2.00"),
          price("2026-10-01T00:00:00Z"),
          price("2027-01-01T00:00:00Z", "9.00"),
        ]
      : [],
  ),
};

describe("AdminModelsUseCases (M3-P1)", () => {
  it("picks the price in effect now, ignoring future-dated ones", () => {
    expect(
      priceAt(
        [
          price("2026-06-01T00:00:00Z", "2.00"),
          price("2026-10-01T00:00:00Z"),
          price("2027-01-01T00:00:00Z", "9.00"),
        ],
        NOW,
      )?.inputUsdPerMtok,
    ).toBe("3.00");
    expect(priceAt([price("2027-01-01T00:00:00Z")], NOW)).toBeUndefined();
  });
  it("lists models with their current price and gives a newest-first history", async () => {
    const uc = new AdminModelsUseCases(models, clock);
    const rows = await uc.catalog();
    expect(rows[0]?.current?.inputUsdPerMtok).toBe("3.00");
    expect(rows[1]?.current).toBeUndefined();
    expect((await uc.history("m1")).map((p) => p.effectiveFrom.slice(0, 7))).toEqual([
      "2027-01",
      "2026-10",
      "2026-06",
    ]);
  });
});

describe("AdminPricingUseCases (M3-P1)", () => {
  const port = (): AdminPricingPort => ({
    proposals: vi.fn(async () => [proposal(), proposal({ id: "prop_2" })]),
    approve: vi.fn(async () => proposal({ status: "approved" })),
    reject: vi.fn(async () => proposal({ status: "rejected" })),
  });
  it("shows each pending proposal beside the price it replaces, reading each model once", async () => {
    const p = port();
    (models.prices as ReturnType<typeof vi.fn>).mockClear();
    const rows = await new AdminPricingUseCases(p, models, clock).pending();
    expect(p.proposals).toHaveBeenCalledWith("pending", undefined);
    expect(rows[0]?.old?.inputUsdPerMtok).toBe("3.00");
    expect(models.prices).toHaveBeenCalledTimes(1);
  });
  it("approves and rejects with a trimmed optional note", async () => {
    const p = port();
    const uc = new AdminPricingUseCases(p, models, clock);
    await uc.decide("prop_1", "approve", "  looks right ");
    await uc.decide("prop_1", "reject", "   ");
    expect(p.approve).toHaveBeenCalledWith("prop_1", "looks right");
    expect(p.reject).toHaveBeenCalledWith("prop_1", undefined);
  });
});
