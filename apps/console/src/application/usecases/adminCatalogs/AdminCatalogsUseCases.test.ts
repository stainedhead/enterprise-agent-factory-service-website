import { describe, expect, it } from "vitest";
import {
  D1,
  D2,
  fakeStoragePort,
  fakeTemplatesPort,
} from "../../../presentation/testing/adminCatalogs.js";
import { aStorageClass, aTemplate } from "../../../presentation/testing/agents.js";
import {
  AdminAgentTemplatesUseCases,
  AdminStorageClassesUseCases,
} from "./AdminCatalogsUseCases.js";

describe("AdminStorageClassesUseCases", () => {
  it("validates name and volume type, and holds the version on edit", async () => {
    const port = fakeStoragePort();
    const uc = new AdminStorageClassesUseCases(port);
    await expect(uc.put("Bad Name", { volumeType: "gp3" })).rejects.toMatchObject({
      kind: "validation",
    });
    await expect(uc.put("fast", { volumeType: "st1" })).rejects.toMatchObject({
      kind: "validation",
    });
    expect(port.put).not.toHaveBeenCalled();
    await uc.put("fast", { volumeType: "io2" });
    expect(port.put).toHaveBeenLastCalledWith({ name: "fast" }, { volumeType: "io2" });
    await uc.put("gp3", { volumeType: "gp3" }, aStorageClass({ version: 4 }));
    expect(port.put).toHaveBeenLastCalledWith({ name: "gp3", version: 4 }, { volumeType: "gp3" });
  });
  it("lists, switches and deletes", async () => {
    const port = fakeStoragePort();
    const uc = new AdminStorageClassesUseCases(port);
    expect((await uc.list()).length).toBe(2);
    await uc.setEnabled(aStorageClass(), false);
    expect(port.put.mock.calls[0]?.[1]).toMatchObject({ enabled: false });
    await uc.delete(aStorageClass());
    expect(port.delete).toHaveBeenCalledWith({ name: "gp3", version: 1 });
  });
});

describe("AdminAgentTemplatesUseCases", () => {
  const ok = { harness: "hermes", allowedDigests: [D1, D2], currentDigest: D1 };
  it("validates name, harness, digests and the current one", async () => {
    const port = fakeTemplatesPort();
    const uc = new AdminAgentTemplatesUseCases(port);
    await expect(uc.put("X", ok)).rejects.toMatchObject({ kind: "validation" });
    await expect(uc.put("coder", { ...ok, harness: "" })).rejects.toBeDefined();
    await expect(uc.put("coder", { ...ok, allowedDigests: [] })).rejects.toBeDefined();
    await expect(uc.put("coder", { ...ok, allowedDigests: ["nope"] })).rejects.toBeDefined();
    await expect(
      uc.put("coder", { ...ok, currentDigest: `sha256:${"c".repeat(64)}` }),
    ).rejects.toBeDefined();
    expect(port.put).not.toHaveBeenCalled();
    await uc.put("coder", ok, aTemplate({ version: 2 }));
    expect(port.put).toHaveBeenCalledWith({ name: "coder", version: 2 }, ok);
  });
  it("lists, switches and deletes", async () => {
    const port = fakeTemplatesPort();
    const uc = new AdminAgentTemplatesUseCases(port);
    expect((await uc.list()).length).toBe(2);
    await uc.setEnabled(aTemplate(), false);
    expect(port.put.mock.calls[0]?.[1]).toMatchObject({ enabled: false });
    await uc.delete(aTemplate());
    expect(port.delete).toHaveBeenCalled();
  });
});
