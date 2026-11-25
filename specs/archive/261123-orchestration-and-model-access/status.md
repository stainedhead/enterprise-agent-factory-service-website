# Status: orchestration-and-model-access

Created: 2026-11-23. Source: [orchestration-and-model-access-PRD.md](orchestration-and-model-access-PRD.md).

## Overall progress

| Phase | Status |
|---|---|
| 0 Initial research | Complete |
| 1 Specification | Complete |
| 2 Research and data modeling | Complete |
| 3 Architecture and planning | Complete |
| 4 Task breakdown | Complete |
| 5 Implementation | Complete (O1-O12) |
| 6 Completion and archival | Complete (archived 2026-11-25) |

## Tasks

See [tasks.md](tasks.md). Done: O1 to O12. Visual baselines for S12, T17, T18, V4 and the screens changed by this release were regenerated in CI and approved by J (2026-11-23).

## Blockers

None.

## Recent activity

- 2026-11-23: spec created; contract pinned to f6d240c (v1.4.0, 194 operations); SDK regenerated with `@deprecated`
  emission, `orchestration.endpointUrls`, reason constants; version 1.1.0; SDK tests 354 green.
- 2026-11-23: contract re-pinned to f8b4404 (flat `webUiExposure`/`webApiExposure` on CreateTeam, `PutSetting` keys, `object` setting type);
  console screens S2, S3, S4, S12, T1, T2, T3, T17, T18, V4 and pools built; e2e fake and specs moved to orchestration;
  `bun run gate` green (SDK 356, console 1572 tests); real screenshots refreshed.
- Known deviations: routes use `/t/:teamId/...`; other purple badges re-themed teal; CLI preview flags follow PRD ORC-29;
  CreateTeam orchestration volume is a read-only service default in the UI; S2 has no detail Orchestration tab; SDK `Page.extras`.
- 2026-11-25: 100% complete (release 1.1.0 merged, baselines approved by J); moved to `specs/archive/`.
