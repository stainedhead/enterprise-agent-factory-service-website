import { describe, expect, it, vi } from "vitest";
import { rowAccess, type TagRow, TagsUseCases, toRows, toWrite } from "./TagsUseCases.js";

const row = (over: Partial<TagRow>): TagRow => ({
  key: "k",
  source: "team",
  value: "v",
  original: "v",
  isNew: false,
  ...over,
});

describe("rowAccess (M4-G4)", () => {
  it("system and fixed service tags are read-only; required values and own tags are editable", () => {
    expect(rowAccess("system")).toBe("read-only");
    expect(rowAccess("service")).toBe("read-only");
    expect(rowAccess("missing")).toBe("value");
    expect(rowAccess("service_default")).toBe("value");
    expect(rowAccess("team")).toBe("own");
  });
});

describe("toWrite (M4-G4)", () => {
  it("sends team tags and required values that were set, never system or fixed ones", () => {
    const rows = toRows({
      tags: [
        { key: "afs-team-id", source: "system", value: "t" },
        { key: "region", source: "service", value: "eu" },
        { key: "environment", source: "missing", value: undefined },
        { key: "tier", source: "service_default", value: "dev" },
        { key: "cost-center", source: "team", value: "CC-1" },
      ],
      droppedKeys: [],
      version: 1,
    }).map((r) => (r.key === "environment" ? { ...r, value: " prod " } : r));
    expect(toWrite(rows)).toEqual([
      { key: "environment", value: "prod" },
      { key: "cost-center", value: "CC-1" },
    ]);
  });
  it("a defaulted value the team changed becomes a team value", () => {
    expect(toWrite([row({ source: "service_default", original: "dev", value: "prod" })])).toEqual([
      { key: "k", value: "prod" },
    ]);
  });
});

describe("TagsUseCases.check and save (M4-G4)", () => {
  const port = () => ({
    get: vi.fn(),
    put: vi.fn(async () => ({ tags: [], droppedKeys: [], version: 2 })),
  });
  it("refuses reserved, duplicate and empty new tags without a request", async () => {
    const p = port();
    const u = new TagsUseCases(p);
    const rows = [
      row({ key: "cost-center" }),
      row({ key: "afs-x", isNew: true, source: "team", value: "1", original: "" }),
      row({ key: "COST-center", isNew: true, source: "team", value: "1", original: "" }),
      row({ key: "ok", isNew: true, source: "team", value: "", original: "" }),
    ];
    expect(Object.keys(u.check(rows))).toEqual(["1", "2", "3"]);
    await expect(u.save("t", 1, rows)).rejects.toMatchObject({ kind: "validation" });
    expect(p.put).not.toHaveBeenCalled();
  });
  it("saves with the version it read", async () => {
    const p = port();
    await new TagsUseCases(p).save("t", 5, [row({})]);
    expect(p.put).toHaveBeenCalledWith("t", 5, [{ key: "k", value: "v" }]);
  });
});
