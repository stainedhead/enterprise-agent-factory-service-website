import { describe, expect, it } from "vitest";
import { createAfs } from "../generated/index.js";
import { operations } from "../generated/operations.js";
import { fakeFetch } from "../testing/fakeFetch.js";
import { apiKey } from "./auth.js";
import { metaOf } from "./types.js";

const mk = (f: ReturnType<typeof fakeFetch>) =>
  createAfs({ endpoint: "https://x", fetch: f.fetch, auth: apiKey("afsk_k") });

describe("concurrency (M0-C6)", () => {
  it("a versioned resource sends If-Match with its version", async () => {
    const f = fakeFetch().on("PATCH /v1/teams/t1", { body: { id: "t1", version: 8 } });
    await mk(f).teams.update({ id: "t1", version: 7 }, { displayName: "x" });
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]?.headers.get("If-Match")).toBe('"7"');
  });
  it("an id-only PATCH reads first through the same-path GET and records appliedToVersion", async () => {
    const f = fakeFetch()
      .on("GET /v1/teams/t1", { body: { id: "t1", version: 4 } })
      .on("PATCH /v1/teams/t1", { body: { id: "t1", version: 5 } });
    const t = await mk(f).teams.update("t1", { displayName: "x" });
    expect(f.requests.map((r) => r.method)).toEqual(["GET", "PATCH"]);
    expect(f.requests[1]?.headers.get("If-Match")).toBe('"4"');
    expect(metaOf(t)?.appliedToVersion).toBe(4);
  });
  it("an id-only DELETE with no GET reads the parent list and matches by id", async () => {
    const f = fakeFetch()
      .on("GET /v1/teams/t/members", (req) =>
        req.query.get("nextToken")
          ? { body: { items: [{ id: "b2", version: 9 }] } }
          : { body: { items: [{ id: "b1", version: 1 }], nextToken: "n" } },
      )
      .on("DELETE /v1/teams/t/members/b2", { status: 204 });
    await mk(f).members.remove("t", "b2");
    expect(f.requests.at(-1)?.headers.get("If-Match")).toBe('"9"');
  });
  it("matches owner/repo against the repo property for work order repos", async () => {
    const f = fakeFetch()
      .on("GET /v1/work-orders/w/repos", {
        body: {
          items: [
            { host: "gh", repo: "o/r", version: 6 },
            { host: "gh", repo: "o/x", version: 1 },
          ],
        },
      })
      .on("PATCH /v1/work-orders/w/repos/gh/o/r", {
        body: { host: "gh", repo: "o/r", version: 7 },
      });
    await mk(f).workOrders.repos.update("w", "gh", "o", "r", {} as never);
    expect(f.requests.at(-1)?.headers.get("If-Match")).toBe('"6"');
  });
  it("a missing resource in the reader's list is NotFound", async () => {
    const f = fakeFetch().on("GET /v1/teams/t/members", { body: { items: [] } });
    await expect(mk(f).members.remove("t", "zz")).rejects.toMatchObject({ isNotFound: true });
    expect(f.requests).toHaveLength(1);
  });
  it('a schema without version sends If-Match "1" (CQ-2 interim)', async () => {
    const f = fakeFetch()
      .on("GET /v1/teams/t/api-keys", { body: { items: [{ id: "k1" }] } })
      .on("DELETE /v1/teams/t/api-keys/k1", { status: 204 });
    await mk(f).apiKeys.delete("t", "k1");
    expect(f.requests.at(-1)?.headers.get("If-Match")).toBe('"1"');
  });
  it("reads the version of a wrapped resource from its nested member (TeamMcpServer.server)", async () => {
    const f = fakeFetch()
      .on("GET /v1/teams/t/mcp-servers/m1", {
        body: { enabled: true, server: { id: "m1", version: 6 } },
      })
      .on("PATCH /v1/teams/t/mcp-servers/m1", { body: { server: { id: "m1", version: 7 } } });
    await mk(f).teams.mcpServers.update("t", "m1", { purpose: "x" });
    expect(f.requests.at(-1)?.headers.get("If-Match")).toBe('"6"');
  });
  it("sends no If-Match version when the wrapped member is missing", async () => {
    const f = fakeFetch()
      .on("GET /v1/teams/t/mcp-servers/m1", { body: { enabled: true } })
      .on("DELETE /v1/teams/t/mcp-servers/m1", { status: 204 });
    await expect(mk(f).teams.mcpServers.delete("t", "m1")).rejects.toBeDefined();
  });
  it("PUT sends If-Match when a version is held and none when the reader finds nothing", async () => {
    const held = fakeFetch().on("PUT /v1/teams/t/budget", { body: { version: 3 } });
    await mk(held).budgets.put("t", {} as never, { ifMatch: 2 });
    expect(held.requests[0]?.headers.get("If-Match")).toBe('"2"');
    const absent = fakeFetch()
      .on("GET /v1/teams/t/budget", {
        status: 404,
        body: { code: "NotFound", message: "n", requestId: "r", details: {} },
      })
      .on("PUT /v1/teams/t/budget", { status: 201, body: { version: 1 } });
    await mk(absent).budgets.put("t", {} as never);
    expect(absent.requests[1]?.headers.has("If-Match")).toBe(false);
  });
  it("412 maps to isPreconditionFailed", async () => {
    const f = fakeFetch().on("PATCH /v1/teams/t1", {
      status: 412,
      body: { code: "PreconditionFailed", message: "stale", requestId: "r", details: {} },
    });
    await expect(mk(f).teams.update({ id: "t1", version: 1 }, {})).rejects.toMatchObject({
      isPreconditionFailed: true,
    });
  });
  it("no PATCH or DELETE operation can leave without If-Match", () => {
    const bad = Object.entries(operations)
      .filter(
        ([, o]) => (o.method === "PATCH" || o.method === "DELETE") && o.ifMatch !== "required",
      )
      .map(([id]) => id);
    expect(bad).toEqual([]);
  });
});
