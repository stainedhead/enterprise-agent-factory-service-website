import { describe, expect, it } from "vitest";
import { SdkNotifications } from "./notifications.js";
import { fakeApi, json, on } from "./testing.js";

const wire = {
  id: "nch_1",
  name: "alerts",
  kind: "slack",
  enabled: true,
  eventTypes: ["budget.*"],
  config: { channel: "#a" },
  secretId: "sec_1",
  delivery: { healthy: false, lastError: "invalid_auth", lastTestId: "t1" },
  version: 4,
};

describe("SdkNotifications (M3-N)", () => {
  it("lists, creates with a secret reference, updates with If-Match and deletes", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/t1/notification-channels", () => json({ items: [wire] })),
      on("POST", "/v1/teams/t1/notification-channels", () => json(wire, 201)),
      on("PATCH", "/v1/teams/t1/notification-channels/nch_1", () => json({ ...wire, version: 5 })),
      on("DELETE", "/v1/teams/t1/notification-channels/nch_1", () => json(wire, 202)),
    );
    const port = new SdkNotifications(client);
    const [c] = await port.list("t1");
    expect(c).toMatchObject({ id: "nch_1", secretId: "sec_1" });
    expect(c?.delivery).toMatchObject({ healthy: false, lastError: "invalid_auth" });
    await port.create("t1", {
      name: "alerts",
      kind: "slack",
      eventTypes: ["budget.*"],
      config: { channel: "#a" },
      secretId: "sec_1",
    });
    expect(calls.find((x) => x.method === "POST")?.body).toMatchObject({ secretId: "sec_1" });
    await port.update("t1", { id: "nch_1", version: 4 }, { enabled: false });
    expect(calls.find((x) => x.method === "PATCH")?.headers.get("if-match")).toBe('"4"');
    await port.delete("t1", { id: "nch_1", version: 4 });
    expect(calls.some((x) => x.method === "DELETE")).toBe(true);
  });

  it("maps a 200 and a 202 test, and lists schedules", async () => {
    let n = 0;
    const { client } = fakeApi(
      on("POST", "/v1/teams/t1/notification-channels/nch_1:test", () =>
        n++ === 0
          ? json({ testId: "t1", delivered: true })
          : json({ testId: "t2", pending: true }, 202),
      ),
      on("GET", "/v1/teams/t1/report-schedules", () =>
        json({ items: [{ id: "rs_1", name: "Weekly", channelId: "nch_1" }] }),
      ),
    );
    const port = new SdkNotifications(client);
    expect(await port.test("t1", "nch_1")).toMatchObject({ delivered: true, pending: false });
    expect(await port.test("t1", "nch_1")).toMatchObject({ testId: "t2", pending: true });
    expect(await port.schedules("t1")).toEqual([
      { id: "rs_1", name: "Weekly", channelId: "nch_1" },
    ]);
  });
});
