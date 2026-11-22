import { type Mock, vi } from "vitest";
import type {
  IdentityProviderRecord,
  IdentityProvidersPort,
  SettingRecord,
  SettingsPort,
} from "../../application/ports/settings.js";
import {
  IdentityProvidersUseCases,
  SettingsUseCases,
} from "../../application/usecases/settings/SettingsUseCases.js";

export const aSetting = (over: Partial<SettingRecord> = {}): SettingRecord => ({
  key: "audit.retention_days",
  value: 365,
  default: 365,
  type: "integer",
  allowed: "30 to 3650",
  min: 30,
  max: 3650,
  updatedAt: "2026-11-20T10:00:00Z",
  version: 4,
  ...over,
});

export const anIdp = (over: Partial<IdentityProviderRecord> = {}): IdentityProviderRecord => ({
  id: "idp_1",
  kind: "okta",
  name: "Corporate SSO",
  issuerUrl: "https://corp.okta.com",
  consoleClientId: "console",
  cliClientId: "cli",
  groupsClaim: "groups",
  isDefault: true,
  enabled: true,
  version: 2,
  clientSecretArn: "arn:aws:secretsmanager:eu-west-1:000000000000:secret:idp-corp",
  ...over,
});

export type FakeSettingsPort = { [K in keyof SettingsPort]: Mock<SettingsPort[K]> };
export type FakeIdpPort = { [K in keyof IdentityProvidersPort]: Mock<IdentityProvidersPort[K]> };

export function fakeSettingsPort(over: Partial<SettingsPort> = {}): FakeSettingsPort {
  return {
    list: vi.fn(async () => [
      aSetting(),
      aSetting({
        key: "gateway.enabled",
        type: "boolean",
        value: true,
        default: true,
        allowed: "true or false",
        min: undefined,
        max: undefined,
        updatedAt: null,
      }),
    ]),
    put: vi.fn(async () => aSetting({ value: 90, version: 5 })),
    ...over,
  } as unknown as FakeSettingsPort;
}

export function fakeIdpPort(over: Partial<IdentityProvidersPort> = {}): FakeIdpPort {
  return {
    list: vi.fn(async () => [
      anIdp(),
      anIdp({
        id: "idp_2",
        name: "Contractors",
        kind: "entra_id",
        isDefault: false,
        clientSecretArn: null,
      }),
    ]),
    get: vi.fn(async (id: string) =>
      anIdp({
        id,
        teams: id === "idp_1" ? [{ id: "team_1", slug: "alpha", displayName: "Alpha" }] : [],
      }),
    ),
    create: vi.fn(async () => anIdp()),
    update: vi.fn(async () => anIdp({ version: 3 })),
    delete: vi.fn(async () => undefined),
    ...over,
  } as unknown as FakeIdpPort;
}

export const settingsServices = (s: SettingsPort, i: IdentityProvidersPort) => ({
  settings: new SettingsUseCases(s),
  identityProviders: new IdentityProvidersUseCases(i),
});
