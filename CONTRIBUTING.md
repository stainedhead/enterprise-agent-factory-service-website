# Contributing to enterprise-agent-factory-service-website

Start with the product-wide
[contributing guide](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/CONTRIBUTING.md);
this file adds what is specific to the SDK and the console. The full rules are in [AGENTS.md](AGENTS.md).

## Before you start

- Read the root [PRD](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/enterprise-agent-factory-service-initial-PRD.md)
  (section 5 is the console UI by role, with mockups in the root `docs/ui/`), the
  [API contract](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/docs/contracts/api-contract.md)
  and [docs/technical-details.md](docs/technical-details.md).
- Name the layers and packages you will touch. Create or update a spec in `specs/YYMMDD-<feature>/` and keep
  its `status.md` current.

## Where a change goes

| Change | Where |
|---|---|
| The API contract moved | `bun run --filter @afs/sdk contract:update -- --ref <tag or commit>`, then regenerate `src/generated/` (never hand-edit it) |
| SDK helpers | `packages/sdk/src/resources/`, exported only from `src/index.ts`, with TSDoc |
| A console rule or entity | `apps/console/src/domain/` |
| A console use case or port | `apps/console/src/application/` |
| An adapter over the SDK, OIDC or config | `apps/console/src/infrastructure/` |
| A screen or component | `apps/console/src/presentation/` |

The dependency rule (`presentation → application → domain`, `infrastructure → application`, only `main/`
imports `infrastructure`) is enforced by `src/architecture.test.ts`. Extend it; never weaken it.

## Make the change

1. **Red, Green, Refactor.** Tests sit next to the code as `<name>.test.ts(x)`; use-case tests use in-memory
   fake ports; SDK tests inject a fake `fetch`. Every permission rule gets a denied-case test.
2. **Screens** follow the console UI rules in [AGENTS.md](AGENTS.md): AWS-console familiar, role-aware
   (disable, do not hide, with a tooltip naming the role), the equivalent `afs` command on create forms, WCAG
   2.2 AA.
3. **Visual baselines.** A screen change updates its Playwright baseline (`[regen-baselines]` in a commit
   message regenerates them in CI). Refresh the README screenshots with
   `bun run --filter @afs/console docs:screenshots`.

Review checklist:

- [ ] No secret value in state, URL, storage or logs; no token in `localStorage`
- [ ] Controls that change state are gated by `can(...)` and still handle `AccessDenied`
- [ ] No `any`; external data narrowed at the infrastructure edge
- [ ] Labels on inputs, roles on status and alert regions, keyboard reachable
- [ ] No hardcoded endpoints, tenant ids or credentials

## Run the gate

```bash
bun install --frozen-lockfile
bun run gate                                # contract and codegen checks, Biome, tsc, coverage, build, size
bun run --filter @afs/console e2e           # Playwright: flows, axe, visual baselines
```

## Open a pull request

Branch from `main`, reference the spec directory in your commits, and attach before and after screenshots for
any visible change. CI must be green.
