# SDK usage examples

All examples assume:

```ts
import { AfsError, apiKey, bearer, createAfs, createReports, money, waitFor } from "@stainedhead/afs-sdk";

const afs = createAfs({ endpoint: "https://afs.example.internal", auth: apiKey(process.env.AFS_API_KEY ?? "") });
```

Use `bearer(async ({ forceRefresh }) => getToken(forceRefresh))` instead of `apiKey` when you hold an IdP access
token; the supplier is called again once after a 401.

## List with pagination

Lists return an async iterable that fetches pages on demand (`maxResults` and `nextToken` under the hood).

```ts
for await (const agent of afs.agents.list("team_01...")) {
  console.log(agent.id, agent.name);
}

const firstPage = await afs.teams.list({ state: "active", maxResults: 25 }).first();
for await (const page of afs.teams.list().pages()) {
  console.log(page.items.length);
}
```

## Create and update

Creates send an `Idempotency-Key` automatically. Updates need the current `version`; pass the resource you read
and the SDK sends `If-Match` for you.

```ts
const team = await afs.teams.get("team_01...");
const updated = await afs.teams.update(team, { description: "Payments platform agents" });
```

If someone changed the resource in between, the call rejects with `PreconditionFailed` (HTTP 412): read again and
retry.

## Wait for the reconciler

Changes are desired state; the reconciler applies them. `waitFor` polls a status getter every 5 seconds for two
minutes, then every 30, until the phase is reached and `observedGeneration` has caught up.

```ts
const status = await waitFor(() => afs.teams.getStatus("team_01..."), {
  until: ["Ready"],
  timeoutMs: 5 * 60_000,
});
console.log(status.status.phase);
```

It rejects with `WaitError` (`reason` is `failed`, `degraded`, `timeout` or `aborted`) and the last status.

## Reports

```ts
import { AfsClient } from "@stainedhead/afs-sdk";

const reports = createReports(new AfsClient({ endpoint: "https://afs.example.internal", auth: apiKey(key) }));
const costs = await reports.team("team_01...", "costs", { range: "30d", groupBy: ["day", "model"] });
const csv = await reports.team("team_01...", "usage", { range: "7d" }).asCsv();
```

Rows carry the API's measure names; `asCsv()` returns the CSV exactly as the API sends it.

## Team orchestration

```ts
import { createOrchestration, createReports } from "@stainedhead/afs-sdk";

const orch = createOrchestration(afsClient);
const o = await orch.get("team_01...");
const { webUi, webApi } = orch.endpointUrls(o);
// a URL only for a surface that is effective; otherwise null with the first reason (for example "team_limit")
await orch.put({ id: o.teamId, version: o.version }, {
  webUi: { exposure: "private" },
  webApi: { exposure: "off" },
});
await orch.changeTool(o.teamId, { tool: "buzz" });
const rows = await createReports(afsClient).team("team_01...", "collaboration", {
  range: "7d",
  groupBy: ["person"],
});
```

The SDK never calls the tool itself and never takes a tool key. The `collaboration` report is usage only and cannot be
scheduled. `AfsError.isSecretDetected` is true when the API refused a request because it held a secret.
Service admins list every team's endpoints with `admin.orchestrationEndpoints.list(...)`; the first page's
`extras.migration` reports the 1.1.0 backfill.

## Handle errors

```ts
try {
  await afs.teams.get("team_missing");
} catch (e) {
  if (e instanceof AfsError) {
    if (e.isAccessDenied) console.error("Your role cannot do this", e.requestId);
    else console.error(e.code, e.status, e.message, e.requestId);
  } else throw e;
}
```

Quote `requestId` when you ask an operator for help.

## Cancel, debug and retry

```ts
const ctl = new AbortController();
setTimeout(() => ctl.abort(), 10_000);
await afs.teams.list({ signal: ctl.signal }).first();

const traced = createAfs({
  endpoint: "https://afs.example.internal",
  auth: apiKey(process.env.AFS_API_KEY ?? ""),
  retry: { maxRetries: 5 },
  onDebug: (e) => console.debug(e),
});
```

Debug events never carry request or response bodies, and `Authorization` is redacted, so they are safe to log.

## Money

Amounts are USD decimals as strings, branded so they are not mixed with numbers. Build one with `money("12.50")`.

## Secrets

Send a secret value once, from a variable you read from a file, stdin or a secret manager. The API stores a
reference and metadata only and never returns the value. Do not log it or put it in a URL.
