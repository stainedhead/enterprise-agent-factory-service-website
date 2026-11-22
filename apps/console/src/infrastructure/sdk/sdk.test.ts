import { AfsClient, AfsError } from "@afs/sdk";
import { describe, expect, it } from "vitest";
import { AppError } from "../../application/errors.js";
import { AuthError } from "../../application/ports/auth.js";
import { toAppError } from "./errors.js";
import { SdkMe, SdkSearch } from "./SdkMe.js";
import { SdkProviders } from "./SdkProviders.js";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const clientFor = (handler: (url: URL) => Response) =>
  new AfsClient({
    endpoint: "http://api.test",
    retry: { maxRetries: 0 },
    fetch: (async (i: RequestInfo | URL) =>
      handler(new URL(String(i instanceof Request ? i.url : i)))) as typeof fetch,
  });

describe("toAppError", () => {
  it("keeps request id, required permission, reason and field errors", () => {
    const e = toAppError(
      new AfsError({
        status: 403,
        code: "AccessDenied",
        message: "no",
        requestId: "req_1",
        details: { requiredPermission: "teams:write", reason: "role" },
      }),
    );
    expect(e).toMatchObject({
      kind: "access-denied",
      requestId: "req_1",
      requiredPermission: "teams:write",
      reason: "role",
      isAccessDenied: true,
    });
    const v = toAppError(
      new AfsError({
        status: 400,
        code: "ValidationError",
        message: "bad",
        details: { fields: [{ field: "name", message: "required" }] },
      }),
    );
    expect(v.fields).toEqual({ name: "required" });
    expect(
      toAppError(
        new AfsError({
          status: 400,
          code: "ValidationError",
          message: "bad",
          details: { fields: { a: "x", b: 4 } },
        }),
      ).fields,
    ).toEqual({ a: "x" });
  });
  it.each([
    ["Unauthenticated", "unauthenticated"],
    ["NotFound", "not-found"],
    ["Conflict", "conflict"],
    ["PreconditionFailed", "stale"],
    ["Throttled", "throttled"],
    ["Unavailable", "unavailable"],
    ["NetworkError", "network"],
    ["Brand-new", "unknown"],
  ])("%s -> %s", (code, kind) => {
    expect(toAppError(new AfsError({ status: 500, code, message: "m" })).kind).toBe(kind);
  });
  it("passes AppError through and wraps anything else", () => {
    const a = new AppError({ kind: "network", message: "x" });
    expect(toAppError(a)).toBe(a);
    expect(toAppError(new Error("boom"))).toMatchObject({ kind: "unknown", message: "boom" });
    expect(toAppError("str").message).toBe("Unexpected error");
    expect(toAppError(new AuthError("interaction_required", "expired")).kind).toBe(
      "unauthenticated",
    );
  });
});

describe("SdkMe", () => {
  it("maps GetMe and drops permissions this build does not know", async () => {
    const me = await new SdkMe(
      clientFor(() =>
        json({
          principal: { id: "usr_1", type: "user", email: "a@x.test", name: "A" },
          serviceAdmin: false,
          securityOperator: true,
          servicePermissions: ["audit:read", "future:thing"],
          teams: [
            {
              teamId: "team_1",
              slug: "alpha",
              role: "team_admin",
              permissions: ["teams:read", "future:thing"],
            },
          ],
        }),
      ),
    ).get();
    expect(me.principal).toEqual({ id: "usr_1", type: "user", email: "a@x.test", name: "A" });
    expect(me.servicePermissions).toEqual(["audit:read"]);
    expect(me.teams[0]?.permissions).toEqual(["teams:read"]);
  });
  it("omits optional fields and maps failures to AppError", async () => {
    const me = await new SdkMe(
      clientFor(() =>
        json({
          principal: { id: "u", type: "api_key" },
          serviceAdmin: true,
          securityOperator: false,
          teams: [],
        }),
      ),
    ).get();
    expect(me.servicePermissions).toBeUndefined();
    expect(me.principal).toEqual({ id: "u", type: "api_key" });
    await expect(
      new SdkMe(
        clientFor(() => json({ code: "AccessDenied", message: "no", requestId: "r" }, 403)),
      ).get(new AbortController().signal),
    ).rejects.toMatchObject({ kind: "access-denied" });
  });
});

describe("SdkSearch and SdkProviders", () => {
  it("lists teams for search with one list call", async () => {
    const urls: string[] = [];
    const teams = await new SdkSearch(
      clientFor((u) => {
        urls.push(`${u.pathname}${u.search}`);
        return json({ items: [{ id: "team_1", displayName: "Alpha" }] });
      }),
    ).listTeams(new AbortController().signal);
    expect(teams).toEqual([{ teamId: "team_1", label: "Alpha" }]);
    expect(urls).toEqual(["/v1/teams?maxResults=100"]);
    await expect(
      new SdkSearch(clientFor(() => json({ code: "Unavailable", message: "x" }, 503))).listTeams(),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
  it("lists providers without a token", async () => {
    let auth: string | null = "unset";
    const client = new AfsClient({
      endpoint: "http://api.test",
      fetch: (async (_i: RequestInfo | URL, init?: RequestInit) => {
        auth = new Headers(init?.headers).get("authorization");
        return json({
          items: [
            {
              id: "idp_1",
              kind: "okta",
              name: "Corp",
              issuerUrl: "https://i.test",
              consoleClientId: "c",
              cliClientId: "d",
              isDefault: true,
            },
          ],
        });
      }) as typeof fetch,
    });
    expect(await new SdkProviders(client).list()).toEqual([
      {
        id: "idp_1",
        kind: "okta",
        name: "Corp",
        issuerUrl: "https://i.test",
        consoleClientId: "c",
        isDefault: true,
      },
    ]);
    expect(auth).toBeNull();
  });
});
