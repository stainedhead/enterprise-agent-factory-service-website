import { describe, expect, it } from "vitest";
import type { AppError } from "../../application/errors.js";
import { SdkIdentityProviders, SdkSettings } from "./settings.js";
import { fakeApi, json, on } from "./testing.js";

const setting = {
  key: "audit.retention_days",
  value: 365,
  default: 365,
  type: "integer",
  allowed: "30 to 3650",
  min: 30,
  max: 3650,
  version: 4,
};
const idp = {
  id: "idp_1",
  kind: "okta",
  name: "Corporate SSO",
  issuerUrl: "https://corp.okta.com",
  consoleClientId: "console",
  cliClientId: "cli",
  groupsClaim: "groups",
  isDefault: true,
  enabled: true,
  version: 2,
  clientSecretArn: null,
};

describe("SdkSettings (M1-N2)", () => {
  it("lists every setting", async () => {
    const { client } = fakeApi(on("GET", "/v1/admin/settings", () => json({ items: [setting] })));
    const r = await new SdkSettings(client).list();
    expect(r[0]).toMatchObject({ key: "audit.retention_days", min: 30, max: 3650, version: 4 });
  });

  it("puts a value with If-Match from the held version", async () => {
    const { client, calls } = fakeApi(
      on("PUT", "/v1/admin/settings/audit.retention_days", () =>
        json({ ...setting, value: 90, version: 5 }),
      ),
    );
    const r = await new SdkSettings(client).put({ key: "audit.retention_days", version: 4 }, 90);
    expect(r.value).toBe(90);
    expect(calls[0]?.headers.get("if-match")).toBe('"4"');
    expect(calls[0]?.body).toEqual({ value: 90 });
  });

  it("maps a stale version to the stale kind", async () => {
    const { client } = fakeApi(
      on("PUT", "/v1/admin/settings/audit.retention_days", () =>
        json({ code: "PreconditionFailed", message: "changed", requestId: "r1" }, 412),
      ),
    );
    const err = await new SdkSettings(client)
      .put({ key: "audit.retention_days", version: 1 }, 90)
      .catch((e) => e);
    expect((err as AppError).kind).toBe("stale");
  });
});

describe("SdkIdentityProviders (M1-N3)", () => {
  it("lists, reads with teams, creates, updates, deletes", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/admin/identity-providers", () => json({ items: [idp] })),
      on("GET", "/v1/admin/identity-providers/idp_1", () =>
        json({ ...idp, teams: [{ id: "team_1", slug: "alpha", displayName: "Alpha" }] }),
      ),
      on("POST", "/v1/admin/identity-providers", () => json(idp, 201)),
      on("PATCH", "/v1/admin/identity-providers/idp_1", () =>
        json({ ...idp, enabled: false, version: 3 }),
      ),
      on("DELETE", "/v1/admin/identity-providers/idp_1", () => new Response(null, { status: 204 })),
    );
    const sdk = new SdkIdentityProviders(client);
    expect(await sdk.list()).toHaveLength(1);
    expect((await sdk.get("idp_1")).teams?.[0]?.slug).toBe("alpha");
    await sdk.create({
      kind: "okta",
      name: "x",
      issuerUrl: "https://x.okta.com",
      consoleClientId: "c",
      cliClientId: "d",
    });
    await sdk.update({ id: "idp_1", version: 2 }, { enabled: false });
    await sdk.delete({ id: "idp_1", version: 2 });
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.headers.get("if-match")).toBe('"2"');
    expect(patch?.body).toEqual({ enabled: false });
  });

  it("maps the 409 of an in-use provider to a conflict", async () => {
    const { client } = fakeApi(
      on("DELETE", "/v1/admin/identity-providers/idp_1", () =>
        json({ code: "Conflict", message: "in use by 2 teams", requestId: "r2" }, 409),
      ),
    );
    const err = await new SdkIdentityProviders(client)
      .delete({ id: "idp_1", version: 2 })
      .catch((e) => e);
    expect((err as AppError).kind).toBe("conflict");
    expect((err as AppError).message).toContain("in use");
  });
});
