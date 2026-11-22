import { describe, expect, it } from "vitest";
import { SdkAdminNotificationChannels } from "./adminNotificationChannels.js";
import { fakeApi, json, on } from "./testing.js";

const wire = {
  id: "nch_1",
  name: "ops-email",
  kind: "email",
  enabled: true,
  eventTypes: ["budget.*"],
  config: { to: "ops@example.test" },
  generation: 1,
  status: {
    phase: "Ready",
    conditions: [],
    observedGeneration: 1,
    updatedAt: "2026-11-21T18:00:00Z",
  },
  version: 3,
};

describe("SdkAdminNotificationChannels (M4-N1)", () => {
  it("lists, creates, updates with If-Match and deletes service channels", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/admin/notification-channels", () => json({ items: [wire] })),
      on("POST", "/v1/admin/notification-channels", () => json(wire, 201)),
      on("PATCH", "/v1/admin/notification-channels/nch_1", () => json({ ...wire, enabled: false })),
      on("DELETE", "/v1/admin/notification-channels/nch_1", () => json({}, 204)),
    );
    const port = new SdkAdminNotificationChannels(client);
    expect((await port.list())[0]).toMatchObject({ id: "nch_1", kind: "email" });
    await port.create({
      name: "ops-email",
      kind: "email",
      eventTypes: ["budget.*"],
      config: { to: "ops@example.test" },
    });
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ kind: "email" });
    await port.update({ id: "nch_1", version: 3 }, { enabled: false });
    expect(calls.find((c) => c.method === "PATCH")?.headers.get("if-match")).toBe('"3"');
    await port.delete({ id: "nch_1", version: 3 });
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });
  it("maps the API's 409 for a channel in use", async () => {
    const { client } = fakeApi(
      on("DELETE", "/v1/admin/notification-channels/nch_1", () =>
        json({ code: "Conflict", message: "In use by work orders", requestId: "r" }, 409),
      ),
    );
    await expect(
      new SdkAdminNotificationChannels(client).delete({ id: "nch_1", version: 3 }),
    ).rejects.toMatchObject({ kind: "conflict" });
  });
});
