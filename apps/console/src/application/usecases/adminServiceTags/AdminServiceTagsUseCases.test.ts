import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors.js";
import type { AdminServiceTagsPort } from "../../ports/adminServiceTags.js";
import {
  AdminServiceTagsUseCases,
  draftOf,
  keyProblem,
  parseValues,
  SYSTEM_TAGS,
} from "./AdminServiceTagsUseCases.js";

const port = () =>
  ({
    list: vi.fn(async () => []),
    put: vi.fn(async (key: string) => ({ key, mode: "fixed" })),
    delete: vi.fn(async () => undefined),
    teamsMissing: vi.fn(async () => []),
  }) satisfies AdminServiceTagsPort;

const draft = (over = {}) => ({
  key: "environment",
  mode: "required" as const,
  value: "",
  defaultValue: "",
  allowedValuesText: "",
  description: "",
  ...over,
});

describe("keyProblem and parseValues (M4-G1)", () => {
  it("refuses blank, odd and reserved keys", () => {
    expect(keyProblem(" ")).toBeTruthy();
    expect(keyProblem("a*b")).toBeTruthy();
    expect(keyProblem("afs-team-id")).toMatch(/reserved/);
    expect(keyProblem("AWS:createdBy")).toMatch(/reserved/);
    expect(keyProblem("cost-center")).toBeUndefined();
  });
  it("splits allowed values on lines and commas without duplicates", () => {
    expect(parseValues("prod, dev\nprod\n")).toEqual(["prod", "dev"]);
  });
  it("lists the system tags AFS sets", () => {
    expect(SYSTEM_TAGS.map((t) => t.key)).toContain("afs-team-id");
  });
});

describe("AdminServiceTagsUseCases (M4-G1)", () => {
  it("creates a required tag with allowed values and a default", async () => {
    const p = port();
    await new AdminServiceTagsUseCases(p).save(
      undefined,
      draft({ allowedValuesText: "prod\ndev", defaultValue: "dev" }),
    );
    expect(p.put).toHaveBeenCalledWith("environment", undefined, {
      mode: "required",
      allowedValues: ["prod", "dev"],
      defaultValue: "dev",
    });
  });
  it("a fixed tag needs a value; a default must be allowed; nothing is sent", async () => {
    const p = port();
    const u = new AdminServiceTagsUseCases(p);
    await expect(u.save(undefined, draft({ mode: "fixed" }))).rejects.toMatchObject({
      fields: { value: expect.any(String) },
    });
    await expect(
      u.save(undefined, draft({ allowedValuesText: "prod", defaultValue: "dev" })),
    ).rejects.toBeInstanceOf(AppError);
    expect(p.put).not.toHaveBeenCalled();
  });
  it("edits with the version held and does not change the key", async () => {
    const p = port();
    const t = { key: "region", mode: "fixed", value: "eu", version: 4 };
    await new AdminServiceTagsUseCases(p).save(t, { ...draftOf(t), value: "us", key: "other" });
    expect(p.put).toHaveBeenCalledWith("region", 4, { mode: "fixed", value: "us" });
  });
  it("removes with the version and asks only about required keys for missing teams", async () => {
    const p = port();
    const u = new AdminServiceTagsUseCases(p);
    await u.remove({ key: "region", mode: "fixed", version: 4 });
    expect(p.delete).toHaveBeenCalledWith("region", 4);
    await u.missing([
      { key: "a", mode: "required" },
      { key: "b", mode: "fixed" },
    ]);
    expect(p.teamsMissing).toHaveBeenCalledWith(["a"], undefined);
  });
});
