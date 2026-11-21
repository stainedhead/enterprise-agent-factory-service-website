import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// A test that forgets to inject a fake fetch must fail loudly instead of reaching a network.
globalThis.fetch = (() => {
  throw new Error("Unmocked fetch: inject a fake port or fetch");
}) as typeof fetch;

afterEach(() => cleanup());
