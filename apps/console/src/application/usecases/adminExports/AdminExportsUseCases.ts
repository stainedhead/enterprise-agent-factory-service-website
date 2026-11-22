import { AppError } from "../../errors.js";
import type {
  AdminExportsPort,
  ExportRecord,
  ImportInput,
  ImportReportRecord,
} from "../../ports/adminExports.js";

/** Bundles over 100 MB are refused before any request (the API limit). */
export const MAX_BUNDLE_BYTES = 100 * 1024 * 1024;

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

/** What an export offers: a link while it is valid, *Expired* after its 7 days, nothing until it succeeds. */
export function downloadState(
  e: ExportRecord,
  nowMs: number,
): "ready" | "expired" | "pending" | "failed" {
  if (e.status === "failed") return "failed";
  if (e.status !== "succeeded") return "pending";
  if (e.downloadExpiresAt && Date.parse(e.downloadExpiresAt) <= nowMs) return "expired";
  return e.downloadUrl ? "ready" : "expired";
}

export const isRunning = (e: ExportRecord): boolean =>
  e.status === "pending" || e.status === "running";

/** `111122223333=444455556666`, one per line or comma-separated; both sides are 12-digit account ids. */
export function parseAccountMap(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of text.split(/[\n,]+/).map((p) => p.trim())) {
    if (!part) continue;
    const m = /^(\d{12})\s*(?:=|->|:)\s*(\d{12})$/.exec(part);
    if (!m) throw invalid("accountMap", `"${part}" is not <source account id>=<target account id>`);
    map[m[1] as string] = m[2] as string;
  }
  return map;
}

/** A stable fingerprint of what a dry run saw, so *Apply* can require the same inputs (FNV-1a over the text). */
export function inputHash(
  bundleText: string,
  accountMap: Readonly<Record<string, string>>,
): string {
  const text = `${bundleText}\u0000${JSON.stringify(Object.entries(accountMap).sort())}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}:${text.length}`;
}

export interface PreparedImport {
  readonly input: ImportInput;
  readonly hash: string;
}

/** Export and import for S11 (M4-E). The API decides access. */
export class AdminExportsUseCases {
  constructor(private readonly port: AdminExportsPort) {}

  list(signal?: AbortSignal) {
    return this.port.list(signal);
  }
  create(teamIds: readonly string[]) {
    return this.port.create(teamIds);
  }

  /** Reads and checks a bundle file's text and the account map, without any request. */
  prepare(file: { size: number; text: string }, accountMapText: string): PreparedImport {
    if (file.size > MAX_BUNDLE_BYTES)
      throw invalid("bundle", "The bundle is larger than 100 MB, the most the API accepts");
    let bundle: unknown;
    try {
      bundle = JSON.parse(file.text);
    } catch {
      throw invalid("bundle", "The file is not valid JSON");
    }
    if (typeof bundle !== "object" || bundle === null || Array.isArray(bundle))
      throw invalid("bundle", "The file is not an export bundle");
    const accountMap = parseAccountMap(accountMapText);
    return {
      input: { bundle: bundle as Record<string, unknown>, accountMap },
      hash: inputHash(file.text, accountMap),
    };
  }

  /** *Dry run*: the plan per resource, nothing applied. */
  dryRun(p: PreparedImport): Promise<ImportReportRecord> {
    return this.port.importBundle(p.input, true);
  }

  /** *Apply*: only for inputs whose dry run was just read (the same hash). */
  apply(p: PreparedImport, planned: string | undefined): Promise<ImportReportRecord> {
    if (planned !== p.hash)
      return Promise.reject(invalid("bundle", "Run a dry run with these inputs before applying"));
    return this.port.importBundle(p.input, false);
  }
}
