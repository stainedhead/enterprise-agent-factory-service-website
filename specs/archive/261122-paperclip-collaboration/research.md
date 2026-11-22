# Research: paperclip-collaboration

Date: 2026-11-22. Source PRD: [paperclip-collaboration-PRD.md](paperclip-collaboration-PRD.md).

## Research Questions and answers

1. **How is the contract pinned?** `packages/sdk/tools/contract-sync.ts` fetches three files from raw GitHub at a ref and records source, ref, commit, version and sha256 in `contract.lock.json`. The restapi branch is not merged, so the three files were taken with `git show 99bfcfc:<path>` from the local checkout through the same `updateContract` function (custom fetcher). The lock records the full sha as `ref` and `commit`. Contract version read from `info.version`: 1.3.1.
2. **What does codegen produce for the new operations?** Seven operations become `collaboration.*` and `admin.collaborationEndpoints.list`; schemas gain `TeamCollaboration`, `CollaborationLink`, `CollaborationEndpoint`, `RotateCollaborationKeysResult`; `Agent.role`, `Agent.collaboration`, `Secret.managedBy`, `AgentTemplate.capabilities`, `SwarmTemplate.spec.collaboration`, identity provider collab fields, `team_collaborator` roles, `mayExposeCollaboration`, `SecretDetected` all arrive generated. Hand-written: `endpointUrl`, reason constants, the `collaboration` report kind.
3. **Does the permission catalog drift test need hand edits?** The catalog is hand-authored TypeScript compared to `permissions.json` in both directions; it is regenerated from the pinned JSON (63 permissions, 5 roles).
4. **How are screens added?** Navigation items and extra routes in `domain/navigation.ts`, screens lazy-loaded from `presentation/routes`; slices follow domain, port, use case, SDK adapter, composition in `main/`.
5. **What does the fake AFS API need?** A `collaboration` fixture module, `collaborator` user, control hooks, role and managed filters.

## Industry Standards, Existing Implementations, API Documentation

AWS console patterns (PRD §4); the contract `docs/contracts/api-contract.md` v1.3.1 and `api/openapi.yaml` in `-restapi` at 99bfcfc.

## Best Practices

TDD per AGENTS.md; sentinel scans for secrets; WCAG 2.2 AA; Playwright visual baselines.

## Open Questions

OQ-WP2 (mockups for changed screens without one) and OQ-WP7 (CLI flag spellings) remain open with defaults in the PRD. The restapi PR must merge, then re-pin.

## References

Root `paperclip-team-collaboration-PRD.md`, `docs/contracts/`, `docs/ui/30-*`, `31-*`.
