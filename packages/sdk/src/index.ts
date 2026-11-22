// The only public surface of @afs/sdk.
export { type AuthProvider, apiKey, bearer, type TokenSupplier } from "./core/auth.js";
export { AfsClient, type AfsClientOptions } from "./core/client.js";
export { AfsError, type AfsErrorCode, type AfsErrorInit, AfsNetworkError } from "./core/errors.js";
export { money } from "./core/money.js";
export type {
  CallOptions,
  ContractMismatch,
  DebugEvent,
  Page,
  Paginated,
  PaginatedCsv,
  ReportCall,
  ResponseMeta,
  RetryOptions,
  Versioned,
} from "./core/types.js";
export { metaOf } from "./core/types.js";
export * from "./generated/index.js";
export {
  createReports,
  type ReportGroup,
  type ReportKind,
  type ReportQueryInput,
  type ReportResult,
  type ReportRow,
  type TypedReportCall,
} from "./resources/reports.js";
export {
  WaitError,
  type WaitFailure,
  type WaitOptions,
  type WaitStatus,
  type WaitTarget,
  waitFor,
} from "./resources/wait.js";
