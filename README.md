# enterprise-agent-factory-service-website

TypeScript for the Enterprise Agent Factory Service, as a pnpm workspace:

- **`@afs/sdk`** (`packages/sdk`) — the accelerator SDK: a typed wrapper over the REST API.
- **`@afs/console`** (`apps/console`) — the web management console, built with clean architecture on the
  SDK, for service admins, team-admins and team viewers.

Part of [enterprise-agent-factory-service](https://github.com/stainedhead/enterprise-agent-factory-service);
the console screens by role are in its initial PRD.

**Status:** scaffolded. The SDK has its base client and error mapping; the console wires one use case
(API health) through every layer, with a test that enforces the dependency rule.

## Toolchain

Node.js 22+, pnpm 12 (`corepack enable`), TypeScript 7.0, Vite 8, Vitest 5, Biome 2, React 19.

```bash
corepack enable
pnpm install
pnpm gate                      # lint, typecheck, test, build
cp apps/console/.env.example apps/console/.env.local
pnpm --filter @afs/console dev # http://localhost:5173
```

Contributor and agent rules: [AGENTS.md](AGENTS.md). Why this repository exists: [INTENT.md](INTENT.md).
