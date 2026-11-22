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
