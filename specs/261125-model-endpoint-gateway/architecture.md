# Architecture

- `domain/modelEndpoints.ts`: pure rules: badges (Metered, Capped, Extra terms, Built-in), location and pricing words,
  off reasons, route env preview (`routeEnvPreview`, gateway contract §8.2 order: default first, then by slug),
  team-endpoint form validation (slug, https, owner and purpose), provider-off readiness (reason, Bedrock fallback),
  CLI builders for every create and change form.
- `application/ports/modelEndpoints.ts`: `AdminModelEndpointsPort`, `InferenceProvidersPort`,
  `TeamModelEndpointsPort`, `InferenceReportsPort`.
- `application/usecases/modelEndpoints/*`: catalog split (service, team-declared), proposal decisions, endpoint
  create and detail, credentials (value passed through, never kept), federation, provider policy with dry-run
  impact and fallback candidates, team opt-in and removal (full list replace), team endpoint create, inference report.
- `infrastructure/sdk/modelEndpoints.ts`: SDK adapters (`admin.modelEndpoints`, `admin.endpointPriceProposals`,
  `createInferenceProviders`, `admin.teams`, `teams.modelEndpoints`, `createReports().inference`).
- Presentation: `screens/sg-model-endpoints` (SG1, SG2, SG3, SG6), `screens/tg-model-endpoints` (TG1, TG2, VG1),
  `screens/t2-agents/tabs/models-routes` (TG3, VG2), inference tab shared by S8 and T11, SG5 tab in the team
  admin page, TG5 card on T5.
- Secrets: credential forms use `SecretInput` and `useSecretMutation`, like T4.
