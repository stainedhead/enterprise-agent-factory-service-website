# Spec: model endpoint gateway (website 1.2.0)

Source: [model-endpoint-gateway-PRD.md](model-endpoint-gateway-PRD.md) (root PRD Appendix D.5, MEG-WEB-1 to 6).

## Goal
Agents reach any OpenAI-compatible endpoint through a named route on their team gateway, metered and (for
per-token routes) capped. `@afs/sdk` moves to contract 1.5.0, and the console gives service admins the endpoint
catalog, prices, credentials, the inference report and the provider policy (Bedrock included), and gives teams
their routes, opt-in, team endpoints, agent route selection and the inference report.

## In scope
- SDK: contract pinned to `-restapi` `7d48ea7` (1.5.0, 221 operations); regenerated; inference-provider and
  inference-report helpers; route-name helpers; reason constants; version 1.2.0.
- Console (screens of the root PRD Appendix A):

| Screen | Id | Route | Role |
|---|---|---|---|
| 56 Model endpoints | SG1 | `/model-endpoints`, `/model-endpoints/proposals` | service admin |
| 57 Create endpoint | SG2 | `/model-endpoints/new` | service admin |
| 58 Endpoint detail | SG3 | `/model-endpoints/:endpointId` | service admin |
| 59 Inference report | SG4 | `/reports/inference` (`/reports?tab=inference`) | service admin |
| 60 Team model endpoints | SG5 | `/teams/:teamId/admin?tab=model-endpoints` | service admin |
| 68, 68a Provider policy | SG6 | `/model-endpoints/providers` | service admin |
| 61 Team model endpoints | TG1 | `/t/:teamId/model-endpoints` | team-admin |
| 62 Create team endpoint | TG2 | `/t/:teamId/model-endpoints/new` | team-admin |
| 63 Agent models & routes | TG3 | `/t/:teamId/agents/:agentId?tab=models` | team-admin |
| 64 Team inference report | TG4 | `/t/:teamId/reports/inference` (`?tab=inference`) | every team role |
| 65 Budget by route | TG5 | `/t/:teamId/budget` | every team role |
| 66 Model endpoints (read-only) | VG1 | `/t/:teamId/model-endpoints` | team viewer |
| 67 Agent models & routes (read-only) | VG2 | `/t/:teamId/agents/:agentId?tab=models` | team viewer |

- Permission mirror, use cases with fake ports, CLI previews on every create and change form, AWS-console
  conventions, disabled-not-hidden controls with the role named, credential values only in the input, WCAG 2.2 AA.
- Playwright: fake API fixtures for the 27 operations, specs for TC-UI-01..11, visual baselines (pending J).
- Docs: user-docs, CHANGELOG 1.2.0, README and AGENTS.md status, website PRD stub.

## Acceptance
Each story in the PRD extract; TC-UI-01 to TC-UI-11; `bun run gate` green; `architecture.test.ts` green; domain and
application coverage at 90% or more; every permission rule has a denied case.

## Non-goals
The PRD's non-goals; the MCP operations of contract 1.6.0 (release 1.3.0, another thread); anything the 1.5.0
contract has no operation for (see research.md, contract notes).
