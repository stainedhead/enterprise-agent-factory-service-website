# enterprise-agent-factory-service-website

TypeScript for the Enterprise Agent Factory Service, as a Bun workspace:

- **`@afs/sdk`** (`packages/sdk`) — the accelerator SDK: a typed wrapper over the REST API.
- **`@afs/console`** (`apps/console`) — the web management console, built with clean architecture on the
  SDK, for service admins, team-admins and team viewers.

Part of [enterprise-agent-factory-service](https://github.com/stainedhead/enterprise-agent-factory-service);
the console screens by role are in its initial PRD.

**Status:** feature work in progress (`feat/website-feature-complete`). `@afs/sdk` 0.3.0 is generated from the
pinned API contract and adds `waitFor` and typed reports (`createReports`). The console has sign-in, the shell and these screens: service
dashboard, teams and create team, team overview (viewer version included), members and API keys, service
settings and identity providers, team history (activity, audit and config revisions), agents and the
agent panel, create agent, secrets, configuration values, external systems (team, agent and service catalog),
storage classes and agent templates, team budget and usage, the model catalog and pricing, reports (team, agent and
service, with cost reconciliation, and scheduling a report to a channel), team and service notification channels, the
service audit log, team AWS accounts and agent AWS access (cross-account roles with trust policies, external
identities), cost allocation tags and team tags (with tag status), log delivery, export and import, restoring a config revision,
ephemeral teams with pools and stages and guardrails, work orders and swarm templates (service admins and the security
operator role), and service API keys and security operators. All 33 screens are built; the quality sweep (axe on every
screen, keyboard flows, secret sentinel, CSP, performance) runs in the Playwright suite. The contract is pinned to a
`-restapi` branch commit until its release tag exists. See [user-docs/console.md](user-docs/console.md).

## Toolchain

Bun 1.4 (runtime and package manager; Node.js 22+ as fallback), TypeScript 7.0, Vite 8, Vitest 5, Biome 2, React 19.

```bash
bun install
bun run gate                           # lint, typecheck, test, build
bun run --filter @afs/console dev      # http://localhost:5173
```

Contributor and agent rules: [AGENTS.md](AGENTS.md). Why this repository exists: [INTENT.md](INTENT.md).
