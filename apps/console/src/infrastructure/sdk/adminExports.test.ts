import { describe, expect, it } from "vitest";
import { SdkAdminExports } from "./adminExports.js";
import { fakeApi, json, on } from "./testing.js";

const wire = {
  id: "exp_1",
  status: "succeeded",
  schemaVersion: 1,
  createdAt: "2026-11-20T10:00:00Z",
  sizeBytes: 2048,
  sha256: "abc",
  downloadUrl: "https://dl.example.test/x",
  downloadExpiresAt: "2026-11-27T10:00:00Z",
  teamIds: ["team_1"],
};

describe("SdkAdminExports (M4-E)", () => {
  it("lists, creates for chosen teams or all, and reads one", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/exports", () => json({ items: [wire] })),
      on("POST", "/v1/exports", () => json({ ...wire, status: "pending", downloadUrl: null }, 202)),
      on("GET", "/v1/exports/exp_1", () => json(wire)),
    );
    const port = new SdkAdminExports(client);
    const [e] = await port.list();
    expect(e).toMatchObject({ id: "exp_1", sizeBytes: 2048, sha256: "abc" });
    expect(await port.create(["team_1"])).toMatchObject({
      status: "pending",
      downloadUrl: undefined,
    });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ teamIds: ["team_1"] });
    await port.create([]);
    expect(calls.filter((c) => c.method === "POST")[1]?.body).toEqual({});
    expect((await port.get("exp_1")).downloadUrl).toBe("https://dl.example.test/x");
  });

  it("imports with dryRun in the query and the account map in the body", async () => {
    const { client, calls } = fakeApi(
      on("POST", "/v1/imports", () =>
        json({
          dryRun: true,
          teams: [{ slug: "payments", result: "updated", changes: ["agents +1"] }],
        }),
      ),
    );
    const r = await new SdkAdminExports(client).importBundle(
      { bundle: { schemaVersion: 1 }, accountMap: { "111122223333": "444455556666" } },
      true,
    );
    expect(r.teams[0]).toMatchObject({ slug: "payments", changes: ["agents +1"] });
    const c = calls.find((x) => x.method === "POST");
    expect(c?.query.get("dryRun")).toBe("true");
    expect(c?.body).toMatchObject({ accountMap: { "111122223333": "444455556666" } });
  });
});
