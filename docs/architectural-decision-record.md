# Architectural decision record

Decisions local to this repository. Cross-repo decisions live in the root repository.

## ADR-001 SDK and console in one pnpm workspace

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
