# Architectural decision record

Decisions local to this repository. Cross-repo decisions live in the root repository.

## ADR-001 SDK and console in one workspace

- Status: Accepted (J, 2026-11-20)
- Context: the console is the SDK's first consumer; both follow the same API contract.
- Decision: `packages/sdk` and `apps/console` in this repository; the SDK stays independently publishable.
- Consequences: SDK changes and the console features that need them land together.

## ADR-002 Biome instead of ESLint and Prettier

- Status: Accepted
- Context: TypeScript 7's native compiler does not expose the JavaScript API that typescript-eslint uses.
- Decision: Biome for lint and format; `tsc` 7 for type-checking only.
- Consequences: revisit when typescript-eslint supports TypeScript 7.

## ADR-003 Clean architecture in the console

- Status: Accepted
- Decision: domain / application / infrastructure / presentation / main, with an automated dependency test.
- Consequences: use cases are testable with fake ports; the SDK is replaceable behind ports.

## ADR-004 Bun as runtime and package manager

- Status: Accepted (J, 2026-11-21; root ADR-012, decision D8)
- Context: J asked to use Bun as the runtime where it is available.
- Decision: Bun 1.4.4 pinned in `packageManager`; Bun workspaces replace `pnpm-workspace.yaml`; `bun.lock`
  replaces `pnpm-lock.yaml`; scripts run with `bun run`, workspace scripts with `bun run --filter`;
  `bun audit` replaces `pnpm audit`. Node.js 22+ stays installed as the fallback runtime for any tool that
  does not run on Bun. Vite, Vitest, Biome and `tsc` 7 are unchanged.
- Consequences: one lockfile format; contributors install Bun instead of enabling corepack. If a tool
  fails on Bun, run it under Node and record the exception here.

## ADR-005 Pinned contract snapshot (WD-2, WD-8)

- Status: Accepted (draft from step 3; confirmed at step 4)
- Context: `-restapi` has no tag; the SDK must be generated reproducibly from its OpenAPI.
- Decision: byte snapshot of `openapi.yaml`, `permissions.json`, `operations.json` in `packages/sdk/contract/`
  with `contract.lock.json` (source, ref, commit, sha256). `contract:check` runs first in the gate;
  `contract:update --ref` is the only way to change it. `CONTRACT_VERSION` is the snapshot's `info.version`.
- Consequences: a hand edit fails the gate; moving to a newer contract is one reviewed commit.

## ADR-006 Own code generator and generated resource modules (WD-3, WD-4, WD-5, WD-6, WD-7)

- Status: Accepted (draft)
- Decision: `tools/codegen` (Bun + `yaml`) emits schemas (open enums, branded `Money`, `readonly` server
  fields), the operation table and one factory per resource, plus the `createAfs` facade. Signature: positional
  path params, then body, then options; `If-Match` operations accept a `Versioned` and derive a reader for the
  rest. `PUT` sends `If-Match` when a version is held; a schema without `version` sends `"1"` (interim).
- Consequences: the method table cannot drift; 189 methods are not hand-maintained.

## ADR-007 Libraries (WD-9)

- Status: Accepted (draft)
- Decision: TanStack Query v5, React Router, `oauth4webapi` (no storage of its own, so tokens stay in
  memory), `web-vitals`; Testing Library with happy-dom, axe-core, Playwright with `@axe-core/playwright`,
  Vitest browser mode. No chart library and no CSS-in-JS (CSS modules, CSP `script-src 'self'`).

## ADR-008 E2E on a fake API and a fake IdP (WD-10)

- Status: Accepted (draft)
- Decision: gated e2e runs against `e2e/fake-afs` (routes and fixtures validated against the pinned OpenAPI;
  `If-Match`, `Idempotency-Key`, 429/503 injection, CORS, request recorder) and a fake OIDC IdP. The e2e build
  (`vite build --mode e2e`) compiles a test-only cache hook and allows an `http` issuer. The dev-environment run
  is the opt-in `e2e:dev` project.
- Consequences: no test calls a real service; CORS and header behaviour are exercised in a real browser.

## ADR-009 Visual baselines (WD-11)

- Status: Accepted (draft)
- Decision: 1440 x 900 at device scale 2 (2880 x 1800, the mockups' size), `maxDiffPixelRatio` 0.005; baselines
  start `pending` in `e2e/visual/approvals.json`; `bun run e2e:report` builds a side-by-side HTML report.
  Baselines are generated in the CI image `mcr.microsoft.com/playwright:v1.63.0-noble`: a head commit containing
  `[regen-baselines]` regenerates and commits them from the `e2e` job.

## ADR-010 Publish the SDK to GitHub Packages as @stainedhead/afs-sdk (J, M2-R1)

- Status: Accepted
- Context: the SDK has to be installable by other repositories and pipelines. GitHub Packages (npm registry
  `https://npm.pkg.github.com`) only accepts a package whose scope equals the repository owner.
- Decision: `.github/workflows/release-sdk.yml` publishes `@stainedhead/afs-sdk` on a tag `sdk-v*` or by manual
  dispatch, with `permissions: contents: read, packages: write` and the job's `GITHUB_TOKEN` (no stored
  secret). It runs the gate and the build, then `packages/sdk/tools/prepare-publish.ts` writes a temporary copy
  of the package with the published name, the version taken from the tag, `publishConfig`, `repository` and
  `files`, and publishes that copy; the workspace package stays `@afs/sdk` so imports and the console do not
  change. Pull requests touching the SDK run `npm publish --dry-run` against the same copy. Consumers keep the
  `@afs/sdk` import name with an npm alias, `"@afs/sdk": "npm:@stainedhead/afs-sdk@^0"` (user-docs/sdk.md).
- Consequences: provenance attestations are not requested because GitHub Packages does not accept them; add
  `--provenance` with `id-token: write` if the registry gains support. The package is restricted to readers of
  the repository's organization, so consumers need a token with `read:packages`.

## ADR-011 Runtime configuration, one build for every environment (D43)

- Status: Accepted
- Context: the same console bundle is promoted across environments behind a CDN.
- Decision: the console reads `/config.json` at boot (`cache: "no-store"`), validated by `parseConfig` against
  `apps/console/deploy/config.schema.json`. No `VITE_*` per-environment variables. The security headers and cache
  behaviors are data files in `apps/console/deploy/` that the platform Terraform consumes.
- Consequences: a bad or missing config fails fast with a readable error page; a change of API origin or issuer
  needs the headers policy placeholders updated with it (user-docs/configuration.md).

## ADR-012 Tokens in memory, drafts in sessionStorage

- Status: Accepted
- Decision: OIDC tokens are never persisted (`oauth4webapi` has no storage). Non-secret form drafts are kept in
  `sessionStorage` only to survive a re-authentication redirect and are removed at boot; secret values are never
  drafted (DV-9). A polite live region reports mutation outcomes (DV-61).
- Consequences: a reload signs the user in again through the IdP; the secret sentinel e2e test fails if a secret
  value reaches storage, a URL or a log.

## ADR-013 Contract pinned to a `-restapi` commit until it tags a release (M6-U1)

- Status: Accepted; the commit pin is done, the tag pin is open
- Context: `-restapi` has no release tag (CQ-1). Its feature branch moved until it merged to `main` (DV-62).
- Decision: re-pin deliberately at each milestone exit (DV-34, DV-40, DV-49, DV-56). M6-U1 pinned `-restapi`
  `main` at `d887609` with `contract:update --ref <sha>`, regenerated, validated typed swarm template secrets in
  `parseSpec` and updated the fixtures. Re-pin to a tag with the same command when `-restapi` tags one.
- Consequences: the SDK and console may lag small upstream contract edits; `contract:check` guarantees the pin is
  what the generated code was built from.

## ADR-014 The console may frame its own callback: `frame-ancestors 'self'` (FR-001)

- Status: Accepted. Departs from archived spec FR-037 and PRD section 6.2 (`frame-ancestors 'none'`).
- Context: an IdP that issues no refresh token makes `OidcClient.renewInFrame` load `prompt=none` in a hidden
  frame of the console (WD-30). The IdP redirects that frame to the console's own `/auth/callback`. Under
  `frame-ancestors 'none'` the browser refuses to render that response, and `frame-src <issuers>` does not allow
  the same-origin redirect target. The frame timed out after 10 s and the session expired once per token
  lifetime. The unit test used a plain element and no policy, so nothing caught it.
- Decision: the policy is `frame-src 'self' <issuers>` and `frame-ancestors 'self'`. Only the console's own
  origin may frame the console; any other origin still cannot. `script-src 'self'` is unchanged, with no
  `unsafe-inline` and no `unsafe-eval`. `build-output.test.ts` and `e2e/specs/quality/csp.spec.ts` assert the
  values, and `e2e/specs/auth/silent-renew.spec.ts` proves renewal through the frame with the fake IdP's
  refresh tokens off, under the deploy headers, with no CSP violation and no session-expired dialog.
- Consequences: clickjacking protection still holds for third-party origins. A same-origin page could frame the
  console, which needs script execution on the console origin and is already outside this control. The platform
  Terraform consumes `apps/console/deploy/response-headers-policy.json`, so the platform must apply the new
  value (including at the CDN, if it overrides `frame-ancestors` or adds `X-Frame-Options: DENY`, which would
  block the frame too; use `SAMEORIGIN`) before relying on frame renewal. IdPs that issue refresh tokens never
  use the frame and are unaffected.

## ADR-015 T3 creates an agent with one mutation per configuration value (FR-021, DV-28, CQ-14)

- Status: Accepted, removal trigger open
- Context: the archived spec's non-goals rule out client-side workflows that combine several mutations, but
  `CreateAgentRequest` takes no configuration values (CQ-14): each value is one `PutAgentConfigValue` after
  `CreateAgent`.
- Decision: T3 is a deliberate exception. `CreateAgent` runs first; configuration values follow one call each.
  A refused value never undoes the agent: the page stays, lists each refused value as `name: message`, says the
  agent was created, and links to the configuration values screen (T7) to retry. The draft is discarded as soon
  as the agent exists (FR-004), so a refused value is fixed in T7, not by resubmitting T3. Covered by the
  `CreateAgentUseCases` test (`configFailures`) and the `CreateAgentPage` partial-failure component test.
- Removal trigger: `-restapi` resolves CQ-14 upstream (configuration values and persona in
  `CreateAgentRequest`); T3 then sends one request and this exception is deleted.
- Consequences: one create can leave an agent without some values. That is visible, recoverable and audited
  per call by the API.

## ADR-016 Paperclip-managed secrets are shown, never edited, and no value reaches the console (WP-D7, WEB-US-48)

- Status: Accepted (approved by the product owner)
- Context: the collaboration agent holds secrets that AFS or Paperclip manage (`managedBy` is `afs` or
  `paperclip`). A person editing one by hand would break the registration the agents depend on.
- Decision: T16 and T4/V2 list managed secrets by name, owner, state and last change only, with a *Managed by*
  column and a refusal text instead of an edit action. Only *Rotate keys* (T16) changes them, through
  `rotateKeys`, and AFS-managed rotation is the one secret write; the reserved names cannot be created in T4.
  A `SecretDetected` refusal from the API is shown as the API's answer and the typed text is not kept (ADR-012,
  secrets rule). No secret value is stored in state, URLs, logs or drafts.
- Consequences: managed secrets are visible and auditable but not editable in the console; the API remains the
  authority and refuses an edit the UI did not predict.

## ADR-017 One orchestration screen set; the tool is a setting, the runtime is not named (ORC-*, OR-D1..D17)

- Status: Accepted (approved by the product owner, 2026-11-23)
- Context: release 1.1.0 gives every team one orchestration agent that runs Paperclip AI or Buzz. T16 and V3 (Paperclip
  only) no longer fit, and the agent runtime behind it must not be named on team screens.
- Decision: T17, T18 and V4 replace T16 and V3, and S12 replaces the S10 *Collaboration* tab. Team screens say
  "Orchestration runtime"; the tool is read from the API and a surface the tool lacks renders N/A. Exposure (Off,
  Private, Public) is a per-surface radio group in which an option above the team limit stays visible and disabled with
  its reason; the API's `reasons` explain every lowered level. Agent configuration is the shared screen; collaboration
  screens are segregated. Model access is one pair of controls (`ExposureControl`, `ModelsControl`) at three levels.
  The orchestration use cases live in `application/usecases/orchestration` behind an `OrchestrationPort`; only
  `main/` wires the SDK adapter, as the dependency rule requires. Routes keep the `/t/:teamId/...` prefix and the old
  `/collaboration` routes redirect.
- Consequences: purple and the diamond mark mean orchestration only (other purple badges became teal). Where the contract
  lags (settings key enum, `ListAgents` role enum) the console uses the contract as pinned and is re-pinned when
  `-restapi` fixes it.
