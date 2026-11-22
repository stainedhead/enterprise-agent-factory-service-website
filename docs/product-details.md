# Product details

## SDK (`@afs/sdk`, published as `@stainedhead/afs-sdk`)

| Capability | Behavior |
|---|---|
| Surface | `createAfs(options)` returns every resource module (teams, agents, secrets, budgets, reports, admin.*, ...). Module factories (`teams(core)`) are tree-shakeable. |
| Generated | Types, the operation table and resource modules are generated from the pinned contract (`src/generated/`, never hand-edited). `CONTRACT_VERSION` is the snapshot's `info.version`. |
| Auth | `apiKey("afsk_...")` or `bearer(supplier)`; the supplier is asked again (`forceRefresh`) once after a 401. Keys and tokens never appear in errors or debug events. |
| Pagination | List calls return `Paginated<T>`: `for await` over items, `.pages()`, `.first()`; CSV-capable lists add `.asCsv()`. |
| Concurrency | `PUT` and `PATCH` send `If-Match`; pass a resource that carries `version` and the SDK derives the id and version. A `412` surfaces as `AfsError` code `PreconditionFailed`. |
| Idempotency | Creates send an `Idempotency-Key` (`crypto.randomUUID()` by default, overridable). |
| Retries | Backoff with jitter for 429, 503 and network errors, honoring `Retry-After`; configurable through `retry`. |
| Errors | `AfsError` with `code`, `status`, `requestId`, `details`; `AfsNetworkError` for transport failures; `isAccessDenied`. |
| Helpers | `waitFor(getStatus, { until, timeoutMs, signal })` polls a status until the phase is reached and `observedGeneration >= generation`; `createReports(client)` gives typed team, agent and service reports with `asCsv()`. |
| Packaging | ESM, TypeScript declarations, TSDoc on every export, a size budget, and a contract replay of the 160 JSON response examples. |

Installation and examples: [user-docs/sdk.md](../user-docs/sdk.md), [user-docs/sdk-examples.md](../user-docs/sdk-examples.md).

## Console

33 screens grouped as follows. Role names are the API's: service admin, team admin, team viewer, security operator.

| Area | Screens |
|---|---|
| Overview | Service dashboard; teams and create team; team overview (viewer version included) |
| People and access | Members and API keys; identity providers; service API keys; security operators |
| Agents | Agents and the agent panel; create agent; agent AWS access and external identities; storage classes and agent templates |
| Secrets and config | Secrets; configuration values; external systems (team, agent, service catalog) |
| Spend | Team budget and usage; model catalog and pricing; reports (team, agent, service) with cost reconciliation and scheduling; cost allocation tags and tag status; team tags |
| Operations | Team and service audit log; team history (activity, audit, config revisions) and restore; notification channels (team and service); log delivery; export and import; team AWS accounts |
| Workloads | Ephemeral teams with pools, stages and guardrails; work orders; swarm templates |

Behavior that applies everywhere: controls the role cannot use are disabled with a tooltip naming the role,
admin-only areas are hidden from team roles, every create form shows the equivalent `afs` command, secret values
live only in the input while a form is submitted, tokens are in memory only, and the shell has one polite live
region for change outcomes. The security operator gets a restricted shell (work orders and swarm templates).

Usage: [user-docs/console.md](../user-docs/console.md).

## Quality

Axe on every screen, keyboard flows, a secret sentinel (no secret value reaches storage, URL or logs), CSP
enforcement and performance budgets run in the Playwright suite against a fake AFS API and a fake OIDC IdP.
Unit coverage is at least 90% on `domain` and `application`.

## Open items

- The contract is pinned to `-restapi` `main` at `d887609` (M6-U1 done). Re-pin to a release tag once `-restapi`
  tags one (CQ-1); `@afs/sdk` 1.0.0 follows that tag.
- Contract questions CQ-13, CQ-14 and CQ-24 (in-use `409` dependents, agent persona field, tag activation time)
  are tracked in the spec; the console works around them as recorded there.
