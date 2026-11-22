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
  describe("non-JSON bodies map by status (FR-009)", () => {
    const MAPPED = [
      [400, "ValidationError"],
      [401, "Unauthenticated"],
      [403, "AccessDenied"],
      [404, "NotFound"],
      [409, "Conflict"],
      [412, "PreconditionFailed"],
      [428, "PreconditionRequired"],
      [429, "Throttled"],
      [500, "InternalError"],
      [503, "Unavailable"],
      [418, "InternalError"],
    ] as const;
    for (const [status, code] of MAPPED) {
      it(`${status} with an HTML body is ${code}`, async () => {
        const e = await fail(status, {
          text: "<html>gateway</html>",
          headers: { "X-Request-Id": "req_n" },
        });
        expect(e.code).toBe(code);
        expect(e.status).toBe(status);
        expect(e.requestId).toBe("req_n");
      });
    }
    it("isConflict is true for a non-JSON 409", async () => {
      const e = await fail(409, { text: "conflict from proxy" });
      expect(e.isConflict).toBe(true);
      expect(e.isInternalError).toBe(false);
    });
  });
});

describe("collaboration errors (SDK-15)", () => {
  it("isSecretDetected is true only for SecretDetected", async () => {
    const e = await fail(422, {
      body: {
        code: "SecretDetected",
        message: "m",
        requestId: "r",
        details: { patterns: ["aws_access_key"] },
      },
    });
    expect(e.isSecretDetected).toBe(true);
    for (const [, g] of GETTERS) expect(e[g]).toBe(false);
    const other = await fail(400, {
      body: { code: "ValidationError", message: "m", requestId: "r" },
    });
    expect(other.isSecretDetected).toBe(false);
  });
  it("collaboration reasons stay in details and an unknown reason passes through", async () => {
    for (const reason of [
      "collaboration_agent_exists",
      "managed_secret",
      "hostname_held",
      "team_suspended",
      "future_reason",
    ]) {
      const e = await fail(409, {
        body: { code: "Conflict", message: "m", requestId: "r", details: { reason } },
      });
      expect(e.isConflict).toBe(true);
      expect(e.details.reason).toBe(reason);
    }
    const v = await fail(400, {
      body: {
        code: "ValidationError",
        message: "m",
        requestId: "r",
        details: {
          reason: "master_key_not_rotatable",
          fields: [{ field: "names", reason: "master_key_not_rotatable" }],
        },
      },
    });
    expect(v.isValidationError).toBe(true);
    expect((v.details.fields as { reason: string }[])[0]?.reason).toBe("master_key_not_rotatable");
  });
  it("a 404 collaboration_agent_missing is NotFound", async () => {
    const e = await fail(404, {
      body: {
        code: "NotFound",
        message: "m",
        requestId: "r",
        details: { reason: "collaboration_agent_missing" },
      },
    });
    expect(e.isNotFound).toBe(true);
  });
});
