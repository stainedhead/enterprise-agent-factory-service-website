# enterprise-agent-factory-service-website

TypeScript for the Enterprise Agent Factory Service, as a Bun workspace:

- **`@afs/sdk`** (`packages/sdk`) — the accelerator SDK: a typed wrapper over the REST API.
- **`@afs/console`** (`apps/console`) — the web management console, built with clean architecture on the
  SDK, for service admins, team-admins and team viewers.

Part of [enterprise-agent-factory-service](https://github.com/stainedhead/enterprise-agent-factory-service);
the console screens by role are in its initial PRD.

**Status:** scaffolded. The SDK has its base client and error mapping; the console wires one use case
(API health) through every layer, with a test that enforces the dependency rule.

## Toolchain

Bun 1.4 (runtime and package manager; Node.js 22+ as fallback), TypeScript 7.0, Vite 8, Vitest 5, Biome 2, React 19.

```bash
bun install
bun run gate                           # lint, typecheck, test, build
cp apps/console/.env.example apps/console/.env.local
bun run --filter @afs/console dev      # http://localhost:5173
```

Contributor and agent rules: [AGENTS.md](AGENTS.md). Why this repository exists: [INTENT.md](INTENT.md).
