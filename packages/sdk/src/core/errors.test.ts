import { describe, expect, it } from "vitest";
import { createAfs } from "../generated/index.js";
import { fakeFetch } from "../testing/fakeFetch.js";
import { apiKey } from "./auth.js";
import { AfsError } from "./errors.js";

const GETTERS = [
  ["ValidationError", "isValidationError", 400],
  ["Unauthenticated", "isUnauthenticated", 401],
  ["AccessDenied", "isAccessDenied", 403],
  ["NotFound", "isNotFound", 404],
  ["Conflict", "isConflict", 409],
  ["PreconditionFailed", "isPreconditionFailed", 412],
  ["PreconditionRequired", "isPreconditionRequired", 428],
  ["Throttled", "isThrottled", 429],
  ["InternalError", "isInternalError", 500],
  ["Unavailable", "isUnavailable", 503],
] as const;

async function fail(status: number, reply: object): Promise<AfsError> {
  const f = fakeFetch().on("GET /v1/teams/t", { status, ...reply });
  const afs = createAfs({
    endpoint: "https://x",
    fetch: f.fetch,
    auth: apiKey("afsk_k"),
    retry: { maxRetries: 0 },
  });
  return afs.teams.get("t").then(
    () => {
      throw new Error("expected failure");
    },
    (e) => e as AfsError,
  );
}

describe("AfsError (M0-C2)", () => {
  for (const [code, getter, status] of GETTERS) {
    it(`${code} sets ${getter} and no other getter`, async () => {
      const e = await fail(status, {
        body: { code, message: "m", requestId: "req_1", details: { a: 1 } },
      });
      expect(e).toBeInstanceOf(AfsError);
      expect(e.code).toBe(code);
      expect(e.requestId).toBe("req_1");
      expect(e.details).toEqual({ a: 1 });
      for (const [, g] of GETTERS) expect(e[g]).toBe(g === getter);
    });
  }
  it("keeps an unknown code", async () => {
    const e = await fail(418, {
      body: { code: "NewCode", message: "m", requestId: "r", details: {} },
    });
    expect(e.code).toBe("NewCode");
    for (const [, g] of GETTERS) expect(e[g]).toBe(false);
  });
  it("turns an HTML 502 into InternalError with a short message", async () => {
    const e = await fail(502, {
      text: `<html><body>${"Bad gateway ".repeat(100)}</body></html>`,
      headers: { "X-Request-Id": "req_h" },
    });
    expect(e.code).toBe("InternalError");
    expect(e.message.length).toBeLessThanOrEqual(200);
    expect(e.message).not.toContain("<");
    expect(e.requestId).toBe("req_h");
  });
  it("toJSON has the documented fields", async () => {
    const e = await fail(403, {
      body: {
        code: "AccessDenied",
        message: "no",
        requestId: "r",
        details: { requiredPermission: "teams:write" },
      },
    });
    expect(e.toJSON()).toMatchObject({
      status: 403,
      code: "AccessDenied",
      requestId: "r",
      details: { requiredPermission: "teams:write" },
    });
  });
});
