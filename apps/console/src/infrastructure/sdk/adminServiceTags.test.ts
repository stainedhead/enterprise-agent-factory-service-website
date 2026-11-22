import { describe, expect, it } from "vitest";
import { SdkAdminServiceTags } from "./adminServiceTags.js";
import { SdkTags } from "./tags.js";
import { fakeApi, json, on } from "./testing.js";

describe("SdkAdminServiceTags (M4-G1)", () => {
  it("lists, creates, replaces with If-Match and deletes", async () => {
    const wire = { key: "environment", mode: "required", allowedValues: ["prod"], version: 2 };
    const { client, calls } = fakeApi(
      on("GET", "/v1/admin/service-tags", () => json({ items: [wire] })),
      on("PUT", "/v1/admin/service-tags/environment", () => json(wire)),
      on("DELETE", "/v1/admin/service-tags/environment", () => json({}, 204)),
    );
    const port = new SdkAdminServiceTags(client);
    expect((await port.list())[0]).toMatchObject({ key: "environment", version: 2 });
    await port.put("environment", 2, { mode: "required", allowedValues: ["prod"] });
    expect(calls.find((c) => c.method === "PUT")?.headers.get("if-match")).toBe('"2"');
    await port.delete("environment", 2);
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });
  it("finds the teams that miss a required key from their tags", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/teams", () =>
        json({
          items: [
            { id: "t1", displayName: "B", state: "active" },
            { id: "t2", displayName: "A", state: "active" },
          ],
        }),
      ),
      on("GET", "/v1/teams/t1/tags", () =>
        json({
          tags: [
            { key: "environment", source: "missing" },
            { key: "other", source: "missing" },
          ],
        }),
      ),
      on("GET", "/v1/teams/t2/tags", () =>
        json({ tags: [{ key: "environment", source: "team", value: "prod" }] }),
      ),
    );
    expect(await new SdkAdminServiceTags(client).teamsMissing(["environment"])).toEqual([
      { teamId: "t1", displayName: "B", keys: ["environment"] },
    ]);
  });
});

describe("SdkTags (M4-G4)", () => {
  it("reads sources and dropped keys, and writes with If-Match", async () => {
    const wire = {
      tags: [{ key: "afs-team-id", source: "system", value: "t1" }],
      requestMetadataDroppedKeys: ["zeta"],
      version: 3,
    };
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/t1/tags", () => json(wire)),
      on("PUT", "/v1/teams/t1/tags", () => json({ ...wire, version: 4 })),
    );
    const port = new SdkTags(client);
    expect(await port.get("t1")).toEqual({
      tags: [{ key: "afs-team-id", source: "system", value: "t1" }],
      droppedKeys: ["zeta"],
      version: 3,
    });
    await port.put("t1", 3, [{ key: "a", value: "b" }]);
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.headers.get("if-match")).toBe('"3"');
    expect(put?.body).toEqual({ tags: [{ key: "a", value: "b" }] });
  });
});
