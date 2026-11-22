// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Faults, isFault } from "./faults.js";
import { FakeAfs } from "./server.js";

const IDP = "http://127.0.0.1:4401";
const h = { authorization: "Bearer at.svc-admin.1", origin: "http://console.test" };
const get = (api: FakeAfs, path: string) =>
  api.handle(new Request(`http://api.test${path}`, { headers: h }));

describe("Faults", () => {
  it("fails the next N calls of one operation, then passes through", () => {
    const f = new Faults();
    f.failNext("ListAgents", 401, 2);
    expect(f.take("ListTeams")).toBeUndefined();
    expect(f.take("ListAgents")?.status).toBe(401);
    expect(f.take("ListAgents")?.code).toBe("Unauthenticated");
    expect(f.take("ListAgents")).toBeUndefined();
  });
  it("carries the required permission of a 403", () => {
    const f = new Faults();
    f.failNext("CreateSecret", 403, 1, { requiredPermission: "secrets:write" });
    expect(f.take("CreateSecret")).toMatchObject({
      status: 403,
      code: "AccessDenied",
      details: { requiredPermission: "secrets:write" },
    });
  });
  it("clear drops armed faults", () => {
    const f = new Faults();
    f.failNext("ListTeams", 503);
    f.clear();
    expect(f.take("ListTeams")).toBeUndefined();
  });
  it("tells a fault payload from a request injection", () => {
    expect(isFault({ operationId: "X", status: 401, times: 1 })).toBe(true);
    expect(isFault({ match: "GET /v1/me", status: 503, times: 1 })).toBe(false);
  });
});

describe("FakeAfs fault hook", () => {
  it("answers an armed operation with the fault, records it, and reset disarms it", async () => {
    const api = new FakeAfs({ idpIssuer: IDP });
    api.inject({
      operationId: "ListTeams",
      status: 403,
      times: 1,
      requiredPermission: "teams:read",
    });
    const denied = await get(api, "/v1/teams");
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({
      code: "AccessDenied",
      details: { requiredPermission: "teams:read" },
    });
    expect(api.recorded.at(-1)).toMatchObject({ operationId: "ListTeams", status: 403 });
    expect((await get(api, "/v1/teams")).status).toBe(200);
    api.faults.failNext("ListTeams", 401, 3);
    api.reset();
    expect((await get(api, "/v1/teams")).status).toBe(200);
  });
});
