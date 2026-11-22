import { type Mock, vi } from "vitest";
import type { ConfigValueRecord, ConfigValuesPort } from "../../application/ports/configValues.js";
import type { SecretRecord, SecretsPort } from "../../application/ports/secrets.js";
import { ConfigUseCases } from "../../application/usecases/config/ConfigUseCases.js";
import { SecretsUseCases } from "../../application/usecases/secrets/SecretsUseCases.js";

export const aSecret = (over: Partial<SecretRecord> = {}): SecretRecord => ({
  id: "sec_1",
  name: "github-bot-key",
  scope: "team",
  boundTo: ["agt_1"],
  rotation: { enabled: true, days: 90 },
  secretsManagerPath: "afs/afs-alpha/github-bot-key",
  lastChangedAt: "2026-11-15T10:00:00Z",
  version: 3,
  ...over,
});

export type FakeSecretsPort = { [K in keyof SecretsPort]: Mock<SecretsPort[K]> };

export function fakeSecretsPort(over: Partial<SecretsPort> = {}): FakeSecretsPort {
  return {
    list: vi.fn(async () => [
      aSecret(),
      aSecret({
        id: "sec_2",
        name: "artifactory-reader",
        boundTo: [],
        rotation: undefined,
        secretsManagerPath: "afs/afs-alpha/artifactory-reader",
      }),
    ]),
    create: vi.fn(async () => aSecret({ id: "sec_9", name: "new-secret", boundTo: [] })),
    update: vi.fn(async () => aSecret()),
    delete: vi.fn(async () => undefined),
    putValue: vi.fn(async () => undefined),
    rotate: vi.fn(async () => aSecret({ version: 4 })),
    ...over,
  } as unknown as FakeSecretsPort;
}

export const aConfigValue = (over: Partial<ConfigValueRecord> = {}): ConfigValueRecord => ({
  name: "LOG_LEVEL",
  source: "namespace",
  value: "info",
  usedBy: ["agt_1"],
  version: 2,
  ...over,
});

export type FakeConfigPort = { [K in keyof ConfigValuesPort]: Mock<ConfigValuesPort[K]> };

export function fakeConfigPort(over: Partial<ConfigValuesPort> = {}): FakeConfigPort {
  return {
    listNamespace: vi.fn(async () => [
      aConfigValue(),
      aConfigValue({ name: "GITHUB_ORG", value: "acme-payments", usedBy: [], version: 1 }),
    ]),
    putNamespace: vi.fn(async () => aConfigValue({ version: 3 })),
    deleteNamespace: vi.fn(async () => undefined),
    listAgent: vi.fn(async () => [
      { name: "LOG_LEVEL", source: "namespace", resolvedValue: "info", usedBy: [], version: 1 },
      {
        name: "MAX_OPEN_PRS",
        source: "literal",
        value: "3",
        resolvedValue: "3",
        usedBy: [],
        version: 1,
      },
    ]),
    putAgent: vi.fn(async () => ({ name: "X", source: "literal", usedBy: [] })),
    deleteAgent: vi.fn(async () => undefined),
    ...over,
  } as unknown as FakeConfigPort;
}

export const secretsServices = (s: SecretsPort) => ({ secrets: new SecretsUseCases(s) });
export const configServices = (c: ConfigValuesPort) => ({ configValues: new ConfigUseCases(c) });
