import { expect, it } from "vitest";
import { NotImplementedError, notImplementedPort } from "./wiring.js";

it("notImplementedPort throws Unavailable-style errors on use", () => {
  const p = notImplementedPort<{ list(): void }>("teams");
  expect(() => p.list()).toThrow(NotImplementedError);
});
