import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTRACT_DIR } from "../contract-sync.js";
import { loadContract, unlistedSecretLooking } from "./loader.js";

const c = loadContract(CONTRACT_DIR);

describe("loader (M0-G1, G3)", () => {
  it("loads 189 operations with the documented method counts", () => {
    expect(c.operations).toHaveLength(189);
    const count = (m: string) => c.operations.filter((o) => o.method === m).length;
    expect([count("GET"), count("POST"), count("DELETE"), count("PATCH"), count("PUT")]).toEqual([
      82, 47, 26, 17, 17,
    ]);
  });
  it("finds 9 CSV operations, 43 required If-Match, and Idempotency-Key on every POST", () => {
    expect(c.operations.filter((o) => o.csv)).toHaveLength(9);
    expect(c.operations.filter((o) => o.ifMatch === "required")).toHaveLength(43);
    for (const o of c.operations.filter((x) => x.method === "POST"))
      expect(o.idempotencyKey).toBe(true);
  });
  it("parses x-afs-sdk namespaces and modules (24 top-level + 19 admin)", () => {
    const mods = new Set(c.operations.map((o) => o.module));
    expect(mods.size).toBe(43);
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
    expect(c.operations.filter((o) => o.responses.some((r) => r.status === 204)).length).toBe(22);
  });
  it("derives a reader for every operation that needs If-Match", () => {
    const missing = c.operations
      .filter((o) => o.ifMatch === "required" && !o.reader)
      .map((o) => o.operationId);
    expect(missing).toEqual([]);
    const repo = c.operations.find((o) => o.operationId === "UpdateWorkOrderRepo");
    expect(repo?.reader?.match.map(([, p]) => p)).toEqual(["host", "repo"]);
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
      expect(`${o?.sdk.namespace.join(".")}.${o?.sdk.method}()`).toBe(e.sdk);
    }
  });
});
