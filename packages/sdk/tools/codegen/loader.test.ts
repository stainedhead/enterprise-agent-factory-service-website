import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTRACT_DIR } from "../contract-sync.js";
import { loadContract, SDK_RENAMES, unlistedSecretLooking } from "./loader.js";

const c = loadContract(CONTRACT_DIR);

describe("loader (M0-G1, G3)", () => {
  it("loads the 275 SDK operations (276 less the browser-only OAuth callback) with the method counts", () => {
    expect(c.operations).toHaveLength(275);
    expect(c.operations.find((o) => o.operationId === "CompleteMcpOAuthConnect")).toBeUndefined();
    const count = (m: string) => c.operations.filter((o) => o.method === m).length;
    expect([count("GET"), count("POST"), count("DELETE"), count("PATCH"), count("PUT")]).toEqual([
      109, 79, 32, 22, 33,
    ]);
  });
  it("finds 16 CSV operations, 54 required If-Match, and Idempotency-Key on every POST", () => {
    expect(c.operations.filter((o) => o.csv)).toHaveLength(16);
    expect(c.operations.filter((o) => o.ifMatch === "required")).toHaveLength(54);
    for (const o of c.operations.filter((x) => x.method === "POST"))
      expect(o.idempotencyKey).toBe(true);
  });
  it("parses x-afs-sdk namespaces and modules (29 top-level + 24 admin)", () => {
    const mods = new Set(c.operations.map((o) => o.module));
    expect(mods.size).toBe(53);
    for (const m of ["mcpServers", "mcpReviews", "mcpEvents", "mcpSettings"])
      expect(mods).toContain(m);
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
    expect(c.operations.filter((o) => o.responses.some((r) => r.status === 204)).length).toBe(28);
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
    expect(c.operations.find((o) => o.operationId === "UpdateTeamMcpServer")?.reader).toEqual({
      operationId: "GetTeamMcpServer",
      kind: "get",
      match: [],
      versionIn: "server",
    });
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
    for (const e of j.filter((x) => x.sdk !== "none")) {
      const o = c.operations.find((x) => x.operationId === e.operationId);
      expect(`${o?.sdk.namespace.join(".")}.${o?.sdk.method}()`).toBe(
        SDK_RENAMES[e.operationId] ?? e.sdk,
      );
    }
  });
  it("renames only duplicated or namespace-less names (contract v1.5.0, v1.6.0)", () => {
    const j = JSON.parse(readFileSync(join(CONTRACT_DIR, "operations.json"), "utf8")) as {
      operationId: string;
      sdk: string;
    }[];
    const twice = j
      .filter((e) => j.filter((x) => x.sdk === e.sdk).length > 1)
      .map((e) => e.operationId);
    const bare = j.filter((e) => e.sdk.startsWith(".")).map((e) => e.operationId);
    expect(bare).toHaveLength(11);
    expect(Object.keys(SDK_RENAMES).every((id) => twice.includes(id) || bare.includes(id))).toBe(
      true,
    );
    for (const id of bare)
      expect(SDK_RENAMES[id], id).toMatch(/^[a-z][A-Za-z.]+\.[a-z][A-Za-z]+\(\)$/);
    const names = c.operations.map((o) => `${o.sdk.namespace.join(".")}.${o.sdk.method}`);
    expect(new Set(names).size).toBe(names.length);
  });
});
