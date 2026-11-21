import { describe, expect, it } from "vitest";
import { createAfs } from "../generated/index.js";
import { fakeFetch } from "../testing/fakeFetch.js";
import { apiKey } from "./auth.js";
import { metaOf } from "./types.js";

const team = { id: "team_1", slug: "pay", version: 3, displayName: "Pay" };

function client(f: ReturnType<typeof fakeFetch>, extra = {}) {
  return createAfs({
    endpoint: "https://afs.test/",
    fetch: f.fetch,
    auth: apiKey("afsk_test"),
    ...extra,
  });
}

describe("transport (M0-C1)", () => {
  it("builds the URL with encoded path params and query, JSON body and Accept", async () => {
    const f = fakeFetch().on("POST /v1/teams/a%20b/agents", { status: 201, body: { id: "agt_1" } });
    const afs = client(f);
    await afs.agents.create("a b", { name: "x" } as never, { requestId: "req-1" });
    const r = f.requests[0];
    expect(r?.url).toBe("https://afs.test/v1/teams/a%20b/agents");
    expect(r?.headers.get("Accept")).toBe("application/json");
    expect(r?.headers.get("Content-Type")).toBe("application/json");
    expect(r?.headers.get("X-Request-Id")).toBe("req-1");
    expect(r?.body).toEqual({ name: "x" });
  });

  it("sends query parameters from options", async () => {
    const f = fakeFetch().on("GET /v1/teams", { body: { items: [] } });
    await client(f).teams.list({ state: "active", maxResults: 5 }).first();
    expect(f.requests[0]?.query.get("state")).toBe("active");
    expect(f.requests[0]?.query.get("maxResults")).toBe("5");
  });

  it("rejects a request id longer than 64 characters before sending", async () => {
    const f = fakeFetch().on("GET /v1/teams/t", { body: team });
    await expect(client(f).teams.get("t", { requestId: "x".repeat(65) })).rejects.toThrow(
      TypeError,
    );
    expect(f.requests).toHaveLength(0);
  });

  it("attaches non-enumerable meta and keeps unknown fields", async () => {
    const f = fakeFetch().on("GET /v1/teams/t", {
      body: { ...team, brandNew: 1 },
      headers: {
        "X-Request-Id": "req_9",
        ETag: '"3"',
        "X-Afs-Contract-Version": "1.1.0",
        "Idempotent-Replayed": "true",
      },
    });
    const t = await client(f).teams.get("t");
    expect(metaOf(t)).toMatchObject({
      status: 200,
      requestId: "req_9",
      etag: '"3"',
      contractVersion: "1.1.0",
      idempotentReplayed: true,
    });
    expect(Object.keys(t)).not.toContain("meta");
    expect(JSON.stringify(t)).not.toContain("meta");
    expect((t as unknown as { brandNew: number }).brandNew).toBe(1);
  });

  it("returns undefined for 204 and strings for yaml", async () => {
    const f = fakeFetch()
      .on("PUT /v1/teams/t/secrets/s/value", { status: 204 })
      .on("GET /v1/teams/t/kubeconfig", {
        text: "apiVersion: v1\n",
        headers: { "Content-Type": "application/yaml" },
      });
    const afs = client(f);
    await expect(
      afs.secrets.putValue("t", "s", { value: "x" } as never, { ifMatch: false }),
    ).resolves.toBeUndefined();
    await expect(afs.teams.getKubeconfig("t")).resolves.toBe("apiVersion: v1\n");
  });
});

describe("pagination (M0-C7)", () => {
  it("follows nextToken, one request per page, with pages() and first()", async () => {
    const f = fakeFetch().on("GET /v1/teams", (req) =>
      req.query.get("nextToken") === "n2"
        ? { body: { items: [{ id: "c" }] } }
        : req.query.get("nextToken") === "n1"
          ? { body: { items: [{ id: "b" }], nextToken: "n2" } }
          : { body: { items: [{ id: "a" }], nextToken: "n1" } },
    );
    const afs = client(f);
    const ids: string[] = [];
    for await (const t of afs.teams.list()) ids.push(t.id);
    expect(ids).toEqual(["a", "b", "c"]);
    expect(f.requests).toHaveLength(3);
    const pages: number[] = [];
    for await (const p of afs.teams.list().pages()) pages.push(p.items.length);
    expect(pages).toEqual([1, 1, 1]);
    const first = await afs.teams.list({ maxResults: 1 }).first();
    expect(first.nextToken).toBe("n1");
    expect(first.meta.status).toBe(200);
  });
  it("starts at a given nextToken", async () => {
    const f = fakeFetch().on("GET /v1/teams", { body: { items: [] } });
    await client(f).teams.list({ nextToken: "zz" }).first();
    expect(f.requests[0]?.query.get("nextToken")).toBe("zz");
  });
});

describe("csv (M0-C11)", () => {
  it("sends Accept text/csv, follows X-Afs-Next-Token and keeps one header row", async () => {
    const f = fakeFetch().on("GET /v1/teams/t/usage", (req) =>
      req.query.get("nextToken") === "p2"
        ? { text: "agent,calls\r\nb,2\r\n", headers: { "Content-Type": "text/csv" } }
        : {
            text: "agent,calls\r\na,1\r\n",
            headers: { "Content-Type": "text/csv", "X-Afs-Next-Token": "p2" },
          },
    );
    const csv = await client(f).usage.get("t").asCsv();
    expect(csv).toBe("agent,calls\r\na,1\r\nb,2\r\n");
    expect(f.requests.every((r) => r.headers.get("Accept") === "text/csv")).toBe(true);
    expect(f.requests).toHaveLength(2);
  });
  it("a report call is lazy: no request until awaited", async () => {
    const f = fakeFetch().on("GET /v1/teams/t/usage", { body: { groupBy: [], rows: [] } });
    const call = client(f).usage.get("t");
    expect(f.requests).toHaveLength(0);
    await call;
    expect(f.requests).toHaveLength(1);
  });
  it("paginated csv lists expose asCsv", async () => {
    const f = fakeFetch().on("GET /v1/teams/t/costs", {
      text: "a\r\n1\r\n",
      headers: { "Content-Type": "text/csv" },
    });
    await expect(client(f).usage.listCosts("t").asCsv()).resolves.toBe("a\r\n1\r\n");
  });
});

describe("contract version (M0-C8)", () => {
  it("calls onContractMismatch once when the server is newer", async () => {
    const seen: unknown[] = [];
    const f = fakeFetch().on("GET /v1/teams/t", {
      body: team,
      headers: { "X-Afs-Contract-Version": "9.0.0" },
    });
    const afs = client(f, { onContractMismatch: (m: unknown) => seen.push(m) });
    await afs.teams.get("t");
    await afs.teams.get("t");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ server: "9.0.0" });
  });
  it("does not call it for an equal or older version", async () => {
    const seen: unknown[] = [];
    const f = fakeFetch().on("GET /v1/teams/t", {
      body: team,
      headers: { "X-Afs-Contract-Version": "1.0.9" },
    });
    await client(f, { onContractMismatch: (m: unknown) => seen.push(m) }).teams.get("t");
    expect(seen).toEqual([]);
  });
});
