# Plan

1. SDK first (G1), then domain and application with tests (G2, G3), adapters and wiring (G4).
2. Screens by role (G5 to G7), each with page tests that cover the allowed and denied case.
3. Fake API fixtures and Playwright (G8); new baselines generated in CI with `[regen-baselines]`, pending J.
4. Docs (G9); gate, PR, CI, merge (G10).
