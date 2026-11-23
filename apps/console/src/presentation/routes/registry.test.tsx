import { expect, it } from "vitest";
import { SCREEN_IDS } from "../../domain/screens.js";
import { registry } from "./registry.js";

it("registers all 37 screens", () => {
  expect(SCREEN_IDS).toHaveLength(37);
  expect(Object.keys(registry).sort()).toEqual([...SCREEN_IDS].sort());
});
