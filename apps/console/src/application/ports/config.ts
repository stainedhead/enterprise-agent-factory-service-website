/** A sign-in provider as `ListSignInProviders` and `providersFallback` describe it (no secrets). */
export interface ProviderInfo {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly issuerUrl: string;
  readonly consoleClientId: string;
  readonly isDefault: boolean;
}

/** The runtime configuration from `/config.json` (data-dictionary §6). */
export interface RuntimeConfig {
  readonly apiUrl: string;
  readonly environmentName: string;
  readonly redirectUri: string;
  readonly providersFallback: readonly ProviderInfo[];
  readonly telemetryUrl?: string;
  readonly idleTimeoutMinutes: number;
}

export const DEFAULT_IDLE_MINUTES = 60;

/** The configuration is missing or invalid: the console shows the configuration error page. */
export class ConfigError extends Error {
  readonly reasons: readonly string[];
  constructor(reasons: readonly string[]) {
    super(`Invalid console configuration: ${reasons.join("; ")}`);
    this.name = "ConfigError";
    this.reasons = reasons;
  }
}

export interface ConfigPort {
  load(): Promise<RuntimeConfig>;
}

const isHttpUrl = (v: unknown): v is string => {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Options for {@link parseConfig}. */
export interface ParseConfigOptions {
  /**
   * Accept `http:` for loopback hosts only (`localhost`, `127.0.0.1`, `[::1]`). The `vite dev` server
   * and the e2e build set it; the production build never does (FR-006).
   */
  readonly allowLoopbackHttp?: boolean;
}

/** `https:` always; `http:` only for a loopback host when `allowLoopbackHttp` is set. */
const isSecureUrl = (v: unknown, allowLoopbackHttp: boolean): v is string => {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    if (u.protocol === "https:") return true;
    return allowLoopbackHttp && u.protocol === "http:" && LOOPBACK.has(u.hostname);
  } catch {
    return false;
  }
};

function parseProvider(raw: unknown, i: number, errors: string[]): ProviderInfo | undefined {
  const p = raw as Record<string, unknown> | null;
  if (!p || typeof p !== "object") {
    errors.push(`providersFallback[${i}] must be an object`);
    return undefined;
  }
  const str = (k: string) =>
    typeof p[k] === "string" && (p[k] as string) !== "" ? (p[k] as string) : undefined;
  const id = str("id");
  const kind = str("kind");
  const name = str("name");
  const consoleClientId = str("consoleClientId");
  const issuerUrl = isHttpUrl(p.issuerUrl) ? p.issuerUrl : undefined;
  if (!id || !kind || !name || !consoleClientId || !issuerUrl || typeof p.isDefault !== "boolean") {
    errors.push(
      `providersFallback[${i}] needs id, kind, name, issuerUrl, consoleClientId and isDefault`,
    );
    return undefined;
  }
  return { id, kind, name, issuerUrl, consoleClientId, isDefault: p.isDefault };
}

/** Validates `/config.json`; unknown keys are ignored. Throws {@link ConfigError} listing every problem. */
export function parseConfig(raw: unknown, opts: ParseConfigOptions = {}): RuntimeConfig {
  const errors: string[] = [];
  const secure = (v: unknown) => isSecureUrl(v, opts.allowLoopbackHttp ?? false);
  const c = raw as Record<string, unknown> | null;
  if (!c || typeof c !== "object" || Array.isArray(c))
    throw new ConfigError(["config.json must be a JSON object"]);
  if (!secure(c.apiUrl)) errors.push("apiUrl must be an https URL");
  if (typeof c.environmentName !== "string" || c.environmentName === "")
    errors.push("environmentName is required");
  if (!secure(c.redirectUri)) errors.push("redirectUri must be an https URL");
  if (c.telemetryUrl !== undefined && !secure(c.telemetryUrl))
    errors.push("telemetryUrl must be an https URL");
  let idle = DEFAULT_IDLE_MINUTES;
  if (c.idleTimeoutMinutes !== undefined) {
    const n = c.idleTimeoutMinutes;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 5 || n > 720)
      errors.push("idleTimeoutMinutes must be an integer from 5 to 720");
    else idle = n;
  }
  const providers: ProviderInfo[] = [];
  if (c.providersFallback !== undefined) {
    if (!Array.isArray(c.providersFallback)) errors.push("providersFallback must be an array");
    else
      c.providersFallback.forEach((p, i) => {
        const parsed = parseProvider(p, i, errors);
        if (parsed) providers.push(parsed);
      });
  }
  if (errors.length > 0) throw new ConfigError(errors);
  return {
    apiUrl: (c.apiUrl as string).replace(/\/+$/, ""),
    environmentName: c.environmentName as string,
    redirectUri: c.redirectUri as string,
    providersFallback: providers,
    ...(typeof c.telemetryUrl === "string" && { telemetryUrl: c.telemetryUrl }),
    idleTimeoutMinutes: idle,
  };
}
