import { describe, expect, it } from "vitest";
import { directoryLabel, TeamDirectoryUseCases } from "./TeamDirectoryUseCases.js";

describe("TeamDirectoryUseCases (M6-W1)", () => {
  it("lists teams by name and labels them with the slug", async () => {
    const uc = new TeamDirectoryUseCases({
      list: async () => [
        { id: "team_2", slug: "ledger", displayName: "Ledger" },
        { id: "team_1", slug: "payments", displayName: "Payments" },
      ],
    });
    const out = await uc.list();
    expect(out.map((t) => t.id)).toEqual(["team_2", "team_1"]);
    expect(directoryLabel(out[1] as never)).toBe("Payments (payments)");
  });
});
