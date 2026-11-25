# Plan

1. SDK first (M1), then domain and application with tests (M2, M3), adapters and wiring (M4), as in 1.2.0.
2. Screens by role (M5 service, M6 team), copying the 1.2.0 model-endpoint screen structure; controls gated with
   `gate(...)` and the API's `AccessDenied` shown as the answer.
3. Fake API fixtures and Playwright (M7); new baselines generated in CI with `[regen-new-baselines]`, recorded
   `pending` in `e2e/visual/approvals.json` for J.
4. Docs (M8); gate and push (M9). The parent thread opens the PR.
