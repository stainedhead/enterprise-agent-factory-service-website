import { AppError } from "../../errors.js";
import type {
  AdminServiceTagsPort,
  MissingTagTeam,
  ServiceTagInput,
  ServiceTagItem,
  ServiceTagMode,
} from "../../ports/adminServiceTags.js";

/** The tags AFS always sets (TAG-1): listed on S9 and never configurable. */
export const SYSTEM_TAGS: readonly { key: string; appliedTo: string }[] = [
  { key: "afs-team-id", appliedTo: "Every team-owned AWS resource and Bedrock call" },
  { key: "afs-team-slug", appliedTo: "Every team-owned AWS resource" },
  { key: "afs-agent-id", appliedTo: "An agent's role, volume, snapshots and Bedrock calls" },
  { key: "afs-agent-name", appliedTo: "An agent's role, volume and snapshots" },
  { key: "afs-pool-id", appliedTo: "A pool's role, queue, access point and Bedrock calls" },
  { key: "afs-pool-name", appliedTo: "A pool's role, queue and access point" },
];

const KEY = /^[A-Za-z0-9 _.:/=+@-]{1,128}$/;
const invalid = (fields: Record<string, string>) =>
  new AppError({
    kind: "validation",
    message: Object.values(fields)[0] ?? "Check the tag",
    fields,
  });

/** Tag keys may not use the reserved prefixes (TAG-1). */
export function keyProblem(key: string): string | undefined {
  const k = key.trim();
  if (!k) return "Enter a tag key";
  if (!KEY.test(k)) return "Use letters, digits and _ . : / = + @ - (up to 128 characters)";
  if (/^(afs-|aws:)/i.test(k)) return "The prefixes afs- and aws: are reserved";
  return undefined;
}

/** Allowed values typed one per line or separated by commas. */
export function parseValues(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,]+/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
}

export interface ServiceTagDraft {
  readonly key: string;
  readonly mode: ServiceTagMode;
  readonly value: string;
  readonly defaultValue: string;
  readonly allowedValuesText: string;
  readonly description: string;
}

/** The draft the dialog starts from for an existing tag. */
export function draftOf(t: ServiceTagItem): ServiceTagDraft {
  return {
    key: t.key,
    mode: t.mode === "fixed" ? "fixed" : "required",
    value: t.value ?? "",
    defaultValue: t.defaultValue ?? "",
    allowedValuesText: (t.allowedValues ?? []).join("\n"),
    description: t.description ?? "",
  };
}

/** Service tags for S9 (M4-G): fixed or required with allowed values and a default. The API decides access. */
export class AdminServiceTagsUseCases {
  constructor(private readonly port: AdminServiceTagsPort) {}

  list(signal?: AbortSignal) {
    return this.port.list(signal);
  }

  /** Checks a draft and returns the request it makes, or the field messages. */
  build(draft: ServiceTagDraft, isNew: boolean): ServiceTagInput | AppError {
    const fields: Record<string, string> = {};
    const kp = isNew ? keyProblem(draft.key) : undefined;
    if (kp) fields.key = kp;
    const allowed = parseValues(draft.allowedValuesText);
    if (draft.mode === "fixed") {
      if (!draft.value.trim()) fields.value = "Enter the value every team gets";
    } else if (
      draft.defaultValue.trim() &&
      allowed.length > 0 &&
      !allowed.includes(draft.defaultValue.trim())
    )
      fields.defaultValue = "The default must be one of the allowed values";
    if (Object.keys(fields).length > 0) return invalid(fields);
    const description = draft.description.trim();
    return draft.mode === "fixed"
      ? { mode: "fixed", value: draft.value.trim(), ...(description && { description }) }
      : {
          mode: "required",
          ...(allowed.length > 0 && { allowedValues: allowed }),
          ...(draft.defaultValue.trim() && { defaultValue: draft.defaultValue.trim() }),
          ...(description && { description }),
        };
  }

  async save(
    existing: ServiceTagItem | undefined,
    draft: ServiceTagDraft,
  ): Promise<ServiceTagItem> {
    const built = this.build(draft, existing === undefined);
    if (built instanceof AppError) throw built;
    return this.port.put((existing?.key ?? draft.key).trim(), existing?.version, built);
  }
  remove(tag: ServiceTagItem) {
    return this.port.delete(tag.key, tag.version);
  }
  /** Teams whose tags miss a value for a required service tag (WEB-US-19.1). */
  missing(
    tags: readonly ServiceTagItem[],
    signal?: AbortSignal,
  ): Promise<readonly MissingTagTeam[]> {
    return this.port.teamsMissing(
      tags.filter((t) => t.mode === "required").map((t) => t.key),
      signal,
    );
  }
}
