import { describe, expect, it } from "vitest";
import { SdkAdminModels, SdkAdminPricing } from "./adminModels.js";
import { fakeApi, json, on } from "./testing.js";

describe("SdkAdminModels and SdkAdminPricing (M3-P)", () => {
  it("lists models and prices, filters proposals by status and posts the decision note", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/admin/models", () =>
        json({
          items: [
            {
              id: "m1",
              displayName: "One",
              provider: "A",
              enabled: true,
              contextWindow: 1,
              maxOutputTokens: 1,
            },
          ],
        }),
      ),
      on("GET", "/v1/admin/models/m1/prices", () =>
        json({
          items: [
            {
              modelId: "m1",
              effectiveFrom: "2026-10-01T00:00:00Z",
              inputUsdPerMtok: "3.00",
              outputUsdPerMtok: "15.00",
              source: "manual",
            },
          ],
        }),
      ),
      on("GET", "/v1/admin/model-price-proposals", () => json({ items: [] })),
      on("POST", "/v1/admin/model-price-proposals/prop_1:approve", () =>
        json({ id: "prop_1", status: "approved" }),
      ),
      on("POST", "/v1/admin/model-price-proposals/prop_1:reject", () =>
        json({ code: "AccessDenied", message: "no", requestId: "r" }, 403),
      ),
    );
    const m = new SdkAdminModels(client);
    expect((await m.models())[0]?.id).toBe("m1");
    expect((await m.prices("m1"))[0]?.inputUsdPerMtok).toBe("3.00");
    const p = new SdkAdminPricing(client);
    await p.proposals("pending");
    expect(calls.find((c) => c.path.endsWith("model-price-proposals"))?.query.get("status")).toBe(
      "pending",
    );
    await p.approve("prop_1", "ok");
    expect(calls.find((c) => c.path.endsWith(":approve"))?.body).toEqual({ note: "ok" });
    await expect(p.reject("prop_1")).rejects.toMatchObject({ kind: "access-denied" });
  });
});
