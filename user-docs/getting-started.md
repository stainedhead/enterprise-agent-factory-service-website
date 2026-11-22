# Getting started

Two ways in: the web console for people, and `@afs/sdk` for TypeScript code and pipelines. Both talk to the same
AFS REST API, which decides access.

## Prerequisites

- Bun 1.4 (Node.js 22 or later works as a fallback runtime).
- A running `afs-api` and an OIDC identity provider registered for the console, for sign-in.

## Run the console locally

```bash
git clone https://github.com/stainedhead/enterprise-agent-factory-service-website.git
cd enterprise-agent-factory-service-website
bun install
bun run --filter @afs/console dev      # http://localhost:5173
```

The dev server serves `apps/console/public/config.json`, which points at `http://localhost:8080`. Edit it to
target your API and set the `redirectUri` your IdP allows (see [configuration.md](configuration.md)). Open the
console, choose a sign-in provider and sign in. What you see depends on your role.

Build for deployment with `bun run build`; the bundle in `apps/console/dist` is the same for every
environment, and `config.json` is supplied by the host.

## Install the SDK

```bash
echo "@stainedhead:registry=https://npm.pkg.github.com" >> .npmrc
bun add @stainedhead/afs-sdk
```

You need a token with `read:packages` in your user-level `~/.npmrc`; see [sdk.md](sdk.md).

## First call

```ts
import { apiKey, createAfs } from "@stainedhead/afs-sdk";

const afs = createAfs({
  endpoint: process.env.AFS_ENDPOINT_URL ?? "",
  auth: apiKey(process.env.AFS_API_KEY ?? ""),
});

for await (const team of afs.teams.list({ state: "active" })) {
  console.log(team.id, team.name);
}
```

An API key starts with `afsk_`; read it from the environment or a secret store, never from source.

## Next

- [Configuration reference](configuration.md)
- [SDK usage examples](sdk-examples.md)
- [Console usage examples](console-examples.md)

## Contributing

Contributors run `bun run gate` (lock check, contract check, lint, type-check, tests with coverage, build) before
every commit. Rules are in the repository's AGENTS.md.
