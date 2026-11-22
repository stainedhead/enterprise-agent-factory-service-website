import { describe, expect, it } from "vitest";
import { createAfs } from "../generated/index.js";
import { fakeFetch } from "../testing/fakeFetch.js";
import { apiKey, bearer } from "./auth.js";
import type { DebugEvent } from "./types.js";
import { metaOf } from "./types.js";

const SENTINEL = "SENTINEL-SECRET-VALUE-123";
const TOKEN = "tok-abcdef-123456";

describe("secret hygiene (M0-C9)", () => {
  it("debug events redact Authorization and carry no body", async () => {
    const events: DebugEvent[] = [];
    const f = fakeFetch().on("PUT /v1/teams/t/secrets/s/value", { status: 204 });
    const afs = createAfs({
      endpoint: "https://x",
      fetch: f.fetch,
      auth: bearer(() => TOKEN),
      onDebug: (e) => events.push(e),
    });
    await afs.secrets.putValue("t", "s", { value: SENTINEL } as never, { ifMatch: false });
    const dump = JSON.stringify(events);
    expect(events.length).toBeGreaterThan(0);
    expect(dump).not.toContain(SENTINEL);
    expect(dump).not.toContain(TOKEN);
    expect(events[0]?.headers.Authorization).toBe("[redacted]");
  });
  it("an error never contains the token or a request body secret, even if the server echoes them", async () => {
    const f = fakeFetch().on("POST /v1/teams/t/secrets", {
      status: 400,
      body: {
        code: "ValidationError",
        message: `bad ${SENTINEL} and ${TOKEN}`,
        requestId: "r",
        details: { echoed: SENTINEL },
      },
    });
    const afs = createAfs({
      endpoint: "https://x",
      fetch: f.fetch,
      auth: bearer(() => TOKEN),
      retry: { maxRetries: 0 },
    });
    const e = await afs.secrets
      .create("t", { name: "n", value: SENTINEL } as never)
      .catch((x) => x);
    const dump = JSON.stringify(e.toJSON()) + e.message + String(e.stack ?? "");
    expect(dump).not.toContain(SENTINEL);
    expect(dump).not.toContain(TOKEN);
    expect(e.message).toContain("[redacted]");
  });
  it("a non-JSON error body is scrubbed too", async () => {
    const f = fakeFetch().on("GET /v1/teams/t", { status: 502, text: `upstream saw ${TOKEN}` });
    const afs = createAfs({
      endpoint: "https://x",
      fetch: f.fetch,
      auth: bearer(() => TOKEN),
      retry: { maxRetries: 0 },
    });
    const e = await afs.teams.get("t").catch((x) => x);
    expect(e.message).not.toContain(TOKEN);
  });
  it("retry diagnostics carry no secret", async () => {
    const events: DebugEvent[] = [];
    const f = fakeFetch().on("PUT /v1/teams/t/secrets/s/value", [
      { status: 503, body: { code: "Unavailable", message: "x", requestId: "r", details: {} } },
      { status: 204 },
    ]);
    const afs = createAfs({
      endpoint: "https://x",
      fetch: f.fetch,
      auth: apiKey("afsk_zzz"),
      onDebug: (e) => events.push(e),
      retry: { sleep: async () => {} },
    });
    await afs.secrets.putValue("t", "s", { value: SENTINEL } as never, { ifMatch: false });
    expect(events.some((e) => e.kind === "retry")).toBe(true);
    expect(JSON.stringify(events)).not.toContain(SENTINEL);
    expect(JSON.stringify(events)).not.toContain("afsk_zzz");
  });
  it("the one-time secretKey is returned to the caller; a replayed create returns none", async () => {
    const f = fakeFetch().on("POST /v1/teams/t/api-keys", [
      { status: 201, body: { id: "k", secretKey: "afsk_new" } },
      { status: 200, body: { id: "k" }, headers: { "Idempotent-Replayed": "true" } },
    ]);
    const afs = createAfs({ endpoint: "https://x", fetch: f.fetch, auth: apiKey("afsk_k") });
    const first = await afs.apiKeys.create("t", {} as never);
    expect((first as { secretKey?: string }).secretKey).toBe("afsk_new");
    const replay = await afs.apiKeys.create("t", {} as never, { idempotencyKey: "same" });
    expect((replay as { secretKey?: string }).secretKey).toBeUndefined();
    expect(metaOf(replay)?.idempotentReplayed).toBe(true);
  });
  it("redacts a 1-character secret value that an error message echoes (FR-010)", async () => {
    const f = fakeFetch().on("POST /v1/teams/t/secrets", {
      status: 400,
      body: {
        code: "ValidationError",
        message: "value Q is too short",
        requestId: "r",
        details: { echoed: "Q" },
      },
    });
    const afs = createAfs({
      endpoint: "https://x",
      fetch: f.fetch,
      auth: apiKey("afsk_k"),
      retry: { maxRetries: 0 },
    });
    const e = await afs.secrets.create("t", { name: "n", value: "Q" } as never).catch((x) => x);
    const dump = JSON.stringify(e.toJSON()) + e.message; // the stack holds file names, not values
    expect(dump).not.toContain("Q");
    expect(e.message).toContain("[redacted]");
  });
  it("sends an empty secret value unchanged (nothing to redact)", async () => {
    const f = fakeFetch().on("POST /v1/teams/t/secrets", {
      status: 400,
      body: { code: "ValidationError", message: "value required", requestId: "r", details: {} },
    });
    const afs = createAfs({
      endpoint: "https://x",
      fetch: f.fetch,
      auth: apiKey("afsk_k"),
      retry: { maxRetries: 0 },
    });
    const e = await afs.secrets.create("t", { name: "n", value: "" } as never).catch((x) => x);
    expect(e.message).toBe("value required");
  });
});
