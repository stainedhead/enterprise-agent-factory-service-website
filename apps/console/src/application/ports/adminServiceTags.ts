// The service tags port (M4-G): `ListServiceTags`, `PutServiceTag`, `DeleteServiceTag`, and the teams still
// missing a required value (read from each team's tags).

export type ServiceTagMode = "fixed" | "required";

export interface ServiceTagItem {
  readonly key: string;
  readonly mode: string;
  readonly value?: string | null | undefined;
  readonly defaultValue?: string | null | undefined;
  readonly allowedValues?: readonly string[] | null | undefined;
  readonly description?: string | undefined;
  readonly version?: number | undefined;
}

export interface ServiceTagInput {
  readonly mode: ServiceTagMode;
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly allowedValues?: readonly string[] | undefined;
  readonly description?: string | undefined;
}

export interface MissingTagTeam {
  readonly teamId: string;
  readonly displayName: string;
  readonly keys: readonly string[];
}

export interface AdminServiceTagsPort {
  list(signal?: AbortSignal): Promise<readonly ServiceTagItem[]>;
  /** Creates the tag, or replaces it when `version` is given (sent as `If-Match`). */
  put(key: string, version: number | undefined, input: ServiceTagInput): Promise<ServiceTagItem>;
  delete(key: string, version: number | undefined): Promise<void>;
  /** Teams whose tags show one of `keys` as missing. */
  teamsMissing(keys: readonly string[], signal?: AbortSignal): Promise<readonly MissingTagTeam[]>;
}
