# Installing the SDK from GitHub Packages

`@afs/sdk` is published to GitHub Packages as **`@stainedhead/afs-sdk`**. GitHub Packages requires the npm scope
to match the owner of the repository, so the published name differs from the workspace name `@afs/sdk`.

## Authenticate

Create a personal access token with the `read:packages` scope (and SSO authorization for the organization if
it uses SSO). Put it in your own user-level `~/.npmrc`, never in a repository:

```ini
@stainedhead:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Export `GITHUB_TOKEN` in your shell, or use `NODE_AUTH_TOKEN` in CI. A project that only needs the scope mapping
can commit this single line as its `.npmrc` (no token in it):

```ini
@stainedhead:registry=https://npm.pkg.github.com
```

## Install

```bash
bun add @stainedhead/afs-sdk
# or: npm install @stainedhead/afs-sdk
```

```ts
import { createAfs } from "@stainedhead/afs-sdk";
```

## Keep the `@afs/sdk` import name

Use an npm alias so existing imports keep working:

```json
{
  "dependencies": {
    "@afs/sdk": "npm:@stainedhead/afs-sdk@^0"
  }
}
```

`import { createAfs } from "@afs/sdk"` then resolves to the published package. The alias needs the same
`.npmrc` registry line and a token that can read the package.

## Reports

`createReports(client)` returns typed team, agent and service reports. Rows carry the API's measure names; `asCsv()`
returns the CSV body exactly as the API sends it.

```ts
import { AfsClient, createReports } from "@afs/sdk";

const reports = createReports(new AfsClient({ baseUrl, auth }));
const costs = await reports.team("team_01...", "costs", { range: "30d", groupBy: ["day", "model"] });
const csv = await reports.team("team_01...", "usage", { range: "7d" }).asCsv();
```

## Model endpoints and routes

Contract 1.5.0 adds OpenAI-compatible model endpoints reached through each team's gateway. The generated resources
are `adminModelEndpoints` (catalog, prices, credentials, federation, the teams of an endpoint),
`adminEndpointPriceProposals`, `adminTeams.putGatewaySettings` and `teams(client).modelEndpoints` (a team's routes,
its selection and its own endpoints). `createInferenceProviders` adds the provider switch helpers, and
`createReports` the inference report. Credential values are write-only: send them once, they never come back.

```ts
import { AfsClient, adminModelEndpoints, createInferenceProviders, createReports, money, teams } from "@afs/sdk";

const client = new AfsClient({ baseUrl, auth });
for await (const e of adminModelEndpoints(client).list({ includeTeams: true })) console.log(e.slug, e.enabled);

// a team's routes: items plus the gateway settings on the first page's extras
const page = await teams(client).modelEndpoints.list("team_01...").first();
await teams(client).modelEndpoints.putSelections("team_01...", { endpointIds: ["mep_01..."] });

// prices are decimal strings in USD per million tokens
await adminModelEndpoints(client).createPrice("mep_01...", {
  modelName: "chat-large",
  effectiveFrom: "2026-12-01T00:00:00Z",
  inputUsdPerMtok: money("2.00"),
  outputUsdPerMtok: money("8.00"),
});

// provider policy: preview, then turn off; Bedrock needs a fallback route model selected for every team
const providers = createInferenceProviders(client);
const preview = await providers.impactOf("bedrock", {
  reason: "Enterprise policy",
  fallbackModel: "openai-prod/chat-large",
  selectForAllTeams: true,
});
console.log(preview.impact);

// the inference report: calls, errors, tokens, cost and latency by route, model, agent or time
const r = await createReports(client).teamInference("team_01...", { range: "mtd", groupBy: ["route"] });
```

`routeBaseUrlEnv("openai-prod")` gives `AFS_LLM_OPENAI_PROD_BASE_URL`, the variable an agent reads for a route.

## Versions

Releases are cut by pushing a tag `sdk-v<version>` (for example `sdk-v1.0.1`); the version is taken from the tag.
Pull requests that touch the SDK run a publish dry run and publish nothing.
