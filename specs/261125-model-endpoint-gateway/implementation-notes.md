# Implementation notes

- G1: codegen keeps contract SDK names except `SDK_RENAMES` (one entry, `GetTeamInferenceReport`). Plain `{items}`
  lists serve as If-Match readers only for required If-Match.
- G2: permission catalog 67 entries (four new, generated denied cases plus an explicit block). Screens SG1..SG6,
  TG1..TG5, VG1, VG2 (50 screen ids). Route env preview and all CLI previews are pure domain functions; booleans
  render `--x`/`--no-x`; credential commands render `--secret-value file://<path>` and never read the field.
- G3: use cases validate before any port call (nothing is sent for an invalid form). Agent routes save through
  `AgentsPort.update` with the agent's version (If-Match); the Bedrock model selection is left as it was.
- G4: `SdkTeamModelEndpoints.list` follows `nextToken` and reads the gateway fields from the first page's extras
  (defaults `shared`/false when absent; found by the adapter test).
- G5-G7: the team routes tables are shared by TG1/VG1 and SG5. Screens are covered by the Playwright spec
  `e2e/specs/modelEndpoints` (TC-UI-01..06, 10, 11, axe) rather than component tests; coverage thresholds apply to
  domain and application, both above 90%.
- G8: fake fixtures in `e2e/fake-afs/fixtures/modelEndpoints.ts` use generic model names; the fake GetMe grants the
  new team permissions. CI gains `[regen-new-baselines]` (`--update-snapshots=missing`) so new baselines are written
  without touching approved ones. Local Chrome renders fonts differently from the Playwright image, so baselines are
  only generated in CI.
