import { describe, expect, it } from "vitest";
import { AppError } from "../../application/errors.js";
import { SdkApiKeys, SdkMembers } from "./members.js";
import { fakeApi, json, on } from "./testing.js";

const member = {
  id: "mem_1",
  role: "team_viewer",
  subjectType: "user",
  email: "a@b.co",
  version: 2,
};
const key = {
  id: "key_1",
  name: "ci",
  role: "team_viewer",
  keyPrefix: "afs_ab12",
  expiresAt: "2026-12-22T00:00:00Z",
  createdAt: "2026-11-22T00:00:00Z",
};

describe("SdkMembers (M1-M1)", () => {
  it("lists every page", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/teams/team_1/members", (r) =>
        r.query.get("nextToken")
          ? json({ items: [{ ...member, id: "mem_2" }] })
          : json({ items: [member], nextToken: "n2" }),
      ),
    );
    expect((await new SdkMembers(client).list("team_1")).map((m) => m.id)).toEqual([
      "mem_1",
      "mem_2",
    ]);
  });

  it("adds, updates with If-Match and removes", async () => {
    const { client, calls } = fakeApi(
      on("POST", "/v1/teams/team_1/members", () => json(member, 201)),
      on("PATCH", "/v1/teams/team_1/members/mem_1", () =>
        json({ ...member, role: "team_admin", version: 3 }),
      ),
      on("DELETE", "/v1/teams/team_1/members/mem_1", () => new Response(null, { status: 204 })),
    );
    const sdk = new SdkMembers(client);
    await sdk.add("team_1", { subjectType: "user", role: "team_viewer", email: "a@b.co" });
    await sdk.update("team_1", { id: "mem_1", version: 2 }, "team_admin");
    await sdk.remove("team_1", { id: "mem_1", version: 2 });
    expect(calls[0]?.body).toEqual({ subjectType: "user", role: "team_viewer", email: "a@b.co" });
    expect(calls[1]?.headers.get("if-match")).toBe('"2"');
    expect(calls[1]?.body).toEqual({ role: "team_admin" });
  });

  it("maps a refused role to a validation error", async () => {
    const { client } = fakeApi(
      on("POST", "/v1/teams/team_1/members", () =>
        json(
          {
            code: "ValidationError",
            message: "role must be team_admin or team_viewer",
            requestId: "req_1",
          },
          400,
        ),
      ),
    );
    const err = await new SdkMembers(client)
      .add("team_1", { subjectType: "user", role: "service_admin", email: "a@b.co" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).kind).toBe("validation");
  });
});

describe("SdkApiKeys (M1-M2, M1-M5)", () => {
  it("returns the secret once, separate from the record", async () => {
    const { client } = fakeApi(
      on("POST", "/v1/teams/team_1/api-keys", () => json({ ...key, secretKey: "afs_s3cret" }, 201)),
    );
    const r = await new SdkApiKeys(client).create("team_1", {
      name: "ci",
      role: "team_viewer",
      expiresAt: key.expiresAt,
    });
    expect(r.secretKey).toBe("afs_s3cret");
    expect(r.replayed).toBe(false);
    expect("secretKey" in r.key).toBe(false);
  });

  it("marks a replayed create, which has no secret", async () => {
    const { client } = fakeApi(
      on("POST", "/v1/teams/team_1/api-keys", () =>
        json(key, 201, { "Idempotent-Replayed": "true" }),
      ),
    );
    const r = await new SdkApiKeys(client).create("team_1", {
      name: "ci",
      role: "team_viewer",
      expiresAt: key.expiresAt,
    });
    expect(r.secretKey).toBeUndefined();
    expect(r.replayed).toBe(true);
  });

  it("lists and deletes", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/team_1/api-keys", () => json({ items: [key] })),
      on("DELETE", "/v1/teams/team_1/api-keys/key_1", () => new Response(null, { status: 204 })),
    );
    const sdk = new SdkApiKeys(client);
    expect(await sdk.list("team_1")).toHaveLength(1);
    await sdk.delete("team_1", "key_1");
    expect(calls.at(-1)?.method).toBe("DELETE");
  });
});
