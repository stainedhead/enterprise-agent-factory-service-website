import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { operations } from "../src/generated/operations.js";
import { apiKey, createAfs, type Versioned } from "../src/index.js";
import { fakeFetch } from "../src/testing/fakeFetch.js";
import { CONTRACT_DIR, sha256 } from "../tools/contract-sync.js";

type Doc = {
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        "x-afs-sdk"?: string;
        responses?: Record<string, { content?: Record<string, { example?: unknown }> }>;
      }
    >
  >;
};
const doc = parse(readFileSync(join(CONTRACT_DIR, "openapi.yaml"), "utf8")) as Doc;

interface Example {
  id: string;
  sdk: string;
  path: string;
  method: string;
  status: number;
  example: unknown;
}
const examples: Example[] = [];
for (const [path, item] of Object.entries(doc.paths)) {
  for (const [method, op] of Object.entries(item)) {
    if (!op.operationId) continue;
    for (const [status, r] of Object.entries(op.responses ?? {})) {
      const ex = r.content?.["application/json"]?.example;
      if (status.startsWith("2") && ex !== undefined) {
        examples.push({
          id: op.operationId,
          sdk: op["x-afs-sdk"] as string,
          path,
          method: method.toUpperCase(),
          status: Number(status),
          example: ex,
        });
      }
    }
  }
}

function resolveFn(afs: unknown, sdk: string): (...a: unknown[]) => unknown {
  const parts = sdk.replace(/\(\)$/, "").split(".");
  let cur: unknown = afs;
  for (const p of parts) cur = (cur as Record<string, unknown>)[p];
  return cur as (...a: unknown[]) => unknown;
}

function collectMoney(v: unknown, found: [string, unknown][] = []): [string, unknown][] {
  if (Array.isArray(v)) for (const x of v) collectMoney(x, found);
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (/(Usd|Amount)$/.test(k) && x !== null && typeof x !== "object") found.push([k, x]);
      collectMoney(x, found);
    }
  }
  return found;
}

describe("contract replay (M0-P5)", () => {
  it("finds the 172 JSON 2xx response examples (175 in all content types and statuses)", () => {
    expect(examples).toHaveLength(172);
  });

  it.each(examples.map((e) => [`${e.id} ${e.status}`, e] as const))(
    "%s parses through its SDK method",
    async (_n, e) => {
      const f = fakeFetch().on(`${e.method} ${e.path.replace(/\{[^}]+\}/g, "x")}`, {
        status: e.status,
        body: e.example,
      });
      const afs = createAfs({ endpoint: "https://x", fetch: f.fetch, auth: apiKey("afsk_k") });
      const def = operations[e.id as keyof typeof operations];
      const args: unknown[] = def.pathParams.map((_p, i) =>
        i === def.pathParams.length - 1 && def.ifMatch !== "none"
          ? ({ id: "x", name: "x", key: "x", version: 1 } satisfies Versioned)
          : "x",
      );
      if (def.body) args.push({});
      const result = resolveFn(afs, e.sdk)(...args);
      const expected = JSON.parse(JSON.stringify(e.example)) as Record<string, unknown>;
      if (def.list) {
        const page = await (result as { first(): Promise<{ items: unknown[] }> }).first();
        expect(page.items).toEqual(expected.items);
      } else {
        const body = await (result as Promise<unknown>);
        expect(JSON.parse(JSON.stringify(body ?? null))).toEqual(expected);
      }
      for (const [k, v] of collectMoney(e.example)) {
        if (/Usd$/.test(k)) expect(typeof v === "string" || typeof v === "number", k).toBe(true);
      }
    },
  );

  it("money examples stay strings", () => {
    const bad = examples.flatMap((e) =>
      collectMoney(e.example)
        .filter(([k, v]) => /Usd$/.test(k) && typeof v !== "string")
        .map(([k]) => `${e.id}.${k}`),
    );
    expect(bad).toEqual([]);
  });

  it("the lock's permissions.json checksum matches the snapshot", () => {
    const lock = JSON.parse(readFileSync(join(CONTRACT_DIR, "contract.lock.json"), "utf8")) as {
      files: Record<string, string>;
    };
    expect(sha256(readFileSync(join(CONTRACT_DIR, "permissions.json")))).toBe(
      lock.files["permissions.json"],
    );
  });
});
