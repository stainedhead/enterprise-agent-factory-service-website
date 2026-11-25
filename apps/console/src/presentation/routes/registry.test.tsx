import { expect, it } from "vitest";
import { SCREEN_IDS } from "../../domain/screens.js";
import { registry } from "./registry.js";

it("registers all 50 screens", () => {
  expect(SCREEN_IDS).toHaveLength(50);
  expect(Object.keys(registry).sort()).toEqual([...SCREEN_IDS].sort());
});
