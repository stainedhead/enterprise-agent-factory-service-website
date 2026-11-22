# Data dictionary: paperclip-collaboration

Wire types are generated from the pinned contract (`packages/sdk/src/generated/schemas.ts`); this file lists the console-side shapes.

## Entities (SDK, generated)

`TeamCollaboration` (agentId, hostname|null, webUiEnabled, restApiEnabled, webUiUrl|null, restApiUrl|null, registrationMode manual|managed, effective {webUi, restApi, reasons[]}, status, unmanagedPaperclipAgents[], version, generation), `CollaborationLink` (agentId, agentName, connect, paperclipAgentId?, linkState, lastSyncedAt?, lastError?, version), `CollaborationEndpoint` (teamId, slug, hostname, effective, phase, teamState, mayExposeCollaboration, lastAccessAt), `RotateCollaborationKeysResult`.

## Value objects and enumerations (console domain, `domain/collaboration.ts`)

| Name | Values |
|---|---|
| `SurfaceState` | `On` (green), `Off` (hollow grey) |
| `LinkState` | `linked` green, `pending` amber, `failed` red, `disabled` hollow grey; unknown passes through as grey |
| `ConditionState` | `True`, `False`, `Unknown`; the inverted rule for `UnmanagedPaperclipAgents` |
| `ManagedBy` | `user` (plain "Team"), `afs` (blue badge), `paperclip` (amber badge); unknown renders raw |
| `EffectiveReason` | `team_not_allowed`, `service_endpoints_off`, `base_domain_unset`, `provider_without_collab_client`; texts per PRD WEB-US-44 |
| `OpenPaperclipState` | `{enabled: boolean, reason?: string}` from the precedence list |
| `PersonAccess` | `{id, label, signIns, requests, deniedRequests, serviceAdminEntry}` aggregated from report rows |

## Interfaces

Port `CollaborationPort`: `get`, `put`, `listLinks`, `connect`, `disconnect`, `rotateKeys`, `listManagedSecrets`, `recentAccess`, `listEndpoints`, `listEndpointsCsv`.

## Roles and permissions

`team_collaborator`; `collaboration:read|manage|access|contribute|api` as in `permissions.json`.
