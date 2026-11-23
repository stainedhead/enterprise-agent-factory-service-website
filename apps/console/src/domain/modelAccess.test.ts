import { describe, expect, it } from "vitest";
import { renderCli } from "./cli.js";
import {
  droppedModelIds,
  dropReason,
  effectiveModelIds,
  modelFlags,
  modelsColumn,
  modelsCountText,
  priceView,
  putServiceModelAccessCli,
  putTeamModelsCli,
  toModelsBody,
  validateModels,
  withValidDefault,
} from "./modelAccess.js";

const team = ["a", "b", "c", "d"];
const sel = (ids: string[], d: string) => ({
  access: "selected" as const,
  modelIds: ids,
  defaultModelId: d,
});
const all = (d: string) => ({ access: "all" as const, modelIds: [], defaultModelId: d });

describe("effective set (MOD-3, MOD-6)", () => {
  it("all follows the team list, now and later", () => {
    expect(effectiveModelIds(all("a"), team)).toEqual(team);
    expect(effectiveModelIds(all("a"), [...team, "e"])).toHaveLength(5);
  });
  it("selected is the intersection and never grows by itself", () => {
    expect(effectiveModelIds(sel(["b", "x"], "b"), team)).toEqual(["b"]);
    expect(droppedModelIds(sel(["b", "x"], "b"), team)).toEqual(["x"]);
    expect(droppedModelIds(all("a"), team)).toEqual([]);
  });
  it("says which level removed a model", () => {
    expect(dropReason("x", { service: ["a"], team: ["a"] })).toBe("Not enabled for the service");
    expect(dropReason("x", { service: ["a", "x"], team: ["a"] })).toBe("Not allowed for the team");
  });
});

describe("validation", () => {
  it("needs at least one model when selected and an allowed default", () => {
    expect(validateModels(sel([], ""), team).models).toBe("Choose at least one model");
    expect(validateModels(sel(["x"], "x"), team).models).toContain("None of the chosen");
    expect(validateModels(sel(["a", "b"], "c"), team).defaultModelId).toContain("must be one of");
    expect(validateModels(sel(["a", "b"], "a"), team)).toEqual({});
    expect(validateModels(all(""), team).defaultModelId).toBe("Choose a default model");
    expect(validateModels(all("d"), team)).toEqual({});
  });
  it("moves a default that left the set to the first model still allowed", () => {
    expect(withValidDefault(sel(["a", "b"], "c"), team).defaultModelId).toBe("a");
    expect(withValidDefault(sel(["a", "b"], "b"), team).defaultModelId).toBe("b");
    expect(withValidDefault(sel([], "z"), team).defaultModelId).toBe("z");
  });
});

describe("texts and flags", () => {
  it("counts", () => {
    expect(modelsCountText(all("a"), 4)).toBe("All team models (4)");
    expect(modelsCountText(sel(["a", "b", "c"], "a"), 4)).toBe("Selected, 3 of 4 team models");
  });
  it("T2's Model column shows the default and +N", () => {
    expect(modelsColumn({ defaultModelId: "a", effectiveModelIds: ["a", "b", "c"] })).toBe("a +2");
    expect(modelsColumn({ defaultModelId: "a", effectiveModelIds: ["a"] })).toBe("a");
    expect(modelsColumn({ defaultModelId: "a" }, (id) => id.toUpperCase())).toBe("A");
  });
  it("the request body drops the ids for all", () => {
    expect(toModelsBody(all("a"))).toEqual({ access: "all", defaultModelId: "a" });
    expect(toModelsBody(sel(["a", "b"], "a"))).toEqual({
      access: "selected",
      modelIds: ["a", "b"],
      defaultModelId: "a",
    });
  });
  it("--models all | <id> … and --default-model-id", () => {
    expect(modelFlags(all("a"))).toEqual([
      ["models", "all"],
      ["default-model-id", "a"],
    ]);
    expect(modelFlags(sel(["a", "b"], "a"))[0]).toEqual(["models", ["a", "b"]]);
  });
  it("team and service commands", () => {
    expect(renderCli(putTeamModelsCli("team_1", { access: "all", modelIds: [] }))).toBe(
      "afs teams put-team-models --team-id team_1 --access all",
    );
    expect(
      renderCli(putTeamModelsCli("team_1", { access: "selected", modelIds: ["a", "b"] })),
    ).toBe("afs teams put-team-models --team-id team_1 --access selected --model-ids a b");
    expect(renderCli(putServiceModelAccessCli("selected"))).toBe(
      "afs admin put-service-model-access --access selected",
    );
  });
  it("price states", () => {
    expect(priceView("approved").word).toBe("Approved");
    expect(priceView("pending").dot).toBe("amber");
    expect(priceView(undefined).word).toBe("No price");
  });
});
