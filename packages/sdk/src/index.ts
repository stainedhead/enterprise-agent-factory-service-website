// The only public surface of @afs/sdk.
export { type AuthProvider, apiKey, bearer, type TokenSupplier } from "./core/auth.js";
export { AfsClient, type AfsClientOptions } from "./core/client.js";
export { AfsError, type AfsErrorCode, type AfsErrorInit, AfsNetworkError } from "./core/errors.js";
export { money } from "./core/money.js";
export {
  CollaborationReason,
  FieldReason,
  McpReason,
  type McpReasonValue,
  ModelEndpointReason,
  ModelReason,
  OrchestrationReason,
} from "./core/reasons.js";
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
  type CollaborationEndpointUrl,
  createCollaboration,
} from "./resources/collaboration.js";
export {
  type EffectiveToolGroup,
  effectiveTools,
  isMcpSlug,
  MCP_ENV,
  mcpServerUrlEnv,
  qualifiedMcpName,
} from "./resources/mcp.js";
export {
  createInferenceProviders,
  formatRouteModel,
  isRouteName,
  type ProviderOffInput,
  parseRouteModel,
  type RouteModel,
  routeBaseUrlEnv,
} from "./resources/modelEndpoints.js";
export {
  createOrchestration,
  type EndpointUrl,
  endpointUrls,
  type OrchestrationEndpointUrls,
} from "./resources/orchestration.js";
export {
  type CollaborationReportRow,
  createReports,
  type InferenceGroup,
  type InferenceQueryInput,
  type McpUsageGroup,
  type McpUsageQueryInput,
  type McpUsageView,
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
