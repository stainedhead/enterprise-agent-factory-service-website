# Product summary

This repository ships two products for the Enterprise Agent Factory Service (AFS), both clients of the
`-restapi` REST API.

- **`@afs/sdk`**, published to GitHub Packages as `@stainedhead/afs-sdk`. A typed TypeScript SDK generated
  from the pinned OpenAPI contract: 182 operations in 41 resource modules, token pagination as async
  iterators, `If-Match` and `Idempotency-Key` handled for you, retries, `AfsError`, `waitFor` and typed reports.
  Zero runtime dependencies.
- **The Agent Factory console** (`@afs/console`). A role-aware web console with 33 screens for service admins,
  team admins, team viewers and the security operator. Every screen from the root PRD (section 5) is built.

The console decides nothing about access: it reads `GET /v1/me` to enable or disable controls and treats the
API's `AccessDenied` as the real answer.

## Status

Feature complete. The contract snapshot is pinned to `-restapi` `main` at `d887609`. Re-pinning to a release tag
waits for `-restapi` to tag one (CQ-1).

Requirements and the console design by role: the root repository's `enterprise-agent-factory-service-initial-PRD.md`.
Usage: [user-docs/README.md](../user-docs/README.md). Details: [product-details.md](product-details.md).
