# Spec: paperclip-collaboration-auto-review

Source: `../paperclip-collaboration-auto-review-PRD.md`. Scope: RV-1 only (RV-2 to RV-5 deferred or recorded).

- AC-1: `safeWebUrl` returns the URL for `http:` and `https:` and `null` for any other scheme, a malformed value, `null` or empty.
- AC-2: *Open Paperclip* is disabled (no link) when the API's URL is not `http` or `https`.
