import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { parse } from "yaml";
import { SDK_RENAMES } from "../tools/codegen/loader.js";
import { CONTRACT_DIR } from "../tools/contract-sync.js";
import type { Paginated, ReportCall, Versioned } from "./index.js";
import { type Afs, CONTRACT_VERSION, createAfs, type Me, type Money, type Team } from "./index.js";

const afs = createAfs({ endpoint: "https://x" });

function leaves(obj: unknown, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === "core") continue;
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "function") out.push(`${p}()`);
    else if (v && typeof v === "object") out.push(...leaves(v, p));
  }
  return out;
}

describe("generated coverage (M0-G5)", () => {
  const operationsJson = JSON.parse(
    readFileSync(join(CONTRACT_DIR, "operations.json"), "utf8"),
  ) as {
    operationId: string;
    sdk: string;
  }[];
  const doc = parse(readFileSync(join(CONTRACT_DIR, "openapi.yaml"), "utf8")) as {
    info: { version: string };
    paths: Record<string, Record<string, { operationId?: string; "x-afs-sdk"?: string }>>;
  };
  const fromYaml = Object.values(doc.paths)
    .flatMap((item) => Object.values(item))
    .filter((o) => o.operationId)
    .map((o) => ({
      id: o.operationId as string,
      sdk: SDK_RENAMES[o.operationId as string] ?? (o["x-afs-sdk"] as string),
    }));

  it("exposes exactly the 221 operations of the contract (WEB-US-1.1)", () => {
    const facade = leaves(afs).sort();
    expect(fromYaml).toHaveLength(221);
    expect(operationsJson).toHaveLength(221);
    expect(facade).toEqual(fromYaml.map((o) => o.sdk).sort());
    expect(facade).toEqual(operationsJson.map((o) => SDK_RENAMES[o.operationId] ?? o.sdk).sort());
  });
  it("maps GetHealth to health.get()", () => {
    expect(fromYaml.find((o) => o.id === "GetHealth")?.sdk).toBe("health.get()");
    expect(typeof afs.health.get).toBe("function");
    expect(typeof afs.health.getReadiness).toBe("function");
  });
  it("pins the snapshot's contract version", () => {
    expect(CONTRACT_VERSION).toBe(doc.info.version);
  });
});

describe("signatures (M0-G4)", () => {
  it("follows the signature rule", () => {
    expectTypeOf(afs.teams.list).returns.toEqualTypeOf<Paginated<Team>>();
    expectTypeOf(afs.teams.get).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(afs.teams.update).parameter(0).toEqualTypeOf<string | Versioned>();
    expectTypeOf(afs.me.get).returns.resolves.toEqualTypeOf<Me>();
    expectTypeOf(afs.teams.getKubeconfig).returns.resolves.toBeString();
    expectTypeOf(afs.usage.get).returns.toMatchTypeOf<ReportCall<unknown>>();
    expectTypeOf(afs.secrets.putValue).returns.resolves.toBeVoid();
    expectTypeOf<Afs>().toHaveProperty("admin");
  });
  it("a Team is accepted as the versioned value", () => {
    expectTypeOf<Team>().toMatchTypeOf<Versioned>();
  });
  it("money fields are branded strings, never numbers", () => {
    expectTypeOf<Team["maxBudgetUsd"]>().toEqualTypeOf<Money>();
    expectTypeOf<Money>().not.toEqualTypeOf<number>();
    expectTypeOf<Money>().toMatchTypeOf<string>();
  });
});
