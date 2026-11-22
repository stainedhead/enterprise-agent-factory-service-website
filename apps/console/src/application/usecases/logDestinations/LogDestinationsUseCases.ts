import { AppError } from "../../errors.js";
import type {
  LogDestinationFull,
  LogDestinationInput,
  LogDestinationPatch,
  LogDestinationsPort,
} from "../../ports/logDestinations.js";

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

/** The settings each kind needs, by `config` key; a credential is never one of them (use a secret). */
export const LOG_KIND_FIELDS: Readonly<
  Record<string, readonly { key: string; label: string; hint?: string }[]>
> = {
  cloudwatch: [
    { key: "logGroup", label: "Log group", hint: "For example /afs/payments" },
    { key: "region", label: "Region", hint: "For example eu-west-1" },
  ],
  s3: [
    { key: "bucket", label: "Bucket" },
    { key: "prefix", label: "Key prefix", hint: "For example logs/payments/" },
  ],
  otlp: [{ key: "endpoint", label: "Endpoint", hint: "An https:// OTLP address" }],
  splunk_hec: [{ key: "endpoint", label: "HEC endpoint", hint: "An https:// address" }],
  datadog: [{ key: "site", label: "Datadog site", hint: "For example datadoghq.com" }],
};

/** Kinds that must name a secret holding their credential (the others use the agent's IAM). */
export const LOG_NEEDS_SECRET: ReadonlySet<string> = new Set(["splunk_hec", "datadog"]);

function check(i: LogDestinationInput): AppError | undefined {
  if (!i.name.trim()) return invalid("name", "Enter a name");
  for (const f of LOG_KIND_FIELDS[i.kind] ?? [])
    if (!String(i.config[f.key] ?? "").trim()) return invalid(f.key, `Enter the ${f.label}`);
  const url = i.config.endpoint;
  if (url !== undefined && !String(url).startsWith("https://"))
    return invalid("endpoint", "Use an https:// address");
  if (LOG_NEEDS_SECRET.has(i.kind) && !i.secretId)
    return invalid("secretId", "Choose the secret that holds the credential");
  return undefined;
}

/** What a destination shows as its delivery. */
export function logDeliveryWord(d: LogDestinationFull): "Failing" | "Delivering" | "Not yet used" {
  if (d.delivery === "failing") return "Failing";
  return d.delivery === "healthy" ? "Delivering" : "Not yet used";
}

/** Log destinations for T14 (M4-L). The API decides access. */
export class LogDestinationsUseCases {
  constructor(private readonly port: LogDestinationsPort) {}

  list(teamId: string, signal?: AbortSignal) {
    return this.port.list(teamId, signal);
  }
  create(teamId: string, input: LogDestinationInput) {
    const bad = check(input);
    return bad ? Promise.reject(bad) : this.port.create(teamId, input);
  }
  update(teamId: string, d: LogDestinationFull, patch: LogDestinationPatch) {
    if (patch.name !== undefined && !patch.name.trim())
      return Promise.reject(invalid("name", "Enter a name"));
    if (patch.config) {
      const bad = check({
        name: patch.name ?? d.name,
        kind: d.kind as LogDestinationInput["kind"],
        config: patch.config,
        secretId: patch.secretId === undefined ? d.secretId : (patch.secretId ?? undefined),
      });
      if (bad) return Promise.reject(bad);
    }
    return this.port.update(teamId, { id: d.id, version: d.version }, patch);
  }
  delete(teamId: string, d: LogDestinationFull) {
    return this.port.delete(teamId, { id: d.id, version: d.version });
  }
}
