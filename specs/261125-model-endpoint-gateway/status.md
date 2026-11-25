# Status: model-endpoint-gateway

Created: 2026-11-25. Source: [model-endpoint-gateway-PRD.md](model-endpoint-gateway-PRD.md).

## Overall progress

| Phase | Status |
|---|---|
| 0 Initial research | Complete |
| 1 Specification | Complete |
| 2 Research and data modeling | Complete |
| 3 Architecture and planning | Complete |
| 4 Task breakdown | Complete |
| 5 Implementation | In progress (G1-G7, G9 done; G8 baselines and G10 in CI) |
| 6 Completion and archival | Pending |

## Tasks

See [tasks.md](tasks.md).

## Blockers

None.

## Recent activity

- 2026-11-25: spec created; contract re-pinned to `7d48ea7` (v1.5.0, 221 operations); SDK regenerated with the
  `reports.teamInference` rename and plain-list readers; `createInferenceProviders`, typed inference reports,
  route-name helpers and `ModelEndpointReason`; version 1.2.0; SDK tests 395 green (G1).
- 2026-11-25: G2-G7 done (domain, use cases, adapters, 13 screens); gate green on 5e44667 (console 1677 tests,
  96.9% statements; SDK 394 tests, 94.0%).
- 2026-11-25: G8 fixtures and Playwright spec (TC-UI-01..06, 10, 11) green locally without visuals; G9 docs,
  CHANGELOG 1.2.0, README/AGENTS status, PRD stub; 261123 archived.
- 2026-11-25: PR #14 opened. CI run on ae0fa26 (`[regen-new-baselines]`) wrote 8 new baselines (56-61, 68, 68a).
  62-67 were not written: the create-page capture ran before the page rendered, and the viewer visuals
  shared a test with the team-admin sign-in. Split VG1/VG2 into their own test and wait for the heading.
  Four existing baselines now differ by about 1% (10, 20, 23, 27): the new team nav item, the Inference
  tab and Spend by source change those screens. They are left as they are, for J to decide (not regenerated).
- 2026-11-25: CI run on 972d81f wrote 62-67; all 14 new baselines (56-68a) are now in the branch, pending J.
  This commit triggers a normal CI run (no regen marker) to check them and the four changed existing screens.
