# Architecture: paperclip-collaboration

Status: Draft, followed in implementation.

## Overview

```
presentation/screens/t16-collaboration (lazy) -> application/usecases/collaboration -> application/ports/collaboration
                                                               ^
infrastructure/sdk/collaboration.ts (@afs/sdk) -- composed only in main/
domain/collaboration.ts (pure rules: reason texts, open-paperclip precedence, state words, managed-secret filter, per-person aggregation)
```

## Layer responsibilities

- **domain**: pure TypeScript, no React or SDK; `permission.ts` mirrors the catalog; `collaboration.ts` holds the rules.
- **application**: the port and the use cases (load page data, put switches, connect, disconnect, rotate keys, recent access, list endpoints).
- **infrastructure/sdk**: adapter maps SDK types to domain types; the only place that imports `@afs/sdk` for collaboration.
- **presentation**: T16 page and panels, V3 variant, dialogs; tests call use cases from context; no `@afs/sdk` import.

## Data flow

T16 loads `GetTeamCollaboration`, `ListCollaborationLinks`, `ListSecrets` (two filters) and the collaboration report in parallel; each panel has its own skeleton and error. Polling: one `GetTeamCollaboration` and one `ListCollaborationLinks` per interval, only while something is Pending, paused when hidden, honouring `Retry-After`.

## Integration points

Fake AFS API (`e2e/fake-afs`) serves the pinned contract; CSP and `deploy/` are unchanged; no call to a team hostname.

## Architectural decisions

See PRD §12.3 (WP-D1..23) and implementation-notes.md.
