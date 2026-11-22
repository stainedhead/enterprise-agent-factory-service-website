# enterprise-agent-factory-service-website

**The TypeScript side of the [Enterprise Agent Factory Service](https://github.com/stainedhead/enterprise-agent-factory-service):
the `@afs/sdk` accelerator SDK and the web management console**, as a Bun workspace:

- **`@afs/sdk`** (`packages/sdk`): a typed, zero-dependency wrapper over the REST API, generated from the
  OpenAPI contract, for the console, pipelines and any TypeScript consumer.
- **`@afs/console`** (`apps/console`): the web console for service admins, team admins, team viewers and the
  security operator, familiar to anyone who uses the AWS Management Console.

| | |
|---|---|
| **Use it** | [Getting started](user-docs/getting-started.md) · [Using the console](user-docs/console.md) · [Console examples](user-docs/console-examples.md) · [Installing the SDK](user-docs/sdk.md) · [SDK examples](user-docs/sdk-examples.md) · [Configuration](user-docs/configuration.md) |
| **Understand it** | [Product summary](docs/product-summary.md) · [Product details](docs/product-details.md) · [Technical details](docs/technical-details.md) · [Decisions](docs/architectural-decision-record.md) |
| **Change it** | [CONTRIBUTING.md](CONTRIBUTING.md) · [AGENTS.md](AGENTS.md) · [API contract](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/docs/contracts/api-contract.md) |

![Service dashboard](docs/images/screenshots/01-admin-dashboard.png)

## The console

33 screens, each role-aware: the header shows the active role and team, actions a role cannot take are
disabled with a tooltip naming the role required, and create forms show the equivalent `afs` command. These
are real screenshots of the built console, captured by the Playwright suite against its fake API.

| Teams (service admin) | Team overview (team admin) |
|---|---|
| ![Teams](docs/images/screenshots/02-admin-teams.png) | ![Team overview](docs/images/screenshots/06-team-overview.png) |
| **Agents** | **Create agent, with the equivalent CLI command** |
| ![Agents](docs/images/screenshots/07-team-agents.png) | ![Create agent](docs/images/screenshots/08-create-agent.png) |
| **Secrets: write-only values** | **Budget and usage** |
| ![Secrets](docs/images/screenshots/09-team-secrets.png) | ![Budget](docs/images/screenshots/10-team-budget.png) |
| **Members and access** | **Team viewer: read only** |
| ![Members](docs/images/screenshots/11-team-members.png) | ![Viewer overview](docs/images/screenshots/12-viewer-overview.png) |
| **Model catalog and pricing** | **Service reports and reconciliation** |
| ![Models](docs/images/screenshots/04-admin-models.png) | ![Service reports](docs/images/screenshots/22-service-reports.png) |
| **Swarm pools and stages** | **CVE work order (security operator)** |
| ![Pools](docs/images/screenshots/27-ta-swarm-pools.png) | ![Work order](docs/images/screenshots/29-sec-work-order-detail.png) |

Every screen, by role: [using the console](user-docs/console.md). To refresh these images, run
`bun run --filter @afs/console docs:screenshots` (it runs the Playwright suite and saves unmasked captures to
`docs/images/screenshots/`; outside the CI image the baseline comparisons may report font differences, and the
captures are saved either way).

## Architecture

![Console and SDK](docs/images/website-architecture.svg)

RBAC in the UI is UX only: `domain/permission.ts` mirrors the API's matrix and is fed by `GET /v1/me`, and an
`AccessDenied` from the API is always the real answer. Tokens stay in memory; a secret value lives only in its
input field while the form is submitted.

### Where it fits

![Architecture overview](docs/images/architecture-overview.svg)

## Status

Feature complete. The API contract is pinned to `-restapi` `main` at `d887609` (no release tag yet);
moving the pin to a tag is a `contract:update --ref <tag>` and a regenerate.

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

## Toolchain

Bun 1.4 (runtime and package manager; Node.js 22+ as fallback), TypeScript 7.0, Vite 8, Vitest 5, Biome 2, React 19.

```bash
bun install
bun run gate                           # lint, typecheck, test, build
bun run --filter @afs/console dev      # http://localhost:5173
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the product-wide
[contributing guide](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/CONTRIBUTING.md).
Why this repository exists: [INTENT.md](INTENT.md).
