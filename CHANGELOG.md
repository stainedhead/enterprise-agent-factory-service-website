# Changelog

All notable changes to `@afs/sdk` and `@afs/console` (versioned together). Format follows
[Keep a Changelog](https://keepachangelog.com/); versions are [semver](https://semver.org/). The REST API
(`-restapi`) and the database (`-db`) ship the same version (1.0.1) so a release is one number across the set.

## [1.0.1] - 2026-11-22

Paperclip team collaboration (spec `specs/archive/261122-paperclip-collaboration`). SDK tag: `sdk-v1.0.1`.

### Added (SDK)

- `collaboration` resource: `get`, `put` (If-Match), `links.list`, `connectAgent`, `disconnectAgent`, `rotateKeys`,
  and `admin.collaborationEndpoints.list` (iterator, `.pages()`, `asCsv()`).
- `createCollaboration(core)` with `endpointUrl(teamId)`: one `GET`, a URL only for a surface that is effective.
- `AfsError.isSecretDetected`; exported `CollaborationReason` and `FieldReason` constants.
- `collaboration` report kind with `surface`, `reason` and `person` groupings and `CollaborationReportRow`.
- Contract v1.3.1 fields on existing resources: `Agent.role` and `.collaboration`, `Team.mayExposeCollaboration`,
  `Secret.managedBy`, `AgentTemplate.capabilities`, `SwarmTemplate.spec.collaboration`, identity provider
  `collabClientId` and `collabClientSecretArn`, role `team_collaborator`, list filters `role`, `managedBy`, `capability`.

### Changed (SDK)

- The contract pin moves from v1.1.0 to v1.3.1 (`-restapi` main at `763e939`, the merge of PR #7, which also adds the
  `collab.*` keys to the `PutSetting` key enum). 189 operations (was 182).

### Added (console)

- Collaboration page (T16) and its read-only variant (V3): status, public web UI and REST API switches with a
  confirmation before turning one on, connected agents with bulk connect, Paperclip-managed secrets, recent
  access, edit endpoints, rotate keys, managed registration, guidance and alerts.
- T3 *Role* step (worker or collaboration agent), *Collaboration* navigation item, T1/V1 tile, T2 badge, column and
  role filter, T4/V2 *Managed by* column, team collaborator role in members and API keys, teal header pill.
- Service admin: team guardrail *May publish collaboration endpoints* (S2, S3), S10 *Collaboration* tab with the seven
  `collab.*` settings and the service-wide endpoint list, identity provider collaboration client, agent template
  capabilities, swarm template collaboration agent, collaboration report (T11, S8).

### Fixed

- Flaky e2e `auth/drafts.spec.ts` ("Execution context was destroyed"): the sessionStorage read now waits for the
  navigation to settle.

## [0.3.0] and earlier

See the git history and the archived spec `specs/archive/261121-website-feature-complete`.
