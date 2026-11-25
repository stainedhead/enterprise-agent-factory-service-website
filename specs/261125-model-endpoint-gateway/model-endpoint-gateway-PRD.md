# PRD: Team model gateway with OpenAI-compatible model endpoints (website extract)

The approved change PRD is [`model-endpoint-gateway-PRD.md`](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/model-endpoint-gateway-PRD.md)
in the root repository (approved for build by J, 2026-11-25; release 1.2.0 in every repository). This repository
builds its Appendix D.5 (MEG-WEB-1 to MEG-WEB-6), the console part of §12.4, the screens of Appendix A (56 to 68a),
the console share of stories US-62 to US-81 and the test cases TC-UI-01 to TC-UI-11. API contract: the root's
`docs/contracts/api-contract.md` §4.13, v1.5.0 (pinned here from `-restapi` `7d48ea7`).

## Requirements (Appendix D.5)

| ID | Requirement | Proves |
|---|---|---|
| MEG-WEB-1 | `@afs/sdk` regenerated from contract v1.5.0; resource helpers for endpoints, providers and the inference report | TC-UI-08 |
| MEG-WEB-2 | Service admin screens 56 to 60 and 68/68a | TC-UI-01, 07, 11 |
| MEG-WEB-3 | Team-admin screens 61 to 65 | TC-UI-02, 03, 05, 10 |
| MEG-WEB-4 | Team viewer screens 66 and 67, every changing control disabled with the role named | TC-UI-04 |
| MEG-WEB-5 | Permission mirror with the four new permissions; credential values never in state, URL, storage or logs | TC-UI-06 |
| MEG-WEB-6 | Visual baselines for the new screens, for J's approval | TC-UI-07 |

## Stories

Numbering continues the website stories (last WEB-US-61). Each names the root story it serves.

**WEB-US-62 · The SDK speaks contract 1.5.0 (MEG-WEB-1, US-62..81).** As a TypeScript consumer, I want the 27 new
operations typed, so that I can manage endpoints, providers and reports without hand-written calls.
- Given the contract pinned at `7d48ea7`, then `admin.modelEndpoints`, `admin.endpointPriceProposals`,
  `admin.inferenceProviders`, `admin.teams.putGatewaySettings`, `teams.modelEndpoints`, `reports.inference` and
  `reports.teamInference` exist, every one with TSDoc, and the contract replay parses every new example.
- `createInferenceProviders` offers `impactOf` (dry run), `turnOff` and `turnOn`; `createReports` offers typed
  `inference` and `teamInference`; `routeBaseUrlEnv`, `parseRouteModel` and `ModelEndpointReason` are exported.
- `UpdateInferenceProvider` sends `If-Match` read from the provider list when only a name is given.

**WEB-US-63 · Service admins manage the endpoint catalog (MEG-WEB-2, US-62, US-63, US-64, US-74; screens 56, 57).**
- The *Model endpoints* page (Platform) lists service endpoints with route, protocol, location, pricing, *Metered* /
  *Capped* / *Extra terms* badges, service switch, team count, health and credential mode; team-declared endpoints;
  pending price proposals; the provider-policy summary and any degraded-route alert.
- *Create endpoint* is a wizard (endpoint and route, connection, models and pricing, access) with a review step and
  the equivalent `afs model-endpoints create-model-endpoint` command; the endpoint is created off.
- Each proposal is approved or rejected with a note (`admin:pricing`); controls the caller cannot use are disabled
  with "Requires service admin".

**WEB-US-64 · Endpoint detail with teams and credentials (MEG-WEB-2, US-65, US-71, US-76, US-81; screen 58).**
- Tabs *Overview*, *Models & prices* and *Teams & credentials*; per team: selection and who selected it, credential
  *Set* / *Missing* (never a value), last rotation, federation state, gateway deployment and version, spend.
- *Set credential* and *Rotate* take the value in a masked field only; the value never enters React state, the
  query cache, the URL, storage or logs, and the field is cleared after submit. *Federation* takes metadata only and
  shows the issuer, subject and audience (Azure) or role ARN (Google) the cloud admins must trust.

**WEB-US-65 · Inference report (MEG-WEB-2, MEG-WEB-3, US-73; screens 59, 64).**
- *Reports* gains an *Inference* tab for service admins (all teams) and every team role (its team): calls, p50
  latency, p95 TTFT, output tokens per second, error rate split into upstream errors and AFS refusals, estimated
  share, cost and effective $/MTok, grouped by route, model, agent or hour; CSV as the API returns it.

**WEB-US-66 · Team model endpoints and opt-in (MEG-WEB-2, MEG-WEB-3, US-63, US-66, US-81; screens 60, 61).**
- A service admin's team page gains a *Model endpoints* tab: the team's selected routes with who selected them,
  *Select for team* on extra-terms and service-selected endpoints, and the *may declare endpoints* and gateway
  deployment settings (`PutTeamGatewaySettings`, `teams:set-guardrails`).
- A team's *Model endpoints* page (Configuration) shows the team gateway, the opted-in service routes, *Add service
  endpoint* and *Remove from team* (`model-endpoints:write`), team endpoints and why a route is off (*Off by
  provider policy*, *Missing credential* ...). An extra-terms endpoint is disabled with "Needs a service admin".

**WEB-US-67 · Team endpoint create (MEG-WEB-3, US-67; screen 62).**
- Route name with the variable it produces, owner, purpose, location tiles, base URL or Service and port, protocol
  paths, auth, pricing mode, models and the equivalent CLI; disabled with "Needs permission from a service admin"
  when the team may not declare endpoints. A refused create shows the error and saves nothing.

**WEB-US-68 · Agent models and routes (MEG-WEB-3, MEG-WEB-4, US-68, US-69, US-71, US-75; screens 63, 67).**
- The agent panel's *Models & routes* tab: Bedrock models as in 1.1.0; routes *All team routes* / *Selected
  routes*; default route and model; *What the agent receives* updates as the choice changes; saving sends `If-Match`
  and the equivalent `afs agents update-agent` command is shown. Viewers see the same read-only.

**WEB-US-69 · Budget by source (MEG-WEB-3, US-70, US-72; screen 65).**
- *Budget & usage* lists each route with *Capped* or *Reported only* and the estimated-usage share per route.

**WEB-US-70 · Provider policy (MEG-WEB-2, US-78, US-80, US-81; screens 68, 68a).**
- One row per provider, Bedrock included, with hosts, routes, teams, who selects teams, credential kind and a switch.
- Turning a provider off opens a confirmation that shows the impact (dry run) and needs a reason; for Bedrock it
  also needs a fallback route model on a provider that is on and *Select for every team*; *Turn off* stays disabled
  until both are set, and the request is sent only after confirmation.
- Team roles never see the policy; they see *Off by provider policy* on the affected routes.

**WEB-US-71 · Read-only for viewers (MEG-WEB-4, US-75; screens 66, 67).** Every changing control on the team's
*Model endpoints* page and the agent's *Models & routes* tab is disabled with "Requires team-admin"; credentials show
only *Set* or *Missing*; the CLI panel is hidden; an `AccessDenied` from the API is still handled.

**WEB-US-72 · Permission mirror (MEG-WEB-5).** `admin:model-endpoints`, `admin:inference-providers`,
`model-endpoints:read` and `model-endpoints:write` are in the console's catalog in the order of `permissions.json`,
each with a denied case for every role that does not hold it.

**WEB-US-73 · Baselines for approval (MEG-WEB-6).** Every new screen has a Playwright baseline and an entry in
`approvals.json`, `pending` until J approves it.
