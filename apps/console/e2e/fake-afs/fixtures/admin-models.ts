import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;
const ts = "2026-11-21T18:00:00Z";

const MODELS: [string, string, string, boolean, string, string][] = [
  ["anthropic.claude-opus-4", "Claude Opus 4", "Anthropic", true, "15.00", "75.00"],
  ["anthropic.claude-sonnet-4-5", "Claude Sonnet 4.5", "Anthropic", true, "3.00", "15.00"],
  ["anthropic.claude-haiku-4", "Claude Haiku 4", "Anthropic", true, "1.00", "5.00"],
  ["amazon.nova-pro", "Nova Pro", "Amazon", true, "0.80", "3.20"],
  ["amazon.titan-embed", "Titan Embed", "Amazon", true, "0.02", "0.00"],
  ["meta.llama-3", "Llama 3", "Meta", false, "0.72", "0.72"],
];

const seedPrices = (): Map<string, Json[]> =>
  new Map(
    MODELS.map(([id, , , , input, output]) => [
      id,
      [
        {
          modelId: id,
          effectiveFrom: "2026-10-01T00:00:00Z",
          inputUsdPerMtok: input,
          outputUsdPerMtok: output,
          cacheReadUsdPerMtok: "0.30",
          cacheWriteUsdPerMtok: "3.75",
          source: "aws_price_list",
          createdBy: "priya.raman",
          createdAt: ts,
        },
        {
          modelId: id,
          effectiveFrom: "2026-06-01T00:00:00Z",
          inputUsdPerMtok: input,
          outputUsdPerMtok: output,
          source: "manual",
          createdBy: "priya.raman",
          createdAt: ts,
        },
      ],
    ]),
  );

const seedProposals = (): Json[] => [
  {
    id: "mpp_01JD2Q3R4S5T6V7W8X9Y0Z0001",
    modelId: "anthropic.claude-haiku-4",
    effectiveFrom: "2026-12-01T00:00:00Z",
    fetchedAt: "2026-11-21T02:00:00Z",
    inputUsdPerMtok: "0.80",
    outputUsdPerMtok: "4.00",
    cacheReadUsdPerMtok: "0.08",
    cacheWriteUsdPerMtok: "1.00",
    status: "pending",
    version: 1,
  },
];

let prices = seedPrices();
let proposals = seedProposals();
export const resetAdminModels = (): void => {
  prices = seedPrices();
  proposals = seedProposals();
};

const notFound = {
  status: 404,
  body: { code: "NotFound", message: "Proposal not found", requestId: "req_fake_nf" },
};

const decide =
  (status: "approved" | "rejected") =>
  ({ params, body }: { params: Readonly<Record<string, string>>; body: unknown }) => {
    const i = proposals.findIndex((p) => p.id === params.proposalId);
    const cur = proposals[i];
    if (!cur) return notFound;
    if (cur.status !== "pending")
      return {
        status: 409,
        body: { code: "Conflict", message: "Proposal already decided", requestId: "req_fake_c" },
      };
    const note = (body as Json | undefined)?.note;
    const next = {
      ...cur,
      status,
      decidedAt: "2026-11-22T10:00:00Z",
      decidedBy: "usr_svc-admin",
      ...(note ? { note } : {}),
    };
    proposals[i] = next;
    if (status === "approved") {
      const list = prices.get(String(cur.modelId)) ?? [];
      list.unshift({
        modelId: cur.modelId,
        effectiveFrom: cur.effectiveFrom,
        inputUsdPerMtok: cur.inputUsdPerMtok,
        outputUsdPerMtok: cur.outputUsdPerMtok,
        cacheReadUsdPerMtok: cur.cacheReadUsdPerMtok,
        cacheWriteUsdPerMtok: cur.cacheWriteUsdPerMtok,
        source: "aws_price_list",
        createdBy: "svc-admin (approved)",
        createdAt: "2026-11-22T10:00:00Z",
      });
      prices.set(String(cur.modelId), list);
    }
    return { status: 200, body: next };
  };

/** The service model catalog, its prices and price proposals (M3-P, S4). */
export const adminModelsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/admin/models",
    response: () => ({
      status: 200,
      body: {
        items: MODELS.map(([id, displayName, provider, enabled]) => ({
          id,
          displayName,
          provider,
          enabled,
          contextWindow: 200000,
          maxOutputTokens: 8192,
          version: 1,
        })),
      },
    }),
  },
  {
    method: "GET",
    path: "/v1/admin/models/{modelId}/prices",
    response: ({ params }) => ({
      status: 200,
      body: { items: prices.get(params.modelId ?? "") ?? [] },
    }),
  },
  {
    method: "GET",
    path: "/v1/admin/model-price-proposals",
    response: ({ query }) => {
      const s = query.get("status");
      return { status: 200, body: { items: proposals.filter((p) => !s || p.status === s) } };
    },
  },
  {
    method: "POST",
    path: "/v1/admin/model-price-proposals/{proposalId}:approve",
    response: decide("approved"),
  },
  {
    method: "POST",
    path: "/v1/admin/model-price-proposals/{proposalId}:reject",
    response: decide("rejected"),
  },
];
