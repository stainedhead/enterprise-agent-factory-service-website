import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "./navigation.js";
import { matchRoute, resolveRoute, routeTable } from "./routes.js";
import { SCREEN_IDS } from "./screens.js";

describe("route table", () => {
  it("has one entry per path and a known screen for each", () => {
    const paths = routeTable().map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const r of routeTable()) expect(SCREEN_IDS).toContain(r.screen);
  });
  it("every navigation item resolves to a route (query strings ignored)", () => {
    for (const item of NAV_ITEMS) {
      const path = item.route.split("?")[0]?.replace(":teamId", "team_1") as string;
      expect(resolveRoute(path), item.id).toBeDefined();
    }
  });
});

describe("matchRoute and resolveRoute", () => {
  it("extracts params and decodes them", () => {
    expect(matchRoute("/t/:teamId/agents/:agentId", "/t/team_1/agents/a%20b")).toEqual({
      teamId: "team_1",
      agentId: "a b",
    });
    expect(matchRoute("/teams", "/teams/x")).toBeUndefined();
    expect(matchRoute("/teams", "/other")).toBeUndefined();
    expect(matchRoute("/", "/")).toEqual({});
  });
  it("prefers a static route over a parameterised one", () => {
    expect(resolveRoute("/teams/new")?.route.screen).toBe("S3");
    expect(resolveRoute("/t/team_1/agents/new")?.route.screen).toBe("T3");
    expect(resolveRoute("/t/team_1/agents/agt_9")?.route.screen).toBe("T2");
    expect(resolveRoute("/nope/at/all")).toBeUndefined();
  });
});
