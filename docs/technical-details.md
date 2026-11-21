# Technical details

## Toolchain (verified 2026-11-21)

Bun 1.4.4 (runtime, package manager, workspaces via `workspaces` in `package.json`, lockfile `bun.lock`),
Node.js 22+ as fallback runtime, TypeScript 7.0.2, Vite 8.3.8, Vitest 5.1.1, Biome 2.6.8, React 19.3.1.

## Workspace resolution

`@afs/sdk` exports a `source` condition pointing at `src/index.ts`. `tsconfig.base.json` sets
`customConditions: ["source"]` and the console's Vite config adds `source` to `resolve.conditions`, so
the console type-checks and bundles against SDK sources without building the SDK first. Published
consumers resolve `types`/`import` from `dist/`.

## Console layers

`domain` → `application` (use cases, ports) → `infrastructure` (adapters over `@afs/sdk`) →
`presentation` (React) → `main` (composition root). Enforced by `src/architecture.test.ts`.
