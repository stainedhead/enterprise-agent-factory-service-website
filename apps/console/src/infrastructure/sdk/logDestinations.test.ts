import { describe, expect, it } from "vitest";
import { SdkLogDestinations } from "./logDestinations.js";
import { fakeApi, json, on } from "./testing.js";

const wire = {
  id: "log_1",
  name: "central",
  kind: "splunk_hec",
  enabled: true,
  config: { endpoint: "https://hec.example.test" },
  secretId: "sec_1",
  generation: 1,
  status: {
    phase: "Degraded",
    observedGeneration: 1,
    updatedAt: "2026-11-21T18:00:00Z",
    conditions: [
      {
        type: "DeliveryHealthy",
        status: "False",
        message: "HTTP 403 from HEC",
        lastTransitionTime: "2026-11-21T19:00:00Z",
      },
    ],
  },
  version: 4,
};

describe("SdkLogDestinations (M4-L)", () => {
  it("lists with the delivery condition, creates with a secret reference, updates with If-Match, deletes", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/t1/log-destinations", () => json({ items: [wire] })),
      on("POST", "/v1/teams/t1/log-destinations", () => json(wire, 201)),
      on("PATCH", "/v1/teams/t1/log-destinations/log_1", () => json({ ...wire, version: 5 })),
      on("DELETE", "/v1/teams/t1/log-destinations/log_1", () => json(wire, 202)),
    );
    const port = new SdkLogDestinations(client);
    const [d] = await port.list("t1");
    expect(d).toMatchObject({
      id: "log_1",
      secretId: "sec_1",
      phase: "Degraded",
      delivery: "failing",
      deliveryMessage: "HTTP 403 from HEC",
    });
    await port.create("t1", {
      name: "central",
      kind: "splunk_hec",
      config: { endpoint: "https://hec.example.test" },
      secretId: "sec_1",
    });
    expect(calls.find((x) => x.method === "POST")?.body).toMatchObject({ secretId: "sec_1" });
    await port.update("t1", { id: "log_1", version: 4 }, { enabled: false, secretId: null });
    const patch = calls.find((x) => x.method === "PATCH");
    expect(patch?.headers.get("if-match")).toBe('"4"');
    expect(patch?.body).toMatchObject({ enabled: false, secretId: null });
    await port.delete("t1", { id: "log_1", version: 4 });
    expect(calls.some((x) => x.method === "DELETE")).toBe(true);
  });

  it("reads a destination without the condition as not yet used", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/teams/t1/log-destinations", () =>
        json({
          items: [{ ...wire, secretId: null, status: { ...wire.status, conditions: [] } }],
        }),
      ),
    );
    const [d] = await new SdkLogDestinations(client).list("t1");
    expect(d).toMatchObject({ delivery: "unknown", secretId: undefined });
  });
});
