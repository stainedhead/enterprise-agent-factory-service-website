import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors.js";
import type { IdentityProvidersPort, SettingRecord, SettingsPort } from "../../ports/settings.js";
import {
  type IdentityProviderDraft,
  IdentityProvidersUseCases,
  parseSetting,
  SettingsUseCases,
  settingText,
} from "./SettingsUseCases.js";

const setting = (over: Partial<SettingRecord> = {}): SettingRecord => ({
  key: "audit.retention_days",
  value: 365,
  default: 365,
  type: "integer",
  allowed: "30 to 3650",
  min: 30,
  max: 3650,
  version: 4,
  ...over,
});

describe("parseSetting (M1-N2)", () => {
  it.each([
    ["integer in range", setting(), "90", { ok: true, value: 90 }],
    ["integer at the minimum", setting(), "30", { ok: true, value: 30 }],
    ["integer below the minimum", setting(), "29", { ok: false }],
    ["integer above the maximum", setting(), "3651", { ok: false }],
    ["integer not whole", setting(), "1.5", { ok: false }],
    ["integer blank", setting(), " ", { ok: false }],
    ["boolean true", setting({ type: "boolean" }), "true", { ok: true, value: true }],
    ["boolean junk", setting({ type: "boolean" }), "yes", { ok: false }],
    ["nullable blank", setting({ type: "string", nullable: true }), "", { ok: true, value: null }],
    [
      "string pattern ok",
      setting({ type: "string", pattern: "^[a-z]+$" }),
      "abc",
      { ok: true, value: "abc" },
    ],
    ["string pattern bad", setting({ type: "string", pattern: "^[a-z]+$" }), "AB1", { ok: false }],
    ["array", setting({ type: "array" }), "a, b ,, c", { ok: true, value: ["a", "b", "c"] }],
    ["empty array", setting({ type: "array" }), "", { ok: true, value: [] }],
  ] as const)("%s", (_n, s, text, expected) => {
    expect(parseSetting(s, text)).toMatchObject(expected);
  });

  it("names the range in the refusal", () => {
    expect(parseSetting(setting(), "5")).toEqual({
      ok: false,
      message: "Enter 30 or more, up to 3650",
    });
  });

  it("renders values as text", () => {
    expect(settingText(["a", "b"])).toBe("a, b");
    expect(settingText(null)).toBe("");
    expect(settingText(false)).toBe("false");
  });
});

describe("SettingsUseCases.edit", () => {
  const port = (): { [K in keyof SettingsPort]: ReturnType<typeof vi.fn> } => ({
    list: vi.fn(async () => []),
    put: vi.fn(async () => setting()),
  });
  it("puts a valid value against the held version", async () => {
    const p = port();
    await new SettingsUseCases(p as unknown as SettingsPort).edit(setting(), "90");
    expect(p.put).toHaveBeenCalledWith({ key: "audit.retention_days", version: 4 }, 90);
  });
  it("refuses an out-of-range value without calling the API", async () => {
    const p = port();
    const err = await new SettingsUseCases(p as unknown as SettingsPort)
      .edit(setting(), "5")
      .catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).fields.value).toContain("30");
    expect(p.put).not.toHaveBeenCalled();
  });
});

const draft = (over: Partial<IdentityProviderDraft> = {}): IdentityProviderDraft => ({
  kind: "okta",
  name: "Corporate SSO",
  issuerUrl: "https://corp.okta.com",
  consoleClientId: "console",
  cliClientId: "cli",
  groupsClaim: "",
  clientSecretArn: "",
  isDefault: false,
  ...over,
});
const idpPort = () => ({
  list: vi.fn(async () => []),
  get: vi.fn(),
  create: vi.fn(async () => ({}) as never),
  update: vi.fn(async () => ({}) as never),
  delete: vi.fn(async () => undefined),
});

describe("IdentityProvidersUseCases (M1-N3)", () => {
  it("creates a provider, dropping empty optional fields", async () => {
    const p = idpPort();
    await new IdentityProvidersUseCases(p as unknown as IdentityProvidersPort).create(draft());
    expect(p.create).toHaveBeenCalledWith({
      kind: "okta",
      name: "Corporate SSO",
      issuerUrl: "https://corp.okta.com",
      consoleClientId: "console",
      cliClientId: "cli",
    });
  });

  it.each([
    [{ name: " " }, "name"],
    [{ kind: "saml" }, "kind"],
    [{ issuerUrl: "http://insecure" }, "issuerUrl"],
    [{ consoleClientId: "" }, "consoleClientId"],
    [{ cliClientId: "" }, "cliClientId"],
    [{ clientSecretArn: "not-an-arn" }, "clientSecretArn"],
  ])("refuses %j on %s", async (over, field) => {
    const p = idpPort();
    const err = await new IdentityProvidersUseCases(p as unknown as IdentityProvidersPort)
      .create(draft(over))
      .catch((e) => e);
    expect((err as AppError).fields[field]).toBeTruthy();
    expect(p.create).not.toHaveBeenCalled();
  });

  it("accepts only a Secrets Manager ARN, never a value", async () => {
    const p = idpPort();
    await new IdentityProvidersUseCases(p as unknown as IdentityProvidersPort).create(
      draft({ clientSecretArn: "arn:aws:secretsmanager:eu-west-1:000000000000:secret:idp-x" }),
    );
    expect(p.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientSecretArn: expect.stringContaining("arn:aws:secretsmanager"),
      }),
    );
  });

  it("updates without kind and issuer, clearing the ARN when blank", async () => {
    const p = idpPort();
    await new IdentityProvidersUseCases(p as unknown as IdentityProvidersPort).update(
      { id: "idp_1", version: 3 },
      draft(),
    );
    const [ref, patch] = p.update.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(ref).toEqual({ id: "idp_1", version: 3 });
    expect(patch).not.toHaveProperty("kind");
    expect(patch).not.toHaveProperty("issuerUrl");
    expect(patch.clientSecretArn).toBeNull();
  });

  it("disables, enables, defaults and deletes against the held version", async () => {
    const p = idpPort();
    const uc = new IdentityProvidersUseCases(p as unknown as IdentityProvidersPort);
    await uc.setEnabled({ id: "idp_1", version: 3 }, false);
    await uc.makeDefault({ id: "idp_1", version: 3 });
    await uc.delete({ id: "idp_1", version: 3 });
    expect(p.update).toHaveBeenNthCalledWith(1, { id: "idp_1", version: 3 }, { enabled: false });
    expect(p.update).toHaveBeenNthCalledWith(2, { id: "idp_1", version: 3 }, { isDefault: true });
    expect(p.delete).toHaveBeenCalledWith({ id: "idp_1", version: 3 });
  });
});
