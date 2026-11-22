import { describe, expect, it } from "vitest";
import { SdkSecrets } from "./secrets.js";
import { fakeApi, json, on } from "./testing.js";

const secret = {
  id: "sec_1",
  name: "github-bot-key",
  scope: "team",
  boundTo: ["agt_1"],
  secretsManagerPath: "afs/afs-alpha/github-bot-key",
  version: 3,
};

describe("SdkSecrets (M2-S1)", () => {
  it("lists metadata across pages", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/teams/team_1/secrets", (r) =>
        r.query.get("nextToken")
          ? json({ items: [{ ...secret, id: "sec_2" }] })
          : json({ items: [secret], nextToken: "n2" }),
      ),
    );
    expect((await new SdkSecrets(client).list("team_1")).map((s) => s.id)).toEqual([
      "sec_1",
      "sec_2",
    ]);
  });

  it("sends the value once on create and returns metadata with no value", async () => {
    const { client, calls } = fakeApi(
      on("POST", "/v1/teams/team_1/secrets", () => json(secret, 201)),
    );
    const r = await new SdkSecrets(client).create(
      "team_1",
      { scope: "team", name: "github-bot-key" },
      "VALUE-1",
    );
    expect(calls[0]?.body).toEqual({ scope: "team", name: "github-bot-key", value: "VALUE-1" });
    expect(JSON.stringify(r)).not.toContain("VALUE-1");
    expect(Object.keys(r)).not.toContain("value");
  });

  it("put value and delete carry If-Match; rotate sends only the value", async () => {
    const { client, calls } = fakeApi(
      on("PUT", "/v1/teams/team_1/secrets/sec_1/value", () => new Response(null, { status: 204 })),
      on("DELETE", "/v1/teams/team_1/secrets/sec_1", () => new Response(null, { status: 204 })),
      on("POST", "/v1/teams/team_1/secrets/sec_1:rotate", () => json(secret)),
    );
    const sdk = new SdkSecrets(client);
    await sdk.putValue("team_1", { id: "sec_1", version: 3 }, "V2");
    await sdk.delete("team_1", { id: "sec_1", version: 3 });
    await sdk.rotate("team_1", "sec_1", "V3");
    expect(calls[0]?.headers.get("if-match")).toBe('"3"');
    expect(calls[0]?.body).toEqual({ value: "V2" });
    expect(calls[1]?.headers.get("if-match")).toBe('"3"');
    expect(calls[2]?.body).toEqual({ value: "V3" });
  });

  it("keeps the dependents detail of an in-use refusal and never the value", async () => {
    const { client } = fakeApi(
      on("DELETE", "/v1/teams/team_1/secrets/sec_1", () =>
        json(
          { code: "Conflict", message: "in use", requestId: "r1", details: { agents: ["agt_1"] } },
          409,
        ),
      ),
    );
    const e = await new SdkSecrets(client)
      .delete("team_1", { id: "sec_1", version: 1 })
      .catch((x) => x);
    expect(e.kind).toBe("conflict");
    expect(e.details.agents).toEqual(["agt_1"]);
  });
});
