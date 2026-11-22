import { type AfsClient, adminIdentityProviders, adminSettings } from "@afs/sdk";
import type {
  CreateIdentityProviderInput,
  IdentityProviderRecord,
  IdentityProviderRef,
  IdentityProvidersPort,
  SettingRecord,
  SettingRef,
  SettingsPort,
  UpdateIdentityProviderInput,
} from "../../application/ports/settings.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

const settingRecord = (s: SettingRecord): SettingRecord => ({
  key: s.key,
  value: s.value,
  default: s.default,
  type: s.type,
  allowed: s.allowed,
  min: s.min,
  max: s.max,
  nullable: s.nullable,
  pattern: s.pattern,
  updatedAt: s.updatedAt,
  version: s.version,
});

/** `admin.settings.*` mapped to {@link SettingsPort}. */
export class SdkSettings implements SettingsPort {
  constructor(private readonly client: AfsClient) {}

  list(signal?: AbortSignal): Promise<readonly SettingRecord[]> {
    return wrap(async () =>
      (await adminSettings(this.client).get(sig(signal))).items.map((s) =>
        settingRecord(s as SettingRecord),
      ),
    );
  }
  put(ref: SettingRef, value: unknown): Promise<SettingRecord> {
    return wrap(async () =>
      settingRecord(
        (await adminSettings(this.client).put(
          ref.version === undefined ? ref.key : { id: ref.key, version: ref.version },
          { value },
        )) as SettingRecord,
      ),
    );
  }
}

/** `admin.identityProviders.*` mapped to {@link IdentityProvidersPort}. */
export class SdkIdentityProviders implements IdentityProvidersPort {
  constructor(private readonly client: AfsClient) {}

  list(signal?: AbortSignal): Promise<readonly IdentityProviderRecord[]> {
    return wrap(async () => {
      const out: IdentityProviderRecord[] = [];
      for await (const p of adminIdentityProviders(this.client).list({
        maxResults: 100,
        ...sig(signal),
      }))
        out.push(p);
      return out;
    });
  }
  get(id: string, signal?: AbortSignal): Promise<IdentityProviderRecord> {
    return wrap(() => adminIdentityProviders(this.client).get(id, sig(signal)));
  }
  create(input: CreateIdentityProviderInput): Promise<IdentityProviderRecord> {
    return wrap(() =>
      adminIdentityProviders(this.client).create({
        ...input,
        kind: input.kind as "okta",
      }),
    );
  }
  update(
    ref: IdentityProviderRef,
    patch: UpdateIdentityProviderInput,
  ): Promise<IdentityProviderRecord> {
    return wrap(() =>
      adminIdentityProviders(this.client).update(
        { id: ref.id, version: ref.version },
        { ...patch },
      ),
    );
  }
  delete(ref: IdentityProviderRef): Promise<void> {
    return wrap(() =>
      adminIdentityProviders(this.client).delete({ id: ref.id, version: ref.version }),
    );
  }
}
