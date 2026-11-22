# Implementation notes: paperclip-collaboration

Updated as the work proceeds.

## Technical decisions

- **Contract pin from a local checkout.** The restapi change is unmerged (PR #7). `updateContract` was driven with a fetcher that reads `git show 3588074:<path>` (first 99bfcfc, re-pinned to 3588074 for the collaboration report kind and GroupBy values), so the lock file has the same shape as a raw GitHub pin (`ref` and `commit` are the full sha). Follow-up: re-pin with `bun run contract:update -- --ref <merge sha>`.
- **`endpointUrl` lives in `createCollaboration`.** The generated facade `createAfs` is the one-to-one operation surface (the coverage test lists its leaves against the contract), as with `createReports`; the hand-written helper is added by the factory `createCollaboration(core)`, exported from `src/index.ts`.
- **Permission catalog is generated from the pin.** `permission.ts` is regenerated from `permissions.json` so grant order matches the drift test.

## Edge cases and solutions

(filled during implementation)

## Deviations from plan

(none yet)

## Root contract follow-ups

(none yet)

## Lessons learned

(at the end)
- **Dialogs scroll.** `Modal` now caps its height at the viewport and scrolls, with the action row sticky, because the longer
  P5 template and identity provider forms pushed *Create template* and *Add* out of reach on a 900 px viewport.
- **Collaboration report URL.** T11 and S8 read `range` and `groupBy` from the URL (only a grouping the report offers), so the
  T16 *View all in Reports* link opens `?tab=collaboration&range=7d&groupBy=person`. Schedules are typed `ScheduledKind`
  (no `collaboration`).
- **Swarm template collaboration agent.** Held in the draft as `collaborationTemplateId`, outside the JSON spec editor, and merged
  into `spec.collaboration.templateId` on save; only enabled agent templates with `paperclip` and an `id` are offered.
- **Deferred.** The `@dev` smoke spec (needs E2E_DEV and a real API) and a per-row *Connected* switch on T16 (bulk connect and
  disconnect cover it).
