import { describe, expect, it, vi } from "vitest";
import type { ConfigValuesPort } from "../../ports/configValues.js";
import {
  ConfigUseCases,
  CREDENTIAL_MESSAGE,
  checkConfigName,
  hasNamespaceValue,
} from "./ConfigUseCases.js";

const port = () =>
  ({
    listNamespace: vi.fn(async () => []),
    putNamespace: vi.fn(async () => ({ name: "X", source: "namespace", usedBy: [] })),
    deleteNamespace: vi.fn(async () => undefined),
    listAgent: vi.fn(async () => []),
    putAgent: vi.fn(async () => ({ name: "X", source: "literal", usedBy: [] })),
    deleteAgent: vi.fn(async () => undefined),
  }) as unknown as ConfigValuesPort & Record<string, ReturnType<typeof vi.fn>>;

describe("ConfigUseCases (M2-V1, V2)", () => {
  it.each(["API_TOKEN", "DB_PASSWORD", "CLIENT_SECRET", "SSH_KEY", "MY_API_KEY_ID"])(
    "refuses credential-like %s with a pointer to Secrets",
    (name) => {
      expect(checkConfigName(name)?.fields.name).toBe(CREDENTIAL_MESSAGE);
    },
  );

  it.each(["log_level", "1ABC", "A-B", ""])("refuses the non-UPPER_SNAKE name %j", (name) => {
    expect(checkConfigName(name)?.fields.name).toMatch(/UPPER_SNAKE/);
  });

  it("accepts LOG_LEVEL and sends the held version", async () => {
    const p = port();
    const u = new ConfigUseCases(p);
    expect(checkConfigName("LOG_LEVEL")).toBeUndefined();
    await u.putNamespace("t", "LOG_LEVEL", "debug", {
      name: "LOG_LEVEL",
      source: "namespace",
      usedBy: [],
      version: 4,
    });
    expect(p.putNamespace).toHaveBeenCalledWith("t", { name: "LOG_LEVEL", version: 4 }, "debug");
  });

  it("does not call the API for a credential-like name", async () => {
    const p = port();
    await new ConfigUseCases(p).putNamespace("t", "API_TOKEN", "x").catch(() => undefined);
    expect(p.putNamespace).not.toHaveBeenCalled();
  });

  it("an agent literal needs a value; a namespace reference does not", async () => {
    const p = port();
    const u = new ConfigUseCases(p);
    expect(
      (await u.putAgent("t", "a", "MAX", { source: "literal" }).catch((x) => x)).fields.value,
    ).toBeTruthy();
    await u.putAgent("t", "a", "MAX", { source: "namespace" });
    expect(p.putAgent).toHaveBeenCalledTimes(1);
  });

  it("hasNamespaceValue matches by exact name", () => {
    const ns = [{ name: "LOG_LEVEL", source: "namespace", usedBy: [] }];
    expect(hasNamespaceValue(ns, "LOG_LEVEL")).toBe(true);
    expect(hasNamespaceValue(ns, "LOG")).toBe(false);
  });
});
