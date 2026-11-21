import { describe, expect, it } from "vitest";
import { renderCli } from "./cli.js";

describe("renderCli", () => {
  it("renders flags, space-separated lists and quotes unsafe values", () => {
    expect(
      renderCli({
        service: "budgets",
        operation: "put-budget",
        args: [
          ["team-id", "team_1"],
          ["thresholds", ["50", "80", "100"]],
          ["note", "it's fine"],
        ],
      }),
    ).toBe("afs budgets put-budget --team-id team_1 --thresholds 50 80 100 --note 'it'\\''s fine'");
  });
  it("skips undefined, empty and empty-list values", () => {
    expect(
      renderCli({
        service: "teams",
        operation: "list-teams",
        args: [
          ["state", undefined],
          ["kind", ""],
          ["x", []],
        ],
      }),
    ).toBe("afs teams list-teams");
  });
});
