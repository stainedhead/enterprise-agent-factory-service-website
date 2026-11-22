import { describe, expect, it } from "vitest";
import { SdkAdminCostTagStatus } from "./adminCostTagStatus.js";
import { fakeApi, json, on } from "./testing.js";

describe("SdkAdminCostTagStatus (M5-T1)", () => {
  it("lists the status of every key", async () => {
    const wire = {
      key: "afs-team-id",
      seenInCur: true,
      firstSeenAt: "2026-10-02T00:00:00Z",
      lastSeenAt: null,
      awsStatus: "active",
      checkedAt: "2026-11-21T18:00:00Z",
    };
    const { client } = fakeApi(
      on("GET", "/v1/admin/cost-tag-status", () => json({ items: [wire] })),
    );
    expect(await new SdkAdminCostTagStatus(client).list()).toEqual([wire]);
  });
  it("maps an API refusal to an app error", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/admin/cost-tag-status", () =>
        json({ code: "AccessDenied", message: "no", requestId: "r1" }, 403),
      ),
    );
    await expect(new SdkAdminCostTagStatus(client).list()).rejects.toMatchObject({
      isAccessDenied: true,
    });
  });
});
