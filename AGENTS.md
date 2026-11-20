# AGENTS.md

Rules for AI agents and human contributors working in this repository.

## Project summary

`enterprise-agent-factory-service-website` is the TypeScript part of the Enterprise Agent Factory Service
(AFS). It is a pnpm workspace with two packages:

- `packages/sdk` — **`@afs/sdk`**, the accelerator SDK: a typed, ergonomic wrapper over the AFS REST API
  for the console, pipelines and other TypeScript consumers.
- `apps/console` — **`@afs/console`**, the web management console, built with clean architecture on top
  of `@afs/sdk`.

It is one child of the [enterprise-agent-factory-service](https://github.com/stainedhead/enterprise-agent-factory-service) root. The
requirements and **the console UI design by role** are in that root's
`enterprise-agent-factory-service-initial-PRD.md` (mockups in `docs/ui/`); the architecture is its
`docs/solution-design.md`. The API, its RBAC and its OpenAPI
contract live in [enterprise-agent-factory-service-restapi](https://github.com/stainedhead/enterprise-agent-factory-service-restapi)
(`api/openapi.yaml`).

Status: scaffolded. The SDK has a base client and error mapping; the console has one use case
(API health) wired through every layer.

## Toolchain

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 or later (`.nvmrc`) | |
| pnpm | 12.21.0 | Pinned in `packageManager`; run `corepack enable` once |
| TypeScript | 7.0.2 | The native compiler. Used for type-checking and SDK declaration builds only |
| Biome | 2.6.8 | Lint and format. **Do not add ESLint or Prettier** (see below) |
| Vitest | 5.1.1 | Unit and component tests |
| Vite | 8.3.8 | Console dev server and bundler |
| React | 19.3 | Console UI |

**TypeScript 7 rules.** `tsc` is the Go-native compiler. Tools that load the TypeScript JavaScript API
(typescript-eslint type-aware rules, ts-node, ts-morph, older `vite-plugin-checker`) may not work with
it; do not add them without checking. Bundling and test transforms go through Vite/Vitest, never `tsc`.
Type-checking is always `tsc --noEmit` (or `tsc -p tsconfig.build.json` for SDK declarations).

## Layout

```
packages/sdk/
  src/client.ts            AfsClient: base request, auth header, error mapping
  src/errors.ts            AfsError and error codes
  src/generated/           types generated from api/openapi.yaml (not hand-edited; added with the first resource)
  src/resources/           ergonomic per-resource clients (teams, agents, secrets, ...) as they are built
apps/console/src/
  domain/                  entities, value objects, policies (pure TypeScript)
  application/ports/       interfaces the outer layers implement
  application/usecases/    one class per use case
  infrastructure/          adapters implementing ports: @afs/sdk, OIDC session, browser storage
  presentation/            React components, view models, hooks, routes
  main/                    composition root: builds adapters, wires use cases, renders
docs/  user-docs/  specs/
```

## Console UI rules

- **Familiar to AWS console users.** Follow the PRD's design principles: dark global header with search,
  environment and identity; left navigation; breadcrumbs; page header with *Info* and right-aligned
  actions; tables with filter, pagination and preferences; one primary action per page; *Actions*
  dropdown; wizards with a review step; status as dot + word. Match the mockups in the root `docs/ui/`.
- **Role-aware.** Show the active role and team in the header. Disable (do not hide) actions the role
  cannot perform, with a tooltip naming the role required; hide admin-only areas from team roles.
- **Scriptable.** Create forms show the equivalent `afs` CLI command.
- **Accessible.** WCAG 2.2 AA.

## Clean architecture rules (console)

- **Dependency rule.** `presentation` → `application` → `domain`. `infrastructure` → `application` →
  `domain`. Only `main/` imports `infrastructure`. `domain` and `application` import neither React nor
  `@afs/sdk`. `presentation` never imports `@afs/sdk` or `infrastructure`; it calls use cases from
  context. `src/architecture.test.ts` enforces this and must stay green; extend it, never weaken it.
- **Use cases are the API of the UI.** Components call use cases; use cases call ports. Server-state
  caching (for example TanStack Query) lives in `presentation`, wrapping use cases.
- **RBAC in the UI is UX only.** `domain/permission.ts` mirrors `internal/authz` in the Go repo and
  is fed by `GET /v1/me`. Use it to hide or disable controls, with a tooltip saying which role is needed.
  Always handle `AfsError.isAccessDenied` from the API as the real answer. Keep the permission list in
  step with the Go matrix: a change there is a change here in the same cycle.
- **Secrets.** A secret value lives only in the input field while a create or rotate form is submitted.
  Never store it in state managers, URLs, logs, analytics or local storage. The UI shows names,
  references and metadata only.
- **Auth.** OIDC authorization code + PKCE. Tokens in memory only, never `localStorage`.

## SDK rules

- Zero runtime dependencies; uses `fetch` (injectable for tests and Node).
- Public surface exported only from `src/index.ts`. Every export documented with TSDoc.
- Wire types come from the OpenAPI contract in `enterprise-agent-factory-service-restapi`. When the contract changes,
  regenerate `src/generated/`, then adapt `src/resources/`. Never hand-edit generated files.
- Mirror API conventions: `maxResults`/`nextToken` pagination exposed as async iterators, `If-Match`
  for updates, `Idempotency-Key` for creates, `AfsError` with `code`, `status` and `requestId`.
- Semver. A breaking change to the public surface is a major version.

## TDD: Red → Green → Refactor

All three phases are mandatory; refactor is not optional.

1. **Red:** write a failing test and check it fails for the right reason.
2. **Green:** the least code that passes.
3. **Refactor:** remove duplication, improve names, simplify; rerun tests after each change.

- Tests sit next to the code as `<name>.test.ts(x)`.
- `domain` and `application` hold ≥ 90% coverage. Use-case tests use in-memory fake ports.
- SDK tests inject a fake `fetch`; no test calls a real API.
- Every permission rule gets a denied-case test, not only the allowed case.

## Quality gate

All of these must pass before every commit (`pnpm gate` runs them in order):

```bash
pnpm install --frozen-lockfile
pnpm lint         # biome check . (format + lint)
pnpm typecheck    # tsc 7 --noEmit in every package
pnpm test         # vitest run in every package
pnpm build        # SDK declarations + console bundle
```

`pnpm format` applies Biome fixes. Lint, type, test or build failures: fix before going further.

## Code design review (before every commit)

- [ ] Dependency rule holds (`architecture.test.ts` green, no new exceptions)
- [ ] Controls that change state are gated by `can(...)` and still handle `AccessDenied` from the API
- [ ] No secret value in state, URL, storage or logs; no token in `localStorage`
- [ ] No `any`; external data is narrowed at the infrastructure edge
- [ ] SDK public surface documented and exported from `src/index.ts` only
- [ ] Accessible: labels on inputs, roles on status and alert regions, keyboard reachable
- [ ] No hardcoded endpoints, tenant ids or credentials (use `VITE_*` config)

Critical or important findings (security, authorization, secret handling) are fixed before commit.

## Agent workflow

1. **Understand:** read the root PRD (section 5 is the UI by role), `docs/solution-design.md`, this file
   and the active spec.
2. **Plan:** name the affected layers and packages.
3. **Red → Green → Refactor.**
4. **Quality gate:** `pnpm gate`.
5. **Design review:** the checklist above.
6. **Document:** `docs/` for architectural changes, `user-docs/` for SDK or console usage changes.
7. **Update status:** `specs/<feature>/status.md` after every task. Mandatory.
8. **Final verify:** rerun the quality gate.

## user-docs/ rule

`user-docs/` holds only files that help someone install and use `@afs/sdk` or the console: getting
started, configuration, examples, troubleshooting. It is not for design, requirements, spec or process
material, and must not link into `specs/`.

## Git

Clear commit messages that reference the spec directory when there is one. Commit `pnpm-lock.yaml`.
Do not commit `node_modules/`, `dist/`, coverage or `.env` files. Work on a branch and open a pull
request into `main`.

## Dev-Flow Skills

The following skills are available for the developer workflow. Invoke them with the listed slash command.

| Skill | Invocation | Purpose |
|---|---|---|
| `init-dev-flow` | `/init-dev-flow` | One-time repo setup; updates AGENTS.md |
| `create-prd` | `/create-prd [title]` | Interactive PRD authoring; writes to repo root |
| `review-prd` | `/review-prd [file]` | PRD quality review |
| `create-spec` | `/create-spec [prd-file]` | Spec creation from PRD; YYMMDD-prefixed directory |
| `review-spec` | `/review-spec [spec-dir]` | Spec quality review |
| `archive-spec` | `/archive-spec [spec-dir]` | Move completed spec to specs/archive/ |
| `implm-frm-prd` | `/implm-frm-prd [prd-file]` | Implement from PRD (11 steps) |
| `implm-frm-change-dtls` | `/implm-frm-change-dtls [ticket-or-desc]` | Implement from ticket or description (12 steps) |
| `implm-from-spec` | `/implm-from-spec [spec-dir]` | Full 11-step orchestrated implementation |
| `create-review` | `/create-review` | Code and design review artifact |
| `review-code` | `/review-code` | Code review of current branch |
| `write-flow-analys` | `/write-flow-analys [spec-dir]` | Process analysis report (final step of implm-from-spec) |
