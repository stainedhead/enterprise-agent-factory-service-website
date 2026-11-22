import { describe, expect, it } from "vitest";
import {
  type PreferencesPort,
  readTablePreferences,
  writeTablePreferences,
} from "./preferences.js";

const mem = (): PreferencesPort => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k), set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
};

describe("table preferences", () => {
  it("round-trips page size and hidden columns", () => {
    const p = mem();
    writeTablePreferences(p, "t", { pageSize: 50, hiddenColumns: ["a"] });
    expect(readTablePreferences(p, "t")).toEqual({ pageSize: 50, hiddenColumns: ["a"] });
  });
  it("returns nothing for missing, malformed or wrongly typed content", () => {
    const p = mem();
    expect(readTablePreferences(p, "t")).toEqual({});
    p.set("afs.table.t", "{not json");
    expect(readTablePreferences(p, "t")).toEqual({});
    p.set("afs.table.t", JSON.stringify({ pageSize: "x", hiddenColumns: [1, "b"] }));
    expect(readTablePreferences(p, "t")).toEqual({ hiddenColumns: ["b"] });
  });
});
