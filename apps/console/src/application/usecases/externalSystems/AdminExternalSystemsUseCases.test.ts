import { describe, expect, it } from "vitest";
import {
  aSystem,
  fakeAdminExternalSystemsPort,
} from "../../../presentation/testing/externalSystems.js";
import {
  AdminExternalSystemsUseCases,
  needsUnmeteredConfirm,
  unmeteredWarning,
} from "./AdminExternalSystemsUseCases.js";

const good = {
  name: "Datadog",
  slug: "datadog",
  category: "other",
  endpoints: ["api.datadoghq.com"],
};

describe("AdminExternalSystemsUseCases", () => {
  it("validates a new system before sending", async () => {
    const port = fakeAdminExternalSystemsPort();
    const uc = new AdminExternalSystemsUseCases(port);
    await expect(uc.create({ ...good, name: "" })).rejects.toMatchObject({ kind: "validation" });
    await expect(uc.create({ ...good, docsUrl: "http://x" })).rejects.toMatchObject({
      kind: "validation",
    });
    await expect(uc.create({ ...good, endpoints: [] })).rejects.toBeDefined();
    expect(port.create).not.toHaveBeenCalled();
    await uc.create(good);
    expect(port.create).toHaveBeenCalled();
  });
  it("validates an edit and sends the held version", async () => {
    const port = fakeAdminExternalSystemsPort();
    const uc = new AdminExternalSystemsUseCases(port);
    await expect(uc.update(aSystem(), { name: " " })).rejects.toBeDefined();
    await uc.update(aSystem({ version: 7 }), { name: "GH" });
    expect(port.update).toHaveBeenCalledWith({ id: "ext_1", version: 7 }, { name: "GH" });
  });
  it("switches at service level and lists", async () => {
    const port = fakeAdminExternalSystemsPort();
    const uc = new AdminExternalSystemsUseCases(port);
    await uc.setEnabled(aSystem(), false);
    expect(port.update).toHaveBeenCalledWith({ id: "ext_1", version: 1 }, { enabled: false });
    expect((await uc.list()).length).toBe(3);
  });
  it("refuses to delete a built-in system and deletes a custom one", async () => {
    const port = fakeAdminExternalSystemsPort();
    const uc = new AdminExternalSystemsUseCases(port);
    await expect(uc.delete(aSystem())).rejects.toMatchObject({ kind: "validation" });
    expect(port.delete).not.toHaveBeenCalled();
    await uc.delete(aSystem({ builtin: false }));
    expect(port.delete).toHaveBeenCalled();
  });
  it("needs the unmetered confirmation only when enabling an unmetered system", () => {
    expect(needsUnmeteredConfirm(aSystem({ unmetered: true }), true)).toBe(true);
    expect(needsUnmeteredConfirm(aSystem({ unmetered: true }), false)).toBe(false);
    expect(needsUnmeteredConfirm(aSystem(), true)).toBe(false);
    expect(unmeteredWarning("X")).toMatch(/not counted.*not capped/);
  });
});
