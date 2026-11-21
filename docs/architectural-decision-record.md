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
