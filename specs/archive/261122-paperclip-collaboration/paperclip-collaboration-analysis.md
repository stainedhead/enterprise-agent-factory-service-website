# Process analysis: paperclip-collaboration

Date: 2026-11-22. Branch `claude/project-thread-xqpqky`, PR #8.

## What went well

- SDK first: the contract re-pin (99bfcfc, then 3588074) regenerated the facade, and the coverage test caught drift at once.
- Clean architecture held: `architecture.test.ts` rejected one application test that imported presentation helpers; fixed by inlining fakes.
- Fake API fixtures plus `signInAs` roles made the T16, V3 and S10 e2e specs cheap to write.

## What cost time

- CI e2e failed twice on visual baselines (expected: new screens and a navigation item). Cure: a `[regen-baselines]` commit; the CI image regenerated 11 baselines.
- Two real defects were found only by e2e: dialogs taller than the viewport hid their action buttons (Modal now scrolls with a sticky action row), and a substring label match in the secrets sentinel (a longer label now needs an exact match).
- Two flaky specs (drafts sessionStorage read, history request-recorded check) were races; both now wait for the condition instead of reading once.

## Process notes

- Run the full local e2e (non-visual) before the first push: it finds dialog and label regressions that unit tests cannot.
- Local runs cannot produce baselines (font differences); only the CI image can.
- Deferred: `@dev` smoke spec, per-row *Connected* switch.
