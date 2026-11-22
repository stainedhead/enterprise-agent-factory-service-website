import { expect, it } from "vitest";
import { SCREEN_IDS } from "../../domain/screens.js";
import { registry } from "./registry.js";

it("registers all 35 screens", () => {
  expect(SCREEN_IDS).toHaveLength(35);
  expect(Object.keys(registry).sort()).toEqual([...SCREEN_IDS].sort());
});
