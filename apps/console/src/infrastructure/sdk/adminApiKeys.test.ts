import { describe, expect, it } from "vitest";
import { SdkAdminApiKeys } from "./adminApiKeys.js";
import { SdkAdminSecurityOperators } from "./adminSecurityOperators.js";
import { fakeApi, json, on } from "./testing.js";

const key = {
  id: "key_1",
  name: "pipe",
  role: "security_operator",
  keyPrefix: "afsk_1",
  expiresAt: "2026-12-01T00:00:00Z",
  createdAt: "2026-11-22T00:00:00Z",
};

describe("SdkAdminApiKeys (M6-K1)", () => {
  it("lists, creates (secret handed back once, role forced) and deletes", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/admin/api-keys", () => json({ items: [key] })),
      on("POST", "/v1/admin/api-keys", () => json({ ...key, secretKey: "afsk_S" }, 201)),
      on("DELETE", "/v1/admin/api-keys/key_1", () => json({}, 204)),
    );
    const port = new SdkAdminApiKeys(client);
    expect(await port.list()).toHaveLength(1);
    const r = await port.create({
      name: "pipe",
      role: "security_operator",
      expiresAt: key.expiresAt,
    });
    expect(r.secretKey).toBe("afsk_S");
    expect(r.replayed).toBe(false);
    expect(JSON.stringify(r.key)).not.toContain("afsk_S");
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      role: "security_operator",
    });
    await port.delete("key_1");
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });
  it("maps a refusal to an AppError", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/admin/api-keys", () =>
        json({ code: "AccessDenied", message: "no", requestId: "r1" }, 403),
      ),
    );
    await expect(new SdkAdminApiKeys(client).list()).rejects.toMatchObject({
      isAccessDenied: true,
    });
  });
});

describe("SdkAdminSecurityOperators (M6-K2)", () => {
  const op = { id: "rb_1", subjectType: "user", email: "a@b.co", version: 1 };
  it("lists, adds a person and a group, and removes", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/admin/security-operators", () => json({ items: [op] })),
      on("POST", "/v1/admin/security-operators", () => json(op, 201)),
      on("DELETE", "/v1/admin/security-operators/rb_1", () => json({}, 204)),
    );
    const port = new SdkAdminSecurityOperators(client);
    expect((await port.list())[0]).toMatchObject({ id: "rb_1", email: "a@b.co" });
    await port.add({ subjectType: "user", email: "a@b.co" });
    await port.add({ subjectType: "group", groupName: "secops", identityProviderId: "idp_1" });
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts[0]?.body).toEqual({ subjectType: "user", email: "a@b.co" });
    expect(posts[1]?.body).toEqual({
      subjectType: "group",
      groupName: "secops",
      identityProviderId: "idp_1",
    });
    await port.remove("rb_1");
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });
  it("maps a refusal to an AppError", async () => {
    const { client } = fakeApi(
      on("POST", "/v1/admin/security-operators", () =>
        json({ code: "AccessDenied", message: "no", requestId: "r1" }, 403),
      ),
    );
    await expect(
      new SdkAdminSecurityOperators(client).add({ subjectType: "user", email: "a@b.co" }),
    ).rejects.toMatchObject({ isAccessDenied: true });
  });
});
