import { QueryClient } from "@tanstack/react-query";
import * as oauth from "oauth4webapi";
import { createMemoryRouter } from "react-router";
import { expect, it } from "vitest";
import { onLCP } from "web-vitals";

it("runtime dependencies import under TypeScript 7 and Bun", () => {
  expect(new QueryClient()).toBeDefined();
  expect(typeof oauth.discoveryRequest).toBe("function");
  expect(typeof createMemoryRouter).toBe("function");
  expect(typeof onLCP).toBe("function");
});
