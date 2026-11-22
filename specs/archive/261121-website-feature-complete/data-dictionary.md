# Data dictionary: `-website` feature complete

| | |
|---|---|
| **Feature** | website-feature-complete |
| **Date** | 2026-11-21 |

Purpose: the data structures this repository defines. Wire shapes are **not** redefined here: they are
generated from the pinned OpenAPI into `packages/sdk/src/generated/schemas.ts` and named exactly as the
OpenAPI's `components/schemas` (`Team`, `Agent`, `Me`, `MeTeam`, `ResourceStatus`, `Money`, …; API
contract §5). This file covers the SDK's own types, the generator's intermediate form, the console domain,
and the files the build and tests read.

## 1. Contract snapshot (`packages/sdk/contract/`)

| File | Content |
|---|---|
| `openapi.yaml` | Byte copy of `-restapi/api/openapi.yaml` |
| `permissions.json`, `operations.json` | Byte copies of `-restapi/api/contract/*.json` |
| `contract.lock.json` | `{ "source": "github.com/stainedhead/enterprise-agent-factory-service-restapi", "ref": "feat/restapi-feature-complete", "commit": "747a4847…", "contractVersion": "1.1.0", "files": { "openapi.yaml": "<sha256>", "permissions.json": "<sha256>", "operations.json": "<sha256>" }, "pinnedAt": "<RFC 3339>" }` |

`contract:check` recomputes each sha256 and fails on any difference. `contract:update --ref <tag|commit>`
fetches the three files from GitHub at that ref, rewrites the lock and runs `codegen`.

## 2. Generator intermediate representation (`tools/codegen/ir.ts`)

```ts
interface OperationIR {
  operationId: string;              // "UpdateTeam"
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;                     // "/v1/teams/{teamId}"
  pathParams: string[];             // ["teamId"] in path order
  queryParams: ParamIR[];           // name, schema, required
  requestBody?: { schema: TypeRef; required: boolean; contentType: "application/json" };
  responses: { status: number; schema?: TypeRef; contentTypes: string[] }[];   // 2xx only
  sdk: { namespace: string[]; method: string };   // from x-afs-sdk "teams.models.list()" → [teams, models], list
  module: string;                   // resource module file: "teams", "admin-settings", ...
  cli: string;                      // x-afs-cli
  permission: string; scope: string; screen: string; priority: "P0" | "P1" | "P2";
  csv: boolean;                     // x-afs-csv
  ifMatch: "required" | "optional" | "none";
  idempotencyKey: boolean;          // POST
  reader?: { operationId: string; match: string[] };   // §3 of research.md
  secretFields: string[];           // body fields never logged (value, secretKey, clientSecret…)
}
```

`secretFields` is derived: request properties named `value` on secret operations, any property whose
schema `description` says write-only, plus an explicit list in `tools/codegen/secret-fields.ts`
(`CreateSecret.value`, `PutSecretValue.value`, `RotateSecret.value`, `Create/UpdateIdentityProvider.clientSecret`,
`CreateApiKey`/`CreateServiceApiKey` response `secretKey`, `CreateLogDestination`/`CreateNotificationChannel`
inline credentials if any). A test fails if a property named like a secret (`value`, `secret*`, `password`,
`token`) on a request body is not in the list or explicitly allowed.

## 3. SDK public types (`packages/sdk/src/core/`)

| Type | Shape | Notes |
|---|---|---|
| `AfsClientOptions` | `{ endpoint; auth?: AuthProvider; fetch?; retry?: RetryOptions; userAgentSuffix?; onDebug?: DebugHook; onContractMismatch?: (info) => void; idempotencyKey?: () => string }` | `endpoint` without trailing slash |
| `AuthProvider` | `bearer(supplier: (opts: {forceRefresh: boolean}) => Promise<string>)` \| `apiKey(key: string)` | API key must start `afsk_` (validated, never echoed) |
| `RetryOptions` | `{ maxRetries = 3; baseMs = 200; capMs = 5000; maxRetryAfterSeconds = 30; random?: () => number; sleep?: (ms, signal) => Promise<void> }` | `random` and `sleep` injectable for tests |
| `CallOptions` | `{ signal?; requestId?; idempotencyKey?; ifMatch?: number \| "read" \| false; maxResults?; nextToken? }` | Per call |
| `ResponseMeta` | `{ status; requestId; etag?; contractVersion?; idempotentReplayed: boolean; appliedToVersion?: number; nextToken?: string }` | Non-enumerable `meta` on every returned object; `void` results expose it through `withMeta()` |
| `Page<T>` | `{ items: T[]; nextToken?: string; meta: ResponseMeta }` | |
| `Paginated<T>` | `AsyncIterable<T> & { pages(): AsyncIterable<Page<T>>; first(): Promise<Page<T>> }` | One request per page |
| `AfsError` | `{ status; code: AfsErrorCode; message; requestId?; details: Record<string, unknown>; retryAfterSeconds?; toJSON() }` + getters `isValidationError`, `isUnauthenticated`, `isAccessDenied`, `isNotFound`, `isConflict`, `isPreconditionFailed`, `isPreconditionRequired`, `isThrottled`, `isUnavailable`, `isInternalError` | `message` ≤ 200 chars of a non-JSON body |
| `AfsErrorCode` | `"ValidationError" \| "Unauthenticated" \| "AccessDenied" \| "NotFound" \| "Conflict" \| "PreconditionFailed" \| "PreconditionRequired" \| "Throttled" \| "InternalError" \| "Unavailable" \| (string & {})` | Open union |
| `AfsNetworkError` | `AfsError` with `status: 0`, `code: "NetworkError"` | Network failure after retries |
| `DebugEvent` | `{ kind: "request" \| "response" \| "retry"; operationId; method; url; headers (Authorization → "[redacted]"); status?; attempt; delayMs?; requestId? }` | Never carries a body |
| `Money` | `string` branded `{ readonly __money: unique symbol }` | Matches `^-?(0\|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$`; never `number` |
| `Versioned` | `{ id: string; version: number }` (or `{ name \| key; version }` for name-keyed resources) | Accepted wherever an id is |
| `WaitForOptions` | `{ until: Phase[]; timeoutMs = 600000; signal?; onPoll? }` | Cadence W-1 |
| `ReportResult<Row>` | `{ range; groupBy: string[]; rows: Row[]; totals: Record<string, unknown>; notes: string[]; asCsv(): Promise<string> }` | `asCsv()` follows `X-Afs-Next-Token`, keeps one header row |

Pinned contract version: `CONTRACT_VERSION` constant generated from the snapshot's `info.version`.

## 4. Console domain (`apps/console/src/domain/`)

| Entity / value | Shape | Rules |
|---|---|---|
| `Me` | `{ principal: {id, type: "user"\|"api_key"\|"workload", email?, name?}; serviceAdmin; securityOperator; servicePermissions: Permission[]; teams: MeTeam[] }` | Contract §5 + F-1 |
| `MeTeam` | `{ teamId; slug; role: "team_admin"\|"team_viewer"\|"workload"; permissions: Permission[] }` | |
| `Permission` | Union of every permission in the catalog (contract §3, 58 entries incl. `teams:read-directory`, `admin:*`, `work-orders:*`, `swarm-templates:read`) | Generated? No: hand-kept, drift-tested against `permissions.json` |
| `Role` | `"team_viewer" \| "team_admin" \| "service_admin" \| "security_operator"` | |
| `CATALOG` | `{ permission, roles[{role, condition?}], notes? }[]` | Used for "Requires <role>" text and the drift test only |
| `can(me, permission, teamId?)` | `boolean` | teamId given: `serviceAdmin` → true; else `permissions[]` of that team. No teamId: `servicePermissions` if present, else `serviceAdmin` → true, `securityOperator` → its column |
| `requiredRoleLabel(permission)` | `"service admin" \| "team-admin" \| "team viewer"` | Lowest role granting it; conditional grants name the service admin when the condition is off |
| `PhaseView` | `{ word: "Pending"\|"Reconciling"\|"Ready"\|"Degraded"\|"Failed"\|"Deleting"\|"Active"\|"Suspended"\|"Deleted"\|"Paused"\|"Enabled"\|"Budget blocked"\|<unknown passthrough>; dot: "blue"\|"green"\|"amber"\|"red"\|"grey" }` | PRD §4.2; unknown phase → grey dot, word as given |
| `PollPolicy` | `nextDelay(phases[], elapsedMs, hidden, retryAfter?) → ms \| "stop"` | 5 s while Pending/Reconciling up to 2 min, then 30 s; Degraded 30 s; Ready/Failed stop; hidden → stop |
| `NavItem` | `{ id; group: "Service"\|"Governance"\|"Platform"\|"Team"\|"Configuration"\|"Cost"\|"History"; label; screen: ScreenId; route; visibleWhen(me, team?) }` | PRD §4.1, all items |
| `ScreenId` | `"S1"…"S11" \| "T1"…"T15" \| "V1" \| "V2" \| "P2"…"P6" \| "AUTH" \| "NOT_FOUND"` | |
| `MoneyAmount` | Decimal arithmetic on `Money` strings via scaled `bigint` (6 fraction digits): `compare`, `add`, `percent`, `format("$1,234.50")` | Never `Number` |
| `CliCommand` | `{ service; operation; args: [flag, value][] }` → `render()` | Built from `x-afs-cli`; flags `--kebab-case`; lists space-separated; JSON for objects; secret fields → `file://<path>` placeholder |
| `SearchIndex` | `{ type: "team"\|"agent"\|"pool"\|"work-order"; id; label; route }[]` → `filter(q)` | ≥ 2 chars, ≤ 10 results grouped by type |
| `Names` | slug/name regex `^[a-z][a-z0-9-]{1,38}[a-z0-9]$`; credential-like config names `*password*`, `*secret*`, `*token*`, `*key*` (case-insensitive) | WEB-US-30.2 |

## 5. Application ports (`apps/console/src/application/ports/`)

One port per area, named after the SDK namespace it fronts, returning domain or generated wire types
re-exported through `application/ports/wire.ts` (type-only re-export from `@afs/sdk` is forbidden by the
dependency rule, so `wire.ts` declares the structural types the use cases need; the SDK adapters map onto
them). Ports: `MePort`, `AuthPort`, `TeamsPort`, `MembersPort`, `ApiKeysPort`, `AgentsPort`, `PoolsPort`,
`IdentityPort`, `SecretsPort`, `ConfigPort`, `ExternalSystemsPort`, `BudgetsPort`, `ReportsPort`,
`DeliveryPort` (log destinations, notification channels), `AuditPort`, `RevisionsPort`, `WorkOrdersPort`,
`SwarmTemplatesPort`, `AdminPort` (one sub-port per `admin.*` namespace), `TelemetryPort`, `ClockPort`,
`PreferencesPort` (provider id, table preferences, dismissed notices).

## 6. Runtime and test files

| File | Shape |
|---|---|
| `/config.json` | `{ apiUrl: string (https URL); environmentName: string; redirectUri: string; providersFallback?: {id, kind, name, issuerUrl, consoleClientId, isDefault}[]; telemetryUrl?: string; idleTimeoutMinutes?: number (default 60, 5–720) }`; unknown keys ignored; invalid → configuration error page |
| `localStorage` keys (non-secret only) | `afs.provider` (provider id), `afs.table.<tableId>` (page size, visible columns), `afs.notice.<id>` (dismissed) |
| `sessionStorage` | `afs.oidc.<state>` = `{codeVerifier, nonce, providerId, returnTo}` only between redirect and callback, then removed |
| Telemetry event | `{ kind: "web-vital" \| "error"; name; value?; route: "/t/:teamId/agents"; build; requestIds?: string[]; ts }` |
| `e2e/visual/approvals.json` | `{ [screenId]: { mockup: "06-ta-team-overview.png"; baseline: "T1.png"; status: "pending" \| "approved"; approvedBy?; approvedAt? } }` |
| `e2e/fake-afs/fixtures/<area>.ts` | `Fixture = { method; path; role?: Role; response: {status, body, headers?} }[]`; every body validated against the OpenAPI response schema at load |
| `e2e/fake-afs/users.ts` | Seeded principals per role: `svc-admin`, `team-admin` (team A), `viewer` (team A), `sec-op`, `api-key-team-admin` |

## 7. Enumerations shown in the UI

Status words (PRD §4.2) only. Team `state` (`active`, `suspended`, `deleting`, `deleted`), pool `state`
(`enabled`, `paused`, `deleting`, `deleted`), `Agent.paused`, role link status (`pending_trust` → *Pending
trust*, `verified` → *Verified*, `failed` → *Failed*, `disabled` → *Disabled*), work order `status` and
`slaState`, export `status`, schedule `lastStatus` render through one `labels.ts` table in `domain`. An
unknown enum value from the API renders as its raw text with a grey dot, never an error (SDK-10).
