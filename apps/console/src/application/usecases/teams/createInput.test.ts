import { describe, expect, it } from "vitest";
import { emptyTeamDraft, toCreateInput } from "./teamDraft.js";

describe("toCreateInput", () => {
  it("builds the request from a filled draft", () => {
    expect(
      toCreateInput({
        ...emptyTeamDraft(),
        displayName: " Payments ",
        slug: "payments",
        costCenter: "CC",
        description: "d",
        ownerEmail: "o@x.co",
        identityProviderId: "idp_1",
        tags: { env: "prod", empty: "" },
        models: ["m1"],
        maxBudgetUsd: "5000.00",
        adminGroup: "g",
        adminType: "group",
      }),
    ).toEqual({
      displayName: "Payments",
      slug: "payments",
      kind: "persistent",
      maxBudgetUsd: "5000.00",
      costCenter: "CC",
      description: "d",
      ownerEmail: "o@x.co",
      identityProviderId: "idp_1",
      models: ["m1"],
      mayExposeCollaboration: true,
      tags: [{ key: "env", value: "prod" }],
      budget: { amountUsd: "5000.00", thresholds: [50, 80, 100] },
      firstAdmin: { subjectType: "group", groupName: "g" },
    });
  });
  it("omits empty optionals and thresholds", () => {
    const r = toCreateInput({
      ...emptyTeamDraft(),
      displayName: "A",
      slug: "alpha",
      maxBudgetUsd: "1.00",
      thresholds: "",
      adminEmail: "a@b.co",
    });
    expect(r.budget).toEqual({ amountUsd: "1.00" });
    expect(r.firstAdmin).toEqual({ subjectType: "user", email: "a@b.co" });
    expect(r).not.toHaveProperty("costCenter");
  });
});

describe("toCreateInput guardrail (WEB-US-52)", () => {
  it("sends mayExposeCollaboration false only when the checkbox is cleared", () => {
    const d = {
      ...emptyTeamDraft(),
      displayName: "P",
      slug: "pay",
      maxBudgetUsd: "10.00",
      adminEmail: "a@b.co",
    };
    expect(toCreateInput(d).mayExposeCollaboration).toBe(true);
    expect(toCreateInput({ ...d, mayExposeCollaboration: false }).mayExposeCollaboration).toBe(
      false,
    );
  });
});
