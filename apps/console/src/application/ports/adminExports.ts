// The export and import port (M4-E, S11): `ListExports`, `CreateExport`, `GetExport` and `CreateImport`.
// A bundle holds no secret values: only names and references.

export interface ExportRecord {
  readonly id: string;
  readonly status: string;
  readonly teamIds: readonly string[];
  readonly createdAt: string;
  readonly finishedAt: string | undefined;
  readonly sizeBytes: number | undefined;
  readonly sha256: string | undefined;
  /** Pre-signed, valid 7 days. */
  readonly downloadUrl: string | undefined;
  readonly downloadExpiresAt: string | undefined;
  readonly error: string | undefined;
}

export interface ImportTeamPlan {
  readonly slug: string;
  readonly result: string;
  readonly changes: readonly string[];
  readonly error: string | undefined;
}

export interface ImportReportRecord {
  readonly dryRun: boolean;
  readonly teams: readonly ImportTeamPlan[];
}

export interface ImportInput {
  readonly bundle: Readonly<Record<string, unknown>>;
  readonly accountMap: Readonly<Record<string, string>>;
}

export interface AdminExportsPort {
  list(signal?: AbortSignal): Promise<readonly ExportRecord[]>;
  create(teamIds: readonly string[]): Promise<ExportRecord>;
  get(id: string, signal?: AbortSignal): Promise<ExportRecord>;
  importBundle(input: ImportInput, dryRun: boolean): Promise<ImportReportRecord>;
}
