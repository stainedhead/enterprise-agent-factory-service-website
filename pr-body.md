## Paperclip team collaboration (SDK 1.0.1 and console)

Adds the collaboration feature to `@afs/sdk` and the console (WEB-US-43..62, SDK-12..16). Spec: `specs/archive/261122-paperclip-collaboration/`.

### SDK (`sdk-v1.0.1`)
- Contract pinned to `-restapi` commit `763e939` (contract 1.3.1, 189 operations; the merge of PR #7).
- `collaboration` resource, `createCollaboration(...).endpointUrl`, `AfsError.isSecretDetected`, reason constants, `collaboration` report kind.
- Merging this PR with `packages/sdk/package.json` at 1.0.1 triggers the release; tag `sdk-v1.0.1`.

### Console
- T16 team collaboration page and V3 read-only variant; T3 role step; T1 tile; T2 badge, column, Role filter; T4/V2 managed secrets; T6 collaborator role.
- Service admin: S2/S3 guardrail, S10 Collaboration tab and endpoint list, identity provider collaboration client, agent template capabilities, swarm template collaboration agent (P5).
- Collaboration report in T11 and S8 (no scheduling); T16 links to it.
- Modal dialogs now scroll and keep their actions visible.

### Quality
- Gate green: console 1526 tests, SDK 334; coverage floors held. axe, viewer read-only and secret sentinel specs cover the new routes.
- CI e2e green after a `[regen-baselines]` commit.

### Baselines for J to approve
- New (status `pending` in `e2e/visual/approvals.json`): `30-team-collaboration` (T16), `30a-viewer-collaboration` (V3).
- Regenerated, still `approved` from before, please re-check: `07-team-agents`, `08-create-agent`, `09-team-secrets`, `10-team-budget`, `10b-admin-identity-providers`, `13-viewer-secrets`, `17-ta-agent-aws-access`, `21-agent-external-systems`, `23-settings-agent-templates` (navigation item, new columns and fields).

### Deferred
- `@dev` smoke spec (needs a real API), per-row *Connected* switch on T16.
