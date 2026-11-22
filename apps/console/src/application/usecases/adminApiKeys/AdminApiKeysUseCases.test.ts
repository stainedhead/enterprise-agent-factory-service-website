import { describe, expect, it } from "vitest";
import { fakeAdminApiKeysPort, NOW } from "../../../presentation/testing/adminApiKeys.js";
import { AdminApiKeysUseCases, SERVICE_KEY_MAX_DAYS } from "./AdminApiKeysUseCases.js";

const make = () => {
  const port = fakeAdminApiKeysPort();
  return { port, uc: new AdminApiKeysUseCases(port, { now: () => NOW }) };
};

describe("AdminApiKeysUseCases (M6-K1)", () => {
  it("creates with the security operator role and the default 30 days", async () => {
    const { port, uc } = make();
    const r = await uc.create({ name: " ci ", days: "" });
    expect(port.create).toHaveBeenCalledWith({
      name: "ci",
      role: "security_operator",
      expiresAt: new Date(NOW + 30 * 86_400_000).toISOString(),
    });
    expect(r.secretKey).toBe("afsk_SENTINEL");
  });
  it("keeps a minute under the 90 day limit", () => {
    const { uc } = make();
    expect(Date.parse(uc.expiryFor(SERVICE_KEY_MAX_DAYS))).toBe(NOW + 90 * 86_400_000 - 60_000);
  });
  it.each([
    [{ name: "", days: "30" }, "name"],
    [{ name: "x".repeat(101), days: "30" }, "name"],
    [{ name: "ok", days: "0" }, "expiresAt"],
    [{ name: "ok", days: "91" }, "expiresAt"],
    [{ name: "ok", days: "1.5" }, "expiresAt"],
  ])("refuses %j without calling the API", async (draft, field) => {
    const { port, uc } = make();
    await expect(uc.create(draft)).rejects.toMatchObject({
      fields: { [field]: expect.any(String) },
    });
    expect(port.create).not.toHaveBeenCalled();
  });
  it("lists and deletes", async () => {
    const { port, uc } = make();
    expect(await uc.list()).toHaveLength(1);
    await uc.delete("key_9");
    expect(port.delete).toHaveBeenCalledWith("key_9");
  });
});
