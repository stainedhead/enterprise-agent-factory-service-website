// The service settings and identity provider ports (M1-N2, M1-N3): `GetSettings`, `PutSetting`,
// `ListIdentityProviders`, `GetIdentityProvider`, `CreateIdentityProvider`, `UpdateIdentityProvider`,
// `DeleteIdentityProvider`.

export type SettingType = "string" | "boolean" | "integer" | "array";

export interface SettingRecord {
  readonly key: string;
  readonly value: unknown;
  readonly default: unknown;
  readonly type: SettingType;
  /** The allowed values, as the contract words them (shown beside the field). */
  readonly allowed: string;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly nullable?: boolean | undefined;
  readonly pattern?: string | undefined;
  readonly updatedAt?: string | null | undefined;
  readonly version?: number | undefined;
}

export interface SettingRef {
  readonly key: string;
  readonly version?: number | undefined;
}

export interface SettingsPort {
  list(signal?: AbortSignal): Promise<readonly SettingRecord[]>;
  put(ref: SettingRef, value: unknown): Promise<SettingRecord>;
}

export interface TeamRef {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

export interface IdentityProviderRecord {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly issuerUrl: string;
  readonly consoleClientId: string;
  readonly cliClientId: string;
  readonly groupsClaim: string;
  readonly isDefault: boolean;
  readonly enabled: boolean;
  readonly version: number;
  /** The Secrets Manager ARN of the confidential client's secret; the value never reaches AFS. */
  readonly clientSecretArn?: string | null | undefined;
  /** Only on a single read: the teams using this provider. */
  readonly teams?: readonly TeamRef[] | undefined;
}

export interface CreateIdentityProviderInput {
  readonly kind: string;
  readonly name: string;
  readonly issuerUrl: string;
  readonly consoleClientId: string;
  readonly cliClientId: string;
  readonly groupsClaim?: string;
  readonly clientSecretArn?: string;
  readonly isDefault?: boolean;
  readonly enabled?: boolean;
}

export interface UpdateIdentityProviderInput {
  readonly name?: string;
  readonly consoleClientId?: string;
  readonly cliClientId?: string;
  readonly groupsClaim?: string;
  /** `null` clears the ARN. */
  readonly clientSecretArn?: string | null;
  readonly isDefault?: boolean;
  readonly enabled?: boolean;
}

export interface IdentityProviderRef {
  readonly id: string;
  readonly version: number;
}

export interface IdentityProvidersPort {
  list(signal?: AbortSignal): Promise<readonly IdentityProviderRecord[]>;
  get(id: string, signal?: AbortSignal): Promise<IdentityProviderRecord>;
  create(input: CreateIdentityProviderInput): Promise<IdentityProviderRecord>;
  update(
    ref: IdentityProviderRef,
    patch: UpdateIdentityProviderInput,
  ): Promise<IdentityProviderRecord>;
  delete(ref: IdentityProviderRef): Promise<void>;
}
