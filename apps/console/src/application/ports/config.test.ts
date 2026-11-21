import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "./config.js";

const base = {
  apiUrl: "https://api.example.test/",
  environmentName: "Dev",
  redirectUri: "https://c.example.test/auth/callback",
};
const provider = {
  id: "idp_1",
  kind: "oidc",
  name: "Corp",
  issuerUrl: "https://idp.example.test",
  consoleClientId: "console",
  isDefault: true,
};

describe("parseConfig", () => {
  it("accepts a minimal config, trims the API slash and defaults the idle timeout", () => {
    expect(parseConfig(base)).toEqual({
      ...base,
      apiUrl: "https://api.example.test",
      providersFallback: [],
      idleTimeoutMinutes: 60,
    });
  });
  it("accepts providers, telemetry and idle timeout", () => {
    const c = parseConfig({
      ...base,
      providersFallback: [provider],
      telemetryUrl: "https://t.example.test/v",
      idleTimeoutMinutes: 30,
    });
    expect(c.providersFallback).toEqual([provider]);
    expect(c.telemetryUrl).toBe("https://t.example.test/v");
    expect(c.idleTimeoutMinutes).toBe(30);
  });
  it.each([
    [null, "JSON object"],
    [[], "JSON object"],
    [{ ...base, apiUrl: "ftp://x" }, "apiUrl"],
    [{ ...base, apiUrl: 4 }, "apiUrl"],
    [{ ...base, environmentName: "" }, "environmentName"],
    [{ ...base, redirectUri: "nope" }, "redirectUri"],
    [{ ...base, telemetryUrl: "nope" }, "telemetryUrl"],
    [{ ...base, idleTimeoutMinutes: 4 }, "idleTimeoutMinutes"],
    [{ ...base, idleTimeoutMinutes: 721 }, "idleTimeoutMinutes"],
    [{ ...base, idleTimeoutMinutes: "60" }, "idleTimeoutMinutes"],
    [{ ...base, providersFallback: "x" }, "must be an array"],
    [{ ...base, providersFallback: [null] }, "must be an object"],
    [{ ...base, providersFallback: [{ ...provider, issuerUrl: "x" }] }, "needs id"],
    [{ ...base, providersFallback: [{ ...provider, isDefault: "yes" }] }, "needs id"],
  ])("rejects %j", (raw, fragment) => {
    expect(() => parseConfig(raw)).toThrow(ConfigError);
    try {
      parseConfig(raw);
    } catch (e) {
      expect((e as ConfigError).message).toContain(fragment);
    }
  });
  it("lists every problem at once", () => {
    try {
      parseConfig({});
    } catch (e) {
      expect((e as ConfigError).reasons.length).toBe(3);
    }
  });
});
