import { describe, expect, it } from "vitest";
import type { DraftPersistPort } from "../../ports/auth.js";
import { DraftStore } from "./DraftStore.js";

function persistence(initial: Record<string, Record<string, string>> = {}) {
  let held: Record<string, Record<string, string>> | undefined = initial;
  const port: DraftPersistPort = {
    write: (s) => {
      held = s;
    },
    take: () => {
      const r = held ?? {};
      held = undefined;
      return r;
    },
    clear: () => {
      held = undefined;
    },
  };
  return { port, held: () => held };
}

describe("DraftStore.clear (FR-004 AC3, sign-out part)", () => {
  it("drops the in-memory drafts and the persisted copy", () => {
    const p = persistence({ f: { a: "1" } });
    const d = new DraftStore(p.port);
    d.save("g", { b: "2" });
    d.clear();
    expect(d.get("g")).toBeUndefined();
    expect(d.snapshot()).toEqual({});
    expect(p.held()).toBeUndefined();
  });
  it("works without a persistence port", () => {
    const d = new DraftStore();
    d.save("g", { b: "2" });
    d.clear();
    expect(d.snapshot()).toEqual({});
  });
});
