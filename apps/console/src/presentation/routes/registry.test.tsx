import { expect, it } from "vitest";
import { SCREEN_IDS } from "../../domain/screens.js";
import { registry } from "./registry.js";

it("registers all 61 screens", () => {
  expect(SCREEN_IDS).toHaveLength(61);
  expect(Object.keys(registry).sort()).toEqual([...SCREEN_IDS].sort());
});
