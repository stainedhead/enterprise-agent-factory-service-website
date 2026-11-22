import { describe, expect, it } from "vitest";
import { SdkConfig } from "./config.js";
import { fakeApi, json, on } from "./testing.js";

const v = { name: "LOG_LEVEL", source: "namespace", value: "info", version: 2, usedBy: ["agt_1"] };

describe("SdkConfig (M2-V1)", () => {
  it("lists namespace and agent values", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/teams/team_1/config-values", () => json({ items: [v] })),
      on("GET", "/v1/teams/team_1/agents/agt_1/config-values", () =>
        json({ items: [{ name: "LOG_LEVEL", source: "namespace", resolvedValue: "info" }] }),
      ),
    );
    const sdk = new SdkConfig(client);
    expect((await sdk.listNamespace("team_1"))[0]?.usedBy).toEqual(["agt_1"]);
    expect((await sdk.listAgent("team_1", "agt_1"))[0]?.resolvedValue).toBe("info");
  });

  it("puts a held version as If-Match and a new value without one", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/team_1/config-values", () => json({ items: [] })),
      on("PUT", "/v1/teams/team_1/config-values/LOG_LEVEL", () => json(v)),
      on("PUT", "/v1/teams/team_1/config-values/NEW_ONE", () => json({ ...v, name: "NEW_ONE" })),
    );
    const sdk = new SdkConfig(client);
    await sdk.putNamespace("team_1", { name: "LOG_LEVEL", version: 2 }, "debug");
    await sdk.putNamespace("team_1", { name: "NEW_ONE" }, "x");
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts[0]?.headers.get("if-match")).toBe('"2"');
    expect(puts[0]?.body).toEqual({ value: "debug" });
    expect(puts[1]?.headers.get("if-match")).toBeNull();
  });

  it("puts an agent value by source and deletes", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/team_1/agents/agt_1/config-values", () =>
        json({ items: [{ name: "MAX_PRS", source: "literal", value: "2", version: 1 }] }),
      ),
      on("PUT", "/v1/teams/team_1/agents/agt_1/config-values/MAX_PRS", () =>
        json({ name: "MAX_PRS", source: "literal", value: "3" }),
      ),
      on(
        "DELETE",
        "/v1/teams/team_1/agents/agt_1/config-values/MAX_PRS",
        () => new Response(null, { status: 204 }),
      ),
    );
    const sdk = new SdkConfig(client);
    await sdk.putAgent("team_1", "agt_1", { name: "MAX_PRS" }, { source: "literal", value: "3" });
    await sdk.deleteAgent("team_1", "agt_1", { name: "MAX_PRS" });
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ source: "literal", value: "3" });
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });
});
