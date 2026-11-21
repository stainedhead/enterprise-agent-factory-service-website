import { describe, expect, it } from "vitest";
import { createAfs } from "../generated/index.js";
import { fakeFetch } from "../testing/fakeFetch.js";
import { apiKey, bearer } from "./auth.js";
import { AfsError, AfsNetworkError } from "./errors.js";
import { metaOf } from "./types.js";

const team = { id: "t", version: 1 };
const err = (status: number, code: string, headers: Record<string, string> = {}, details = {}) => ({
  status,
  body: { code, message: code, requestId: "req_e", details },
  headers,
});

describe("auth (M0-C3)", () => {
  it("uses the latest token for each request", async () => {
    let n = 0;
    const f = fakeFetch().on("GET /v1/teams/t", { body: team });
    const afs = createAfs({
      endpoint: "https://x",
      fetch: f.fetch,
      auth: bearer(() => `tok${++n}`),
    });
    await afs.teams.get("t");
    await afs.teams.get("t");
    expect(f.requests.map((r) => r.headers.get("Authorization"))).toEqual([
      "Bearer tok1",
      "Bearer tok2",
    ]);
  });
  it("on 401 refreshes once and retries once", async () => {
    const calls: boolean[] = [];
    const f = fakeFetch().on("GET /v1/teams/t", [err(401, "Unauthenticated"), { body: team }]);
    const afs = createAfs({
      endpoint: "https://x",
      fetch: f.fetch,
      auth: bearer(({ forceRefresh }) => {
        calls.push(forceRefresh);
        return forceRefresh ? "fresh" : "stale";
      }),
    });
    await afs.teams.get("t");
    expect(calls).toEqual([false, true]);
    expect(f.requests[1]?.headers.get("Authorization")).toBe("Bearer fresh");
  });
  it("a second 401 throws isUnauthenticated and never a third attempt", async () => {
    const f = fakeFetch().on("GET /v1/teams/t", err(401, "Unauthenticated"));
    const afs = createAfs({ endpoint: "https://x", fetch: f.fetch, auth: bearer(() => "t") });
    await expect(afs.teams.get("t")).rejects.toMatchObject({ isUnauthenticated: true });
    expect(f.requests).toHaveLength(2);
  });
  it("an API key never calls a supplier and is not retried on 401", async () => {
    const f = fakeFetch().on("GET /v1/teams/t", err(401, "Unauthenticated"));
    const afs = createAfs({ endpoint: "https://x", fetch: f.fetch, auth: apiKey("afsk_abc") });
    await expect(afs.teams.get("t")).rejects.toBeInstanceOf(AfsError);
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]?.headers.get("Authorization")).toBe("Bearer afsk_abc");
  });
  it("rejects a malformed API key without echoing it", () => {
    expect(() => apiKey("secret-value")).toThrow("afsk_");
    try {
      apiKey("secret-value");
    } catch (e) {
      expect(String(e)).not.toContain("secret-value");
    }
  });
});

describe("retry (M0-C4)", () => {
  const make = (f: ReturnType<typeof fakeFetch>, sleeps: number[] = [], extra = {}) =>
    createAfs({
      endpoint: "https://x",
      fetch: f.fetch,
      auth: apiKey("afsk_k"),
      retry: { random: () => 0.5, sleep: async (ms) => void sleeps.push(ms) },
      ...extra,
    });

  it("full jitter: delay = random * min(cap, base * 2^n)", async () => {
    const sleeps: number[] = [];
    const f = fakeFetch().on("GET /v1/teams/t", [
      err(503, "Unavailable"),
      err(503, "Unavailable"),
      err(503, "Unavailable"),
      { body: team },
    ]);
    await make(f, sleeps).teams.get("t");
    expect(sleeps).toEqual([100, 200, 400]);
  });
  it("503 retries 3 times then throws isUnavailable with the last request id", async () => {
    const f = fakeFetch().on("GET /v1/teams/t", err(503, "Unavailable"));
    await expect(make(f).teams.get("t")).rejects.toMatchObject({
      isUnavailable: true,
      requestId: "req_e",
    });
    expect(f.requests).toHaveLength(4);
  });
  it("429 honours Retry-After", async () => {
    const sleeps: number[] = [];
    const f = fakeFetch().on("GET /v1/teams/t", [
      err(429, "Throttled", { "Retry-After": "2" }),
      { body: team },
    ]);
    await make(f, sleeps).teams.get("t");
    expect(sleeps).toEqual([2000]);
  });
  it("429 with Retry-After above 30 s throws at once", async () => {
    const f = fakeFetch().on("GET /v1/teams/t", err(429, "Throttled", { "Retry-After": "31" }));
    await expect(make(f).teams.get("t")).rejects.toMatchObject({ isThrottled: true });
    expect(f.requests).toHaveLength(1);
  });
  it.each([
    [400, "ValidationError"],
    [403, "AccessDenied"],
    [404, "NotFound"],
    [412, "PreconditionFailed"],
    [428, "PreconditionRequired"],
  ])("never retries %i", async (status, code) => {
    const f = fakeFetch().on("GET /v1/teams/t", err(status, code));
    await expect(make(f).teams.get("t")).rejects.toBeInstanceOf(AfsError);
    expect(f.requests).toHaveLength(1);
  });
  it("retries a network error for GET and POST with a key, not for PATCH", async () => {
    const boom = new TypeError("fetch failed");
    const g = fakeFetch().on("GET /v1/teams/t", [boom, { body: team }]);
    await make(g).teams.get("t");
    expect(g.requests).toHaveLength(2);
    const p = fakeFetch().on("POST /v1/teams", [boom, { status: 201, body: team }]);
    await make(p).teams.create({} as never);
    expect(p.requests).toHaveLength(2);
    const u = fakeFetch().on("PATCH /v1/teams/t", boom);
    await expect(make(u).teams.update({ id: "t", version: 1 }, {})).rejects.toBeInstanceOf(
      AfsNetworkError,
    );
    expect(u.requests).toHaveLength(1);
  });
  it("a network error after retries throws status 0", async () => {
    const f = fakeFetch().on("GET /v1/teams/t", new TypeError("down"));
    await expect(make(f).teams.get("t")).rejects.toMatchObject({ status: 0, code: "NetworkError" });
    expect(f.requests).toHaveLength(4);
  });
  it("abort during backoff rejects quickly and sends nothing more", async () => {
    const ctl = new AbortController();
    const f = fakeFetch().on("GET /v1/teams/t", err(503, "Unavailable"));
    const afs = createAfs({
      endpoint: "https://x",
      fetch: f.fetch,
      auth: apiKey("afsk_k"),
      retry: { baseMs: 10_000, capMs: 10_000, random: () => 0.99 },
    });
    const p = afs.teams.get("t", { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 20);
    const t0 = Date.now();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - t0).toBeLessThan(200);
    expect(f.requests).toHaveLength(1);
  });
});

describe("idempotency (M0-C5)", () => {
  it("sends the same Idempotency-Key on every attempt of a create", async () => {
    const f = fakeFetch().on("POST /v1/teams", [
      err(503, "Unavailable"),
      { status: 201, body: team },
    ]);
    const afs = createAfs({
      endpoint: "https://x",
      fetch: f.fetch,
      auth: apiKey("afsk_k"),
      retry: { sleep: async () => {} },
    });
    await afs.teams.create({} as never);
    const keys = f.requests.map((r) => r.headers.get("Idempotency-Key"));
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
  });
  it("honours an idempotencyKey option and :verb operations carry a key", async () => {
    const f = fakeFetch().on("POST /v1/teams/t:suspend", { body: team });
    const afs = createAfs({ endpoint: "https://x", fetch: f.fetch, auth: apiKey("afsk_k") });
    await afs.teams.suspend("t", { idempotencyKey: "my-key" });
    expect(f.requests[0]?.headers.get("Idempotency-Key")).toBe("my-key");
  });
  it("idempotency_in_progress waits Retry-After and retries with the same key", async () => {
    const sleeps: number[] = [];
    const f = fakeFetch().on("POST /v1/teams", [
      err(409, "Conflict", { "Retry-After": "1" }, { reason: "idempotency_in_progress" }),
      { status: 201, body: team },
    ]);
    const afs = createAfs({
      endpoint: "https://x",
      fetch: f.fetch,
      auth: apiKey("afsk_k"),
      retry: { sleep: async (ms) => void sleeps.push(ms) },
    });
    await afs.teams.create({} as never);
    expect(sleeps).toEqual([1000]);
    expect(f.requests[0]?.headers.get("Idempotency-Key")).toBe(
      f.requests[1]?.headers.get("Idempotency-Key"),
    );
  });
  it("any other 409 throws isConflict at once", async () => {
    const f = fakeFetch().on(
      "POST /v1/teams",
      err(409, "Conflict", {}, { reason: "team_suspended" }),
    );
    const afs = createAfs({ endpoint: "https://x", fetch: f.fetch, auth: apiKey("afsk_k") });
    await expect(afs.teams.create({} as never)).rejects.toMatchObject({ isConflict: true });
    expect(f.requests).toHaveLength(1);
  });
  it("exposes Idempotent-Replayed as meta", async () => {
    const f = fakeFetch().on("POST /v1/teams", {
      status: 200,
      body: team,
      headers: { "Idempotent-Replayed": "true" },
    });
    const t = await createAfs({ endpoint: "https://x", fetch: f.fetch }).teams.create({} as never);
    expect(metaOf(t)?.idempotentReplayed).toBe(true);
  });
});
