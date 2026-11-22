import { expect, it } from "vitest";
import { parse } from "yaml";

it("yaml imports and parses", () => {
  expect(parse("a: 1")).toEqual({ a: 1 });
});
