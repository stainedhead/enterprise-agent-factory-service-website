// @vitest-environment node
import { describe, expect, it } from "vitest";
import { TEAMS, team } from "./fixtures/core.js";
import type { Fixture } from "./fixtures/index.js";
import { FakeAfs } from "./server.js";

const IDP = "http://127.0.0.1:4401";
const bearer = (user: string) => ({ authorization: `Bearer at.${user}.1` });
const call = (
  api: FakeAfs,
  method: string,
  path: string,
  init: { headers?: Record<string, string>; body?: unknown } = {},
) =>
  api.handle(
    new Request(`http://api.test${path}`, {
      method,
      headers: { origin: "http://console.test", ...init.headers },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    }),
  );

const createTeam: Fixture = {
  method: "POST",
  path: "/v1/teams",
  response: { status: 201, body: team(TEAMS[0]) },
};
const patchTeam: Fixture = {
  method: "PATCH",
  path: "/v1/teams/{teamId}",
  response: { status: 200, body: team(TEAMS[0]) },
};
const getTeam: Fixture = {
  method: "GET",
  path: "/v1/teams/{teamId}",
  response: { status: 200, body: team(TEAMS[0]) },
};

describe("FakeAfs", () => {
  it("answers GetMe per seeded user from the bearer token, with the contract headers and CORS", async () => {
    const api = new FakeAfs({ idpIssuer: IDP });
    const r = await call(api, "GET", "/v1/me", {
      headers: { ...bearer("team-admin"), "x-request-id": "req_abc" },
    });
    const body = (await r.json()) as { teams: { role: string }[]; serviceAdmin: boolean };
    expect(r.status).toBe(200);
    expect(body.serviceAdmin).toBe(false);
    expect(body.teams[0]?.role).toBe("team_admin");
    expect(r.headers.get("x-request-id")).toBe("req_abc");
    expect(r.headers.get("x-afs-contract-version")).toBe(api.contract.version);
    expect(r.headers.get("access-control-allow-origin")).toBe("http://console.test");
    expect(r.headers.get("access-control-expose-headers")).toContain("X-Afs-Next-Token");
    for (const [user, check] of [
      ["svc-admin", (b: Record<string, unknown>) => b.serviceAdmin === true],
      ["sec-op", (b: Record<string, unknown>) => b.securityOperator === true],
      [
        "viewer",
        (b: Record<string, unknown>) => (b.teams as { role: string }[])[0]?.role === "team_viewer",
      ],
    ] as const) {
      expect(
        check(
          (await (await call(api, "GET", "/v1/me", { headers: bearer(user) })).json()) as Record<
            string,
            unknown
          >,
        ),
        user,
      ).toBe(true);
    }
  });
  it("rejects a missing or unknown token with 401, except for public operations", async () => {
    const api = new FakeAfs({ idpIssuer: IDP });
    expect((await call(api, "GET", "/v1/me")).status).toBe(401);
    expect(
      (await call(api, "GET", "/v1/me", { headers: { authorization: "Bearer nope" } })).status,
    ).toBe(401);
    const providers = await call(api, "GET", "/v1/identity-providers");
    expect(providers.status).toBe(200);
    expect(
      ((await providers.json()) as { items: { issuerUrl: string }[] }).items[0]?.issuerUrl,
    ).toBe(IDP);
    expect((await call(api, "GET", "/healthz")).status).toBe(200);
  });
  it("lists every team for a service admin and only their own for others", async () => {
    const api = new FakeAfs({ idpIssuer: IDP });
    const n = async (u: string) =>
      (
        (await (await call(api, "GET", "/v1/teams", { headers: bearer(u) })).json()) as {
          items: unknown[];
        }
      ).items.length;
    expect(await n("svc-admin")).toBe(2);
    expect(await n("viewer")).toBe(1);
  });
  it("answers CORS preflight and unknown routes", async () => {
    const api = new FakeAfs({ idpIssuer: IDP });
    const pre = await call(api, "OPTIONS", "/v1/teams");
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-headers")).toContain("If-Match");
    expect((await call(api, "GET", "/v1/nope", { headers: bearer("viewer") })).status).toBe(404);
    expect(
      (await call(api, "GET", "/v1/teams/team_1/pools", { headers: bearer("viewer") })).status,
    ).toBe(501);
  });
  it("rejects a fixture that violates the pinned OpenAPI when the server is built", () => {
    const bad: Fixture = {
      method: "GET",
      path: "/v1/me",
      response: { status: 200, body: { principal: { id: 1 } } },
    };
    expect(() => new FakeAfs({ idpIssuer: IDP, fixtures: [[bad]] })).toThrow(
      /violate the contract/,
    );
    expect(
      () =>
        new FakeAfs({
          idpIssuer: IDP,
          fixtures: [[{ method: "GET", path: "/v1/not-a-route", response: { status: 200 } }]],
        }),
    ).toThrow(/not in the pinned OpenAPI/);
  });
  it("turns a function fixture that breaks the contract into a 500 naming the problem", async () => {
    const bad: Fixture = {
      method: "GET",
      path: "/v1/me",
      response: () => ({ status: 200, body: { nope: true } }),
    };
    const r = await call(new FakeAfs({ idpIssuer: IDP, fixtures: [[bad]] }), "GET", "/v1/me", {
      headers: bearer("viewer"),
    });
    expect(r.status).toBe(500);
    expect(((await r.json()) as { message: string }).message).toContain(
      "Fixture violates the contract",
    );
  });
  it("enforces If-Match: 428 when missing, 412 when stale, and passes the current version", async () => {
    const api = new FakeAfs({ idpIssuer: IDP, fixtures: [[getTeam, patchTeam]] });
    const h = bearer("svc-admin");
    const id = TEAMS[0].id;
    expect((await call(api, "PATCH", `/v1/teams/${id}`, { headers: h, body: {} })).status).toBe(
      428,
    );
    const get = await call(api, "GET", `/v1/teams/${id}`, { headers: h });
    expect(get.headers.get("etag")).toBe('"1"');
    expect(
      (
        await call(api, "PATCH", `/v1/teams/${id}`, {
          headers: { ...h, "if-match": '"7"' },
          body: {},
        })
      ).status,
    ).toBe(412);
    expect(
      (
        await call(api, "PATCH", `/v1/teams/${id}`, {
          headers: { ...h, "if-match": '"1"' },
          body: {},
        })
      ).status,
    ).toBe(200);
  });
  it("replays an idempotent create and conflicts when the key is reused with another body", async () => {
    const api = new FakeAfs({ idpIssuer: IDP, fixtures: [[createTeam]] });
    const h = { ...bearer("svc-admin"), "idempotency-key": "k1" };
    expect((await call(api, "POST", "/v1/teams", { headers: h, body: { a: 1 } })).status).toBe(201);
    const replay = await call(api, "POST", "/v1/teams", { headers: h, body: { a: 1 } });
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    expect((await call(api, "POST", "/v1/teams", { headers: h, body: { a: 2 } })).status).toBe(409);
    const raw = new Request("http://api.test/v1/teams", {
      method: "POST",
      headers: bearer("svc-admin"),
      body: "not json",
    });
    expect((await api.handle(raw)).status).toBe(400);
  });
  it("injects 429 and 503 a set number of times, with Retry-After", async () => {
    const api = new FakeAfs({ idpIssuer: IDP });
    api.inject({ match: "GET /v1/teams", status: 429, times: 1, retryAfterSeconds: 2 });
    api.inject({ match: "GET /v1/me", status: 503, times: 1 });
    const h = bearer("svc-admin");
    const a = await call(api, "GET", "/v1/teams", { headers: h });
    expect([a.status, a.headers.get("retry-after")]).toEqual([429, "2"]);
    expect((await call(api, "GET", "/v1/teams", { headers: h })).status).toBe(200);
    expect((await call(api, "GET", "/v1/me", { headers: h })).status).toBe(503);
    api.inject({ match: "GET /v1/me", status: 503, times: 5 });
    api.clearInjections();
    expect((await call(api, "GET", "/v1/me", { headers: h })).status).toBe(200);
  });
  it("records requests and resets, and can report a newer contract version", async () => {
    const api = new FakeAfs({ idpIssuer: IDP });
    api.contractVersion = "9.9.9";
    const r = await call(api, "GET", "/v1/teams", { headers: bearer("viewer") });
    expect(r.headers.get("x-afs-contract-version")).toBe("9.9.9");
    expect(api.recorded).toEqual([
      expect.objectContaining({
        method: "GET",
        path: "/v1/teams",
        operationId: "ListTeams",
        principal: "viewer",
        status: 200,
        mutating: false,
      }),
    ]);
    api.reset();
    expect(api.recorded).toEqual([]);
    expect(api.contractVersion).toBe(api.contract.version);
  });
});
