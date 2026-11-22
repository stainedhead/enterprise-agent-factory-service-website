# Review PRD: paperclip-collaboration (auto-review)

Date: 2026-11-22. Reviewed: branch `claude/project-thread-xqpqky` (SDK 1.0.1 and console, spec `261122-paperclip-collaboration`).
Verdict: ready for spec. Findings are small; none is critical.

## Findings

| ID | Severity | Finding | Decision |
|---|---|---|---|
| RV-1 | Important (security) | *Open Paperclip* linked to `webUiUrl` as returned by the API with no scheme check, so a `javascript:` or `data:` value would become a link target | Fix: `safeWebUrl` allows only `http:` and `https:` (domain test, page uses it) |
| RV-2 | Minor | T16 has no per-row *Connected* switch; bulk connect and disconnect cover WEB-US-48 | Defer, recorded in implementation-notes |
| RV-3 | Minor | The `@dev` smoke spec needs E2E_DEV and a real API | Defer (parked by the PRD) |
| RV-4 | Minor | T4 has no *Edit value* action in this console, so the managed-secret refusal text is shown only for rotate | Defer, no change in behaviour |
| RV-5 | Minor | Existing baselines changed (navigation item, new columns, role step); approvals stay `approved` for the old screens | Record in `pr-body.md` for J |

## Checked and clean

Dependency rule (`architecture.test.ts`), RBAC gates with `AccessDenied` handled, no secret value in state, URL or
storage (sentinel spec covers the new IdP, rotate and managed-secret paths), axe over T16, V3, S10 Collaboration and the
collaboration report, viewer read-only sweep over the new team routes, 90% coverage floors held.

## Requirements

- RV-FR-1: A link target from the API is opened only when its scheme is `http` or `https`.
