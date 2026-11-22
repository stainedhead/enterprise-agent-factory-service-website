# Configuration reference

## Console runtime configuration (`/config.json`)

The console is built once and configured at runtime. At start-up it fetches `/config.json` (never from cache)
and validates it. If the file is missing, unreachable or invalid, the console shows the problems instead of
starting. There are no per-environment build variables.

| Key | Type | Required | Meaning |
|---|---|---|---|
| `apiUrl` | string (http or https URL) | yes | Origin of `afs-api`, for example `https://afs.example.internal`. |
| `environmentName` | string | yes | Shown in the header so people know which environment they are in. |
| `redirectUri` | string (URL) | yes | OIDC redirect, `<console origin>/auth/callback`. Must be registered with the IdP. |
| `providersFallback` | array | no | Sign-in providers to offer when the API's provider list cannot be read. Each entry: `id`, `kind`, `name`, `issuerUrl`, `consoleClientId`, `isDefault`. |
| `telemetryUrl` | string (URL) | no | Where web vitals (LCP, INP, CLS) are sent. Omit to turn telemetry off. |
| `idleTimeoutMinutes` | integer, 5 to 720 | no | Idle time before the session ends. Default 60. |

Example:

```json
{
  "apiUrl": "https://afs.example.internal",
  "environmentName": "staging",
  "redirectUri": "https://console.example.internal/auth/callback",
  "idleTimeoutMinutes": 30
}
```

The JSON Schema is `apps/console/deploy/config.schema.json`. Unknown keys are allowed and ignored. Use
placeholder hosts like the above in documentation and tickets; never put credentials or tokens in `config.json`,
it is public.

## Deploy: security headers

`apps/console/deploy/response-headers-policy.json` lists the response headers for the console's distribution.
Replace the placeholders from the environment's `config.json`:

| Placeholder | Value |
|---|---|
| `<apiUrl>` | origin of `apiUrl` |
| `<issuers>` | space-separated origins of every sign-in provider issuer |
| `<telemetryUrl>` | origin of `telemetryUrl`, or remove it when telemetry is off |

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' <apiUrl> <issuers> <telemetryUrl>; frame-src <issuers>; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Referrer-Policy` | `no-referrer` |
| `X-Content-Type-Options` | `nosniff` |

If you change the API origin or add an identity provider, update `connect-src` and `frame-src` with it, or
sign-in and API calls are blocked by the browser.

## Deploy: caching and routing

`apps/console/deploy/cache-behaviors.json`:

| Path | Cache-Control |
|---|---|
| `/assets/*` | `public, max-age=31536000, immutable` (hashed file names) |
| `/index.html` | `no-cache` |
| `/config.json` | `no-cache` |

Single-page routing: answer 403 and 404 with `/index.html` and status 200.

## SDK client options (`createAfs` and `AfsClient`)

| Option | Meaning |
|---|---|
| `endpoint` | Base URL of `afs-api`, no trailing slash. Required. |
| `auth` | `apiKey("afsk_...")` or `bearer(supplier)`. |
| `fetch` | Custom `fetch` for tests or non-browser runtimes. Defaults to `globalThis.fetch`. |
| `retry` | `{ maxRetries, baseMs, ... }` for 429, 503 and network errors; `Retry-After` is honored. |
| `onDebug` | Receives request, response and retry events. Bodies are never included and `Authorization` is redacted. |
| `onContractMismatch` | Called once when the server reports a newer contract version than the SDK was built from. |
| `idempotencyKey` | Overrides the generated `Idempotency-Key` for creates. |

Per-call options (`CallOptions`) include an `AbortSignal` and retry overrides.

## Publishing the SDK (maintainers)

Push a tag `sdk-v<version>` (for example `sdk-v0.3.0`) or run the release workflow manually. The workflow
publishes `@stainedhead/afs-sdk` with the job's own token; no secret is stored. See [sdk.md](sdk.md) for consumers.
