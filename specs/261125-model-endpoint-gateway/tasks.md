# Tasks

| ID | Task | Tests | State |
|---|---|---|---|
| G1 | SDK: pin contract 1.5.0 (`7d48ea7`), regenerate, SDK-name collision rule, plain-list readers, provider and report helpers, route helpers, reasons, version 1.2.0 | loader, replay, coverage, modelEndpoints.test | done |
| G2 | Domain: permissions (4 new, denied cases), screens, navigation and routes, route env preview, provider and endpoint rules, CLI builders | domain tests | done |
| G3 | Application: ports and use cases (admin endpoints, pricing, providers, team endpoints, agent routes, inference report) with fake ports | usecase tests | done |
| G4 | Infrastructure: SDK adapters and wiring | adapter tests | done |
| G5 | Service screens SG1, SG2, SG3, SG6 (68, 68a) | e2e (TC-UI-01, 06, 11) incl. denied cases | done |
| G6 | SG4 and TG4 inference tabs; SG5 team tab; TG5 budget by route | e2e (inference, SG5, budget) | done |
| G7 | Team screens TG1, TG2, VG1; agent tab TG3, VG2 | e2e (TC-UI-02..05, 10) incl. viewer | done |
| G8 | Fake AFS fixtures, Playwright specs TC-UI-01..11, routes lists, visual baselines (pending J) | e2e | in progress (14 new baselines from CI, pending J; 4 existing baselines need J) |
| G9 | Docs: user-docs, CHANGELOG, README, AGENTS.md, PRD stub, docs/; archive 261123 | links check | done (screenshots pending CI baselines) |
| G10 | Gate, PR, CI, merge | gate, CI | open |
