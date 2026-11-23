# Spec: orchestration and model access (website 1.1.0)

## Goal
Every team has one orchestration agent. The console shows it apart from the team's workers, lets team-admins
choose its collaboration tool surfaces (Off, Private, Public) within a service-set limit, and lets every
agent use all, one or several Bedrock models. `@afs/sdk` and the console move to the 1.4.0 contract.

## In scope (all of it; nothing is deferred)
- SDK: contract pinned to `-restapi` f6d240c (contract 1.4.0, 194 operations); regenerated; `@deprecated` TSDoc on
  deprecated operations and fields; `orchestration.endpointUrls`; reason constants; version 1.1.0.
- Console screens: S3 step 2 *Orchestration* and step 3 models; S2 columns, filters and *Orchestration* and
  *Models* panels with *Set endpoint limit*; S12 *Orchestration* (four tabs, migration banner); S4 service model
  access; T1 orchestration card; T2 two regions; T17 *Collaboration* tab with *Edit endpoints* and *Change tool*;
  T18 *Agent configuration* tab (shared component, orchestration variant); T3 without *Role*, with the
  *Collaboration* section and the models control; pool form models; V4 and the viewer variants; Buzz state.
- Navigation: *Orchestration* replaces *Collaboration*; `/t/:teamId/collaboration` redirects.
- CLI equivalents on every create and change form.
- Playwright: fake API, specs, visual baselines (regenerated in CI with `[regen-baselines]`), real screenshots.
- Docs: README, user-docs, docs/, AGENTS.md, CHANGELOG.

## Acceptance
See tasks.md; each task names its tests. Gate: `bun run gate` green; architecture test green; every permission
rule has a denied-case test; no secret in state; axe clean on the new screens.

## Non-goals
Anything in the PRD's non-goals (harness API exposure, Buzz outside access, content migration between tools).
