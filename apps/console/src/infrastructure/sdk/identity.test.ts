import { describe, expect, it } from "vitest";
import { SdkIdentity } from "./identity.js";
import { fakeApi, json, on } from "./testing.js";

const link = {
  id: "lnk_1",
  accountId: "111122223333",
  roleArn: "arn:aws:iam::111122223333:role/x",
  profileName: "p",
  status: "pending_trust",
  externalId: "afs-ext-1",
  trustPolicy: { Effect: "Allow" },
  version: 3,
};
const base = "/v1/teams/t1/agents/a1";

describe("SdkIdentity (M4-I)", () => {
  it("lists, creates, reads the trust policy, verifies (202) and deletes with If-Match", async () => {
    const { client, calls } = fakeApi(
      on("GET", `${base}/role-links`, () => json({ items: [link] })),
      on("POST", `${base}/role-links`, () => json(link, 201)),
      on("GET", `${base}/role-links/lnk_1`, () => json(link)),
      on("POST", `${base}/role-links/lnk_1:verify`, () => json(link, 202)),
      on("DELETE", `${base}/role-links/lnk_1`, () => json({}, 204)),
    );
    const port = new SdkIdentity(client);
    expect((await port.roleLinks("t1", "a1"))[0]).toMatchObject({
      id: "lnk_1",
      status: "pending_trust",
    });
    await port.createRoleLink("t1", "a1", {
      roleArn: link.roleArn,
      profileName: "p",
      maxSessionSeconds: 900,
    });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      roleArn: link.roleArn,
      profileName: "p",
      maxSessionSeconds: 900,
    });
    expect((await port.roleLink("t1", "a1", "lnk_1")).trustPolicy).toEqual({ Effect: "Allow" });
    expect((await port.verifyRoleLink("t1", "a1", "lnk_1")).id).toBe("lnk_1");
    await port.deleteRoleLink("t1", "a1", { id: "lnk_1", version: 3 });
    expect(calls.find((c) => c.method === "DELETE")?.headers.get("if-match")).toBe('"3"');
  });
  it("counts links per agent and manages identities", async () => {
    const ident = { id: "aid_1", kind: "external", externalRef: "x", status: "active", version: 2 };
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/t1/agents/a1/role-links", () => json({ items: [link] })),
      on("GET", "/v1/teams/t1/agents/a2/role-links", () => json({ items: [] })),
      on("GET", `${base}/identities`, () => json({ items: [ident] })),
      on("POST", `${base}/identities`, () => json(ident, 201)),
      on("DELETE", `${base}/identities/aid_1`, () => json({}, 204)),
    );
    const port = new SdkIdentity(client);
    const by = await port.linksForAgents("t1", ["a1", "a2"]);
    expect(by.a1).toHaveLength(1);
    expect(by.a2).toHaveLength(0);
    expect((await port.identities("t1", "a1"))[0]).toMatchObject({ kind: "external", version: 2 });
    await port.createIdentity("t1", "a1", {
      kind: "external",
      externalRef: "x",
      secretId: "sec_1",
    });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      kind: "external",
      externalRef: "x",
      secretId: "sec_1",
    });
    await port.deleteIdentity("t1", "a1", { id: "aid_1", version: 2 });
    expect(calls.find((c) => c.method === "DELETE")?.headers.get("if-match")).toBe('"2"');
  });
});
