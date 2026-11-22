# Research: website-feature-complete-auto-review

| | |
|---|---|
| **Feature** | website-feature-complete-auto-review |
| **Date** | 2026-11-22 |
| **Source PRD** | [website-feature-complete-review-PRD.md](website-feature-complete-review-PRD.md) |

## 1. Research questions

| Id | Question | Where it matters | Resolve by |
|---|---|---|---|
| RQ-1 | Does the platform (Terraform consuming `deploy/response-headers-policy.json`) accept `frame-ancestors 'self'` and `frame-src 'self' <issuers>`? Fallback: top-level `prompt=none` redirect, which depends on FR-004 drafts | FR-001, ADR-014 | J or the platform owner; interim apply `'self'` |
| RQ-2 | Does a hidden same-origin frame that follows the IdP redirect to `/auth/callback` render under the new policy in Chromium, Firefox and WebKit? Only Chromium runs here | FR-001, B-3 | Chromium e2e now; Firefox and WebKit in CI |
| RQ-3 | Which activity events reset the idle timer across tabs (input only, or also user-started downloads)? | FR-005 | Interim: input events only |
| RQ-4 | Which dialogs beyond the minimum set must keep drafts? | FR-004 | Minimum set in the PRD; others optional |
| RQ-5 | Does any existing e2e fake already allow per-operation fault injection (`401`, `AccessDenied`)? Initial look found none beyond `idp.ts` | C-4, B-6 | C-4 starts with a search of `e2e/fake-afs/` |
| RQ-6 | Which test files in `presentation` currently import `infrastructure` or `@afs/sdk` (so E-2's allow-list is complete)? | FR-016 | E-2 runs the extended scan first |
| RQ-7 | FR-010: redact all lengths, or refuse short values before sending? | FR-010, A-4 | A decides, records in Stream A notes |

## 2. Industry standards

OWASP ASVS V3.7 (session renewal without stored credentials; row in the archived spec's notes section 4b),
OIDC Core `prompt=none` and `login_required`, RFC 6749/7636 (PKCE), CSP Level 3 `frame-ancestors` and
`frame-src`, RFC 9110 `Retry-After`.

## 3. Existing implementations

Reviewed code at `cdc14f7`: SDK `client.ts`, `errors.ts`, `wait.ts`; console `OidcClient.ts`,
`Session.ts`, `IdleMonitor.ts`, `createQueryClient.ts`, `useSecretMutation.ts`, `useVersionedForm.ts`,
`DraftStore.ts`, `ports/config.ts`. Evidence with file and line references is in PRD section 6.

## 4. API documentation

No API or contract change. The contract snapshot stays pinned until U-1.

## 5. Best practices

Red first; one reporter for all `AccessDenied` handling; storage calls guarded with try/catch; the API is the
enforcement point; secrets live only in uncontrolled inputs (WD-31).

## 6. Open questions

See `spec.md` section 12 and RQ-1..RQ-7.

## 7. References

Archived spec `specs/archive/261121-website-feature-complete/` (WD, DV, CQ ids), `AGENTS.md`,
`docs/architectural-decision-record.md` (ADR-012 drafts, ADR-013 contract pin).
