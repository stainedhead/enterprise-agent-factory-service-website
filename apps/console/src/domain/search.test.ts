import { describe, expect, it } from "vitest";
import { filterSearch, type SearchEntry } from "./search.js";

const e = (type: SearchEntry["type"], id: string, label: string): SearchEntry => ({
  type,
  id,
  label,
  route: `/${id}`,
});

describe("filterSearch with orchestration and model access", () => {
  const index = [
    e("model-access", "team_1", "Alpha model access"),
    e("orchestration", "team_1", "Alpha orchestration agent"),
    e("team", "team_1", "Alpha"),
  ];
  it("groups in a stable order: team, orchestration, model access", () => {
    expect(filterSearch(index, "alpha").map((g) => g.type)).toEqual([
      "team",
      "orchestration",
      "model-access",
    ]);
  });
  it("matches the words of the label", () => {
    expect(filterSearch(index, "orchestration").flatMap((g) => g.entries)).toHaveLength(1);
    expect(filterSearch(index, "model access").flatMap((g) => g.entries)).toHaveLength(1);
  });
  it("needs two characters", () => {
    expect(filterSearch(index, "a")).toEqual([]);
  });
});
