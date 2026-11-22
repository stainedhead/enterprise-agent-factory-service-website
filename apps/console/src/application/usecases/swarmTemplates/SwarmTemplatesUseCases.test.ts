import { describe, expect, it } from "vitest";
import type { SwarmTemplateRecord } from "../../ports/swarmTemplates.js";
import { SwarmTemplatesUseCases } from "./SwarmTemplatesUseCases.js";

const t = (id: string, enabled: boolean): SwarmTemplateRecord => ({
  id,
  name: id,
  kind: "general",
  budgetUsd: "1.00",
  ttlHours: 1,
  teardownRule: "at_expiry",
  enabled,
  spec: { stages: [], pools: [] },
  version: 1,
});

describe("SwarmTemplatesUseCases (M6-W1)", () => {
  it("offers only enabled templates for a work order", async () => {
    const uc = new SwarmTemplatesUseCases({ list: async () => [t("a", true), t("b", false)] });
    expect((await uc.enabled()).map((x) => x.id)).toEqual(["a"]);
    expect(await uc.list()).toHaveLength(2);
  });
});
