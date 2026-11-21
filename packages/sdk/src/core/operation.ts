/** One row of the generated operation table (src/generated/operations.ts). */
export interface OperationDef {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly pathParams: readonly string[];
  readonly query: readonly string[];
  readonly body: boolean;
  readonly success: readonly number[];
  readonly list: boolean;
  readonly csv: boolean;
  readonly yaml: boolean;
  readonly ifMatch: "required" | "optional" | "none";
  readonly idempotent: boolean;
  /** How to read the current version of a resource addressed by id alone. */
  readonly reader?: {
    readonly operationId: string;
    readonly kind: "get" | "list";
    readonly match: readonly (readonly [string, string])[];
  };
  /** The resource has no `version` property; `If-Match: "1"` is sent (CQ-2 interim). */
  readonly versionless?: true;
  /** Request or response fields that carry secret values; never logged or kept. */
  readonly secretFields: readonly string[];
}
