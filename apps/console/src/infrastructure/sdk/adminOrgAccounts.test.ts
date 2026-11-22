import { describe, expect, it } from "vitest";
import { SdkAdminOrgAccounts } from "./adminOrgAccounts.js";
import { fakeApi, json, on } from "./testing.js";

describe("SdkAdminOrgAccounts (M4-W)", () => {
  it("lists organization accounts and a team's allowed accounts", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/admin/org-accounts", () =>
        json({
          items: [{ accountId: "111122223333", name: "prod", status: "active", syncedAt: "t" }],
        }),
      ),
      on("GET", "/v1/teams/t1/allowed-accounts", () =>
        json({ items: [{ accountId: "111122223333", name: "prod" }] }),
      ),
    );
    const port = new SdkAdminOrgAccounts(client);
    expect(await port.listOrgAccounts()).toEqual([
      { accountId: "111122223333", name: "prod", status: "active" },
    ]);
    expect((await port.listAllowed("t1"))[0]?.accountId).toBe("111122223333");
  });
  it("counts role links per account across the team's agents", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/teams/t1/agents", () => json({ items: [{ id: "agt_1" }, { id: "agt_2" }] })),
      on("GET", "/v1/teams/t1/agents/agt_1/role-links", () =>
        json({ items: [{ accountId: "111122223333" }, { accountId: "444455556666" }] }),
      ),
      on("GET", "/v1/teams/t1/agents/agt_2/role-links", () =>
        json({ items: [{ accountId: "111122223333" }] }),
      ),
    );
    expect(await new SdkAdminOrgAccounts(client).linkCounts("t1")).toEqual({
      "111122223333": 2,
      "444455556666": 1,
    });
  });
});
