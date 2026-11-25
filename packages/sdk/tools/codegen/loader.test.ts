import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTRACT_DIR } from "../contract-sync.js";
import { loadContract, SDK_RENAMES, unlistedSecretLooking } from "./loader.js";

const c = loadContract(CONTRACT_DIR);

describe("loader (M0-G1, G3)", () => {
  it("loads 221 operations with the documented method counts", () => {
    expect(c.operations).toHaveLength(221);
    const count = (m: string) => c.operations.filter((o) => o.method === m).length;
    expect([count("GET"), count("POST"), count("DELETE"), count("PATCH"), count("PUT")]).toEqual([
      92, 55, 28, 20, 26,
    ]);
  });
  it("finds 12 CSV operations, 48 required If-Match, and Idempotency-Key on every POST", () => {
    expect(c.operations.filter((o) => o.csv)).toHaveLength(12);
    expect(c.operations.filter((o) => o.ifMatch === "required")).toHaveLength(48);
    for (const o of c.operations.filter((x) => x.method === "POST"))
      expect(o.idempotencyKey).toBe(true);
  });
  it("parses x-afs-sdk namespaces and modules (25 top-level + 24 admin)", () => {
    const mods = new Set(c.operations.map((o) => o.module));
    expect(mods.size).toBe(49);
    expect(c.operations.find((o) => o.operationId === "ListTeamModels")?.sdk).toEqual({
      namespace: ["teams", "models"],
      method: "list",
    });
    expect(c.operations.find((o) => o.operationId === "GetHealth")?.sdk.method).toBe("get");
  });
  it("records success statuses and content types", () => {
    const u = c.operations.find((o) => o.operationId === "GetUsage");
    expect(u?.responses[0]?.contentTypes).toEqual(["application/json", "text/csv"]);
    expect(c.operations.find((o) => o.operationId === "GetTeamKubeconfig")?.yaml).toBe(true);
    expect(c.operations.filter((o) => o.responses.some((r) => r.status === 204)).length).toBe(24);
  });
  it("derives a reader for every operation that needs If-Match", () => {
    const missing = c.operations
      .filter((o) => o.ifMatch === "required" && !o.reader)
      .map((o) => o.operationId);
    expect(missing).toEqual([]);
    const repo = c.operations.find((o) => o.operationId === "UpdateWorkOrderRepo");
    expect(repo?.reader?.match.map(([, p]) => p)).toEqual(["host", "repo"]);
    expect(
      c.operations.find((o) => o.operationId === "UpdateInferenceProvider")?.reader,
    ).toMatchObject({ operationId: "ListInferenceProviders", kind: "list" });
    expect(c.operations.find((o) => o.operationId === "PutSetting")?.reader).toBeUndefined();
    expect(c.operations.find((o) => o.operationId === "DeleteTeam")?.reader).toMatchObject({
      operationId: "GetTeam",
      kind: "get",
    });
  });
  it("marks versionless If-Match resources (CQ-2 interim: ApiKey only)", () => {
    expect(
      c.operations
        .filter((o) => o.versionless)
        .map((o) => o.operationId)
        .sort(),
    ).toEqual(["DeleteApiKey", "DeleteServiceApiKey"]);
  });
  it("lists secret fields and finds no unlisted secret-looking request property", () => {
    expect(c.operations.find((o) => o.operationId === "RotateSecret")?.secretFields).toContain(
      "value",
    );
    expect(unlistedSecretLooking(c)).toEqual([]);
  });
  it("fails the check when a secret-looking property is not listed", () => {
    const clone = structuredClone(c);
    const op = clone.operations.find((o) => o.operationId === "RotateSecret");
    if (op) op.secretFields = [];
    expect(unlistedSecretLooking(clone)).toContain("RotateSecret.value");
  });
  it("matches operations.json", () => {
    const j = JSON.parse(readFileSync(join(CONTRACT_DIR, "operations.json"), "utf8")) as {
      operationId: string;
      sdk: string;
    }[];
    for (const e of j) {
      const o = c.operations.find((x) => x.operationId === e.operationId);
      expect(`${o?.sdk.namespace.join(".")}.${o?.sdk.method}()`).toBe(
        SDK_RENAMES[e.operationId] ?? e.sdk,
      );
    }
  });
  it("renames only the duplicated inference report name (contract v1.5.0)", () => {
    const j = JSON.parse(readFileSync(join(CONTRACT_DIR, "operations.json"), "utf8")) as {
      operationId: string;
      sdk: string;
    }[];
    const twice = j
      .filter((e) => j.filter((x) => x.sdk === e.sdk).length > 1)
      .map((e) => e.operationId);
    expect(Object.keys(SDK_RENAMES).every((id) => twice.includes(id))).toBe(true);
    const names = c.operations.map((o) => `${o.sdk.namespace.join(".")}.${o.sdk.method}`);
    expect(new Set(names).size).toBe(names.length);
  });
});
