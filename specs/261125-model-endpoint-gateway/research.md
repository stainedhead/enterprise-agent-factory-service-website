# Research

## Contract
- Pinned `-restapi` `7d48ea70d2f9cb77ef4308b0225ca9d4168dea60`, `info.version` 1.5.0, 221 operations (194 + 27).
  The root contract §4.13 table lists 26 rows; `GetInferenceReport` covers the service and the team report, which
  the OpenAPI declares as two operations (`GetInferenceReport`, `GetTeamInferenceReport`).
- Permissions in `permissions.json` follow `admin:cost-tag-status`: `admin:model-endpoints`,
  `admin:inference-providers` (service admin), `model-endpoints:read` (viewer, collaborator, team-admin, service admin),
  `model-endpoints:write` (team-admin, service admin).

## Contract notes (discrepancies found while building)
1. **Duplicate SDK name.** `x-afs-sdk` is `reports.inference()` for both `GetInferenceReport` and
   `GetTeamInferenceReport`. Codegen keeps `reports.inference()` for the service report and names the team one
   `reports.teamInference()` (`SDK_RENAMES` in `tools/codegen/loader.ts`), matching `reports.team()` beside
   `reports.service()`. The contract should give the team operation its own name.
2. **Plain list without paging.** `ListInferenceProviders` returns `{items}` without `nextToken`, so the generic
   paginator refused it as the If-Match reader of `UpdateInferenceProvider`. The client now reads plain lists in one
   call; codegen uses such a reader only where If-Match is required (so optional If-Match on `PutSetting` keeps its
   1.1.0 behaviour).
3. **No *Test connection* operation.** US-67 and screen 62 describe *Test connection* (the gateway calls
   `GET /v1/models` once); contract 1.5.0 has no operation or parameter for it. The console omits the control and
   says so; TC-UI-02 is proved with a refused create (error shown, nothing saved).
4. **Permission of `ListEndpointPriceProposals` and `ImportProviderStatement`.** PRD D.3.4 says
   `admin:model-endpoints`; contract §4.13 and the OpenAPI say `admin:pricing`. The console follows the OpenAPI.
5. **`ListTeamModelEndpoints` has no spend or agents-using figures.** Screen 61 shows *Agents using* and *Spend MTD*
   per route; the console takes spend from the team inference report grouped by route and omits *Agents using*.
6. **No list of recent provider changes.** Screen 68's *Recent changes* card links to the audit log instead.
7. **`ListModelEndpoints` has no direct-LLM-access view.** Screen 56's *Direct LLM access* card is shown from
   `ListInferenceProviders.directSystems` counts only.
8. **Agent models live on `UpdateAgent`.** The contract describes `PutAgentModels`; 1.5.0 has no such operation, so
   routes are saved through `UpdateAgent` `models` (`routeAccess`, `routes`, `defaultRoute`) with If-Match, and the
   CLI preview is `afs agents update-agent --models '<json>'`.
