import { describe, expect, it } from "vitest";
import { SdkAudit, SdkRevisions } from "./history.js";
import { fakeApi, json, on } from "./testing.js";

const ev = {
  id: 1,
  occurredAt: "2026-11-21T10:00:00Z",
  actorType: "user",
  actorId: "usr_a",
  action: "agents.create",
  outcome: "allowed",
  requestId: "req_1",
};
const rev = {
  revision: 3,
  resourceKind: "team",
  resourceId: "team_1",
  operation: "update",
  changedBy: "usr_a",
  changedAt: "2026-11-21T10:00:00Z",
  snapshot: { displayName: "Alpha" },
};

describe("SdkAudit (M1-H1)", () => {
  it("sends the filter and page as query parameters", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/team_1/audit-events", () => json({ items: [ev], nextToken: "n2" })),
    );
    const r = await new SdkAudit(client).list(
      "team_1",
      { action: "agents.create", outcome: "denied", actorId: "usr_a" },
      { maxResults: 25, nextToken: "n1" },
    );
    expect(r.nextToken).toBe("n2");
    const q = calls[0]?.query;
    expect(q?.get("action")).toBe("agents.create");
    expect(q?.get("outcome")).toBe("denied");
    expect(q?.get("actorId")).toBe("usr_a");
    expect(q?.get("maxResults")).toBe("25");
    expect(q?.get("nextToken")).toBe("n1");
  });

  it("asks for CSV with the same filter", async () => {
    const { client, calls } = fakeApi(
      on(
        "GET",
        "/v1/teams/team_1/audit-events",
        () =>
          new Response("id,action\n1,agents.create\n", { headers: { "content-type": "text/csv" } }),
      ),
    );
    expect(await new SdkAudit(client).csv("team_1", { outcome: "denied" })).toContain(
      "agents.create",
    );
    expect(calls[0]?.headers.get("accept")).toContain("text/csv");
    expect(calls[0]?.query.get("outcome")).toBe("denied");
  });
});

describe("SdkRevisions (M1-H2)", () => {
  it("lists with the resource filter and reads one with its snapshot", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/team_1/revisions", () =>
        json({ items: [{ ...rev, snapshot: undefined }] }),
      ),
      on("GET", "/v1/teams/team_1/revisions/3", () => json(rev)),
    );
    const sdk = new SdkRevisions(client);
    await sdk.list("team_1", { resourceKind: "team", resourceId: "team_1" }, { maxResults: 10 });
    expect(calls[0]?.query.get("resourceKind")).toBe("team");
    expect((await sdk.get("team_1", 3)).snapshot).toEqual({ displayName: "Alpha" });
  });
});
