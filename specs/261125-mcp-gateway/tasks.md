# Tasks

| ID | Task | Tests | State |
|---|---|---|---|
| M1 | SDK: pin contract 1.6.0 (`ef92a4c`), regenerate, SDK-name fixes, browser-only callback, wrapped-version reader, MCP helpers, usage reports, `McpReason`, version 1.3.0; permission mirror (10 new) | loader, replay, coverage, concurrency, mcp.test, permission tests | done |
| M2 | Domain: screens, navigation and routes, MCP words and badges, env preview, form drafts and validation, policy rules, approval rules, CLI builders | domain tests (44 in mcp.test) | done (screen ids and nav committed with M5, since they need the registered screens) |
| M3 | Application: ports and use cases (catalog, review, team servers, agent MCP, usage, settings, federated identities) with fake ports | usecase tests (25) | done |
| M4 | Infrastructure: SDK adapters and wiring | adapter tests (9) | done |
| M5 | Service screens SM1, SM2, SM3, SM4, SM5, SM6 | e2e incl. denied cases | open |
| M6 | Team screens TM1, TM2, TM3, VM1; agent tab TM4; usage TM5; governedBy, gateway settings, federated identities | e2e incl. viewer | open |
| M7 | Fake AFS fixtures, Playwright spec, route sweeps, visual baselines 46-55 (pending J) | e2e | open |
| M8 | Docs: user-docs, CHANGELOG, README with diagram, AGENTS.md, PRD stub | links check | open |
| M9 | Gate and push | gate | open |
