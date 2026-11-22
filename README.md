# enterprise-agent-factory-service-website

TypeScript for the Enterprise Agent Factory Service, as a Bun workspace:

- **`@afs/sdk`** (`packages/sdk`) — the accelerator SDK: a typed wrapper over the REST API.
- **`@afs/console`** (`apps/console`) — the web management console, built with clean architecture on the
  SDK, for service admins, team-admins and team viewers.

Part of [enterprise-agent-factory-service](https://github.com/stainedhead/enterprise-agent-factory-service);
the console screens by role are in its initial PRD.

**Status:** feature complete on `feat/website-feature-complete`. Open item: M6-U1, re-pinning the API contract to a
`-restapi` release tag, which waits for `-restapi` to merge and tag (CQ-1); until then the contract is pinned to a
`-restapi` branch commit.

## What is here

- **`@afs/sdk`** 0.3.0, published to GitHub Packages as **`@stainedhead/afs-sdk`**. Generated from the pinned
  contract: 182 operations in 41 resource modules, async-iterator pagination, `If-Match` and `Idempotency-Key`
  handling, retries, `AfsError`, `waitFor` and typed reports (`createReports`). Zero runtime dependencies.
- **The console**: 33 screens for service admins, team admins, team viewers and the security operator, covering
  teams, members and API keys, agents, secrets and configuration, external systems, budgets and usage, models and
  pricing, reports, notifications and log delivery, audit and history, cost allocation tags, AWS access,
  export and import, ephemeral teams with pools, work orders and swarm templates. Accessibility (axe on every
  screen), keyboard flows, a secret sentinel, CSP and performance run in the Playwright suite.
- **Deploy artifacts** in `apps/console/deploy/`: runtime `config.json` schema, security headers and cache behaviors.

## Documentation

- [Getting started](user-docs/getting-started.md)
- [Configuration reference](user-docs/configuration.md) (runtime `config.json`, deploy headers, SDK options)
- [Using the console](user-docs/console.md) and [console examples](user-docs/console-examples.md)
- [Installing the SDK](user-docs/sdk.md) and [SDK examples](user-docs/sdk-examples.md)
- Design: [docs/product-summary.md](docs/product-summary.md), [docs/product-details.md](docs/product-details.md),
  [docs/technical-details.md](docs/technical-details.md), [docs/architectural-decision-record.md](docs/architectural-decision-record.md)

## Toolchain

Bun 1.4 (runtime and package manager; Node.js 22+ as fallback), TypeScript 7.0, Vite 8, Vitest 5, Biome 2, React 19.

```bash
bun install
bun run gate                           # lint, typecheck, test, build
bun run --filter @afs/console dev      # http://localhost:5173
```

Contributor and agent rules: [AGENTS.md](AGENTS.md). Why this repository exists: [INTENT.md](INTENT.md).
