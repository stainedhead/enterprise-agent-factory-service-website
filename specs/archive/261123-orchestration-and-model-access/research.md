# Research

- Contract: `-restapi` main at f6d240c (v1.4.0). `permissions.json` is unchanged (no new permission); scope
  changes in the `-restapi` CHANGELOG 1.1.0: `collaboration:manage` also covers `PutTeamOrchestration` and
  `ChangeCollaborationTool`; `teams:set-guardrails` the exposure limit and team model access; `pools:write` pool
  models; `admin:models` `PutServiceModelAccess`; `admin:settings` `ListOrchestrationEndpoints` and the
  `orchestration.*` and `models.*` settings. `domain/permission.ts` therefore needs no new entry; the matrix test
  stays the check.
- `collab.base_domain` and `collab.public_endpoints` are renamed; `PutSetting` refuses the old keys with
  `setting_renamed`. S12 edits the `orchestration.*` keys.
- `GetServiceModelAccess` does not exist: the console reads `models.service_access` from `GetSettings` and writes
  it through `PutServiceModelAccess`.
- The CLI for 1.1.0 is built later; the command previews follow PRD ORC-29 (`--web-ui-exposure`, `--orchestration
  Tool=...`) rather than the generated flag table.
- Mockups 32 to 45 in the root `docs/ui/` are the visual reference; purple and the diamond mark are reserved for
  orchestration (OR-D11), so the other purple badges moved to teal.
