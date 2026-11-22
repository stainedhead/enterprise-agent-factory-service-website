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

  describe("transport security (FR-006)", () => {
    it.each(["apiUrl", "redirectUri", "telemetryUrl"])(
      "refuses http for %s and names the field",
      (k) => {
        const raw = { ...base, [k]: "http://example.com/x" };
        expect(() => parseConfig(raw)).toThrow(ConfigError);
        try {
          parseConfig(raw);
        } catch (e) {
          expect((e as ConfigError).reasons.join(" ")).toContain(k);
          expect((e as ConfigError).reasons.join(" ")).toContain("https");
        }
      },
    );
    it("accepts https for every URL", () => {
      expect(parseConfig({ ...base, telemetryUrl: "https://t.example.test/v" }).telemetryUrl).toBe(
        "https://t.example.test/v",
      );
    });
    it("still refuses a non-loopback http URL when insecure loopback is allowed", () => {
      expect(() =>
        parseConfig({ ...base, apiUrl: "http://example.com" }, { allowLoopbackHttp: true }),
      ).toThrow(ConfigError);
    });
    it.each(["http://localhost:8080", "http://127.0.0.1:4010", "http://[::1]:8080"])(
      "allows %s only when insecure loopback is allowed (dev and e2e builds)",
      (url) => {
        expect(() => parseConfig({ ...base, apiUrl: url })).toThrow(ConfigError);
        expect(parseConfig({ ...base, apiUrl: url }, { allowLoopbackHttp: true }).apiUrl).toBe(url);
        expect(
          parseConfig({ ...base, redirectUri: `${url}/auth/callback` }, { allowLoopbackHttp: true })
            .redirectUri,
        ).toBe(`${url}/auth/callback`);
      },
    );
  });
});
