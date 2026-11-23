import { AppError } from "../../errors.js";
import type {
  CreateIdentityProviderInput,
  IdentityProviderRecord,
  IdentityProviderRef,
  IdentityProvidersPort,
  SettingRecord,
  SettingsPort,
} from "../../ports/settings.js";

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

export type ParsedSetting = { ok: true; value: unknown } | { ok: false; message: string };

/** A setting's value as text for a field: booleans and integers plainly, arrays comma separated. */
export function settingText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Turns what was typed into the setting's JSON value, checking the range, pattern and nullability the
 * contract states (WEB-US-20.1) so the API is only asked with a value it can accept.
 */
export function parseSetting(s: SettingRecord, text: string): ParsedSetting {
  const t = text.trim();
  if (t === "" && s.type !== "array") {
    if (s.nullable) return { ok: true, value: null };
    if (s.type !== "string") return { ok: false, message: "Enter a value" };
  }
  switch (s.type) {
    case "boolean":
      if (t === "true" || t === "false") return { ok: true, value: t === "true" };
      return { ok: false, message: "Choose true or false" };
    case "integer": {
      if (!/^-?\d+$/.test(t)) return { ok: false, message: "Enter a whole number" };
      const n = Number(t);
      if (s.min !== undefined && n < s.min)
        return {
          ok: false,
          message: `Enter ${s.min} or more${s.max !== undefined ? `, up to ${s.max}` : ""}`,
        };
      if (s.max !== undefined && n > s.max)
        return {
          ok: false,
          message: `Enter ${s.max} or less${s.min !== undefined ? `, from ${s.min}` : ""}`,
        };
      return { ok: true, value: n };
    }
    case "array": {
      const items =
        t === ""
          ? []
          : t
              .split(",")
              .map((x) => x.trim())
              .filter((x) => x !== "");
      return { ok: true, value: items };
    }
    case "object": {
      try {
        const v: unknown = JSON.parse(t);
        if (v === null || typeof v !== "object" || Array.isArray(v))
          return { ok: false, message: "Enter a JSON object" };
        return { ok: true, value: v };
      } catch {
        return { ok: false, message: "Enter valid JSON" };
      }
    }
    default: {
      if (s.pattern && !new RegExp(s.pattern).test(t))
        return { ok: false, message: `Must match ${s.pattern}` };
      return { ok: true, value: t };
    }
  }
}

/** Service settings (M1-N2). */
export class SettingsUseCases {
  constructor(private readonly port: SettingsPort) {}

  list(signal?: AbortSignal): Promise<readonly SettingRecord[]> {
    return this.port.list(signal);
  }

  /** Puts an already-typed value (a structured setting such as `orchestration.tools`) with the version held. */
  putValue(setting: SettingRecord, value: unknown): Promise<SettingRecord> {
    return this.port.put({ key: setting.key, version: setting.version }, value);
  }

  /** *Edit*: validates against the setting's own range, then `PutSetting` with the version held. */
  edit(setting: SettingRecord, text: string): Promise<SettingRecord> {
    const parsed = parseSetting(setting, text);
    if (!parsed.ok) return Promise.reject(invalid("value", parsed.message));
    return this.port.put({ key: setting.key, version: setting.version }, parsed.value);
  }
}

const HTTPS = /^https:\/\/[^\s/]+/;
const KINDS = ["okta", "entra_id"];

export interface IdentityProviderDraft {
  readonly kind: string;
  readonly name: string;
  readonly issuerUrl: string;
  readonly consoleClientId: string;
  readonly cliClientId: string;
  readonly groupsClaim: string;
  readonly clientSecretArn: string;
  /** Optional collaboration sign-in client (WEB-US-58). */
  readonly collabClientId?: string;
  readonly collabClientSecretArn?: string;
  readonly isDefault: boolean;
}

/** Identity providers (M1-N3): Okta or Entra ID, with the default chosen among enabled ones. */
export class IdentityProvidersUseCases {
  constructor(private readonly port: IdentityProvidersPort) {}

  list(signal?: AbortSignal): Promise<readonly IdentityProviderRecord[]> {
    return this.port.list(signal);
  }
  /** The provider with the teams using it. */
  get(id: string, signal?: AbortSignal): Promise<IdentityProviderRecord> {
    return this.port.get(id, signal);
  }

  create(d: IdentityProviderDraft): Promise<IdentityProviderRecord> {
    const problem = check(d, true);
    if (problem) return Promise.reject(problem);
    return this.port.create(toInput(d));
  }

  update(ref: IdentityProviderRef, d: IdentityProviderDraft): Promise<IdentityProviderRecord> {
    const problem = check(d, false);
    if (problem) return Promise.reject(problem);
    const { kind: _kind, issuerUrl: _issuer, ...rest } = toInput(d);
    return this.port.update(
      { id: ref.id, version: ref.version },
      {
        ...rest,
        clientSecretArn: d.clientSecretArn.trim() === "" ? null : d.clientSecretArn.trim(),
        collabClientId: d.collabClientId?.trim() ? d.collabClientId.trim() : null,
        collabClientSecretArn: d.collabClientSecretArn?.trim()
          ? d.collabClientSecretArn.trim()
          : null,
      },
    );
  }

  /** *Disable* and *Enable*; the default provider cannot be disabled, and one in use is refused by the API. */
  setEnabled(ref: IdentityProviderRef, enabled: boolean): Promise<IdentityProviderRecord> {
    return this.port.update({ id: ref.id, version: ref.version }, { enabled });
  }

  makeDefault(ref: IdentityProviderRef): Promise<IdentityProviderRecord> {
    return this.port.update({ id: ref.id, version: ref.version }, { isDefault: true });
  }

  delete(ref: IdentityProviderRef): Promise<void> {
    return this.port.delete({ id: ref.id, version: ref.version });
  }
}

function check(d: IdentityProviderDraft, creating: boolean): AppError | undefined {
  if (!d.name.trim()) return invalid("name", "Enter a name");
  if (creating && !KINDS.includes(d.kind)) return invalid("kind", "Choose Okta or Entra ID");
  if (creating && !HTTPS.test(d.issuerUrl.trim()))
    return invalid("issuerUrl", "Enter an https:// issuer URL");
  if (!d.consoleClientId.trim()) return invalid("consoleClientId", "Enter the console client id");
  if (!d.cliClientId.trim()) return invalid("cliClientId", "Enter the CLI client id");
  if (d.clientSecretArn.trim() && !/^arn:aws[a-z-]*:secretsmanager:/.test(d.clientSecretArn.trim()))
    return invalid("clientSecretArn", "Enter a Secrets Manager ARN (arn:aws:secretsmanager:…)");
  const collabId = d.collabClientId?.trim() ?? "";
  const collabArn = d.collabClientSecretArn?.trim() ?? "";
  if (collabArn && !collabId)
    return invalid("collabClientId", "Enter the collaboration client id for this reference");
  if (collabArn && !/^arn:aws[a-z-]*:secretsmanager:/.test(collabArn))
    return invalid(
      "collabClientSecretArn",
      "Enter a Secrets Manager ARN (arn:aws:secretsmanager:…)",
    );
  return undefined;
}

function toInput(d: IdentityProviderDraft): CreateIdentityProviderInput {
  return {
    kind: d.kind,
    name: d.name.trim(),
    issuerUrl: d.issuerUrl.trim(),
    consoleClientId: d.consoleClientId.trim(),
    cliClientId: d.cliClientId.trim(),
    ...(d.groupsClaim.trim() && { groupsClaim: d.groupsClaim.trim() }),
    ...(d.clientSecretArn.trim() && { clientSecretArn: d.clientSecretArn.trim() }),
    ...(d.collabClientId?.trim() && { collabClientId: d.collabClientId.trim() }),
    ...(d.collabClientSecretArn?.trim() && {
      collabClientSecretArn: d.collabClientSecretArn.trim(),
    }),
    ...(d.isDefault && { isDefault: true }),
  };
}
