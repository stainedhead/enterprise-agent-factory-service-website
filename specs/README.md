# specs/

Feature specs for dev-flow. Conventions only; see the Feature Specification Workflow in `AGENTS.md`.

- **Naming:** `YYMMDD-<feature-name>/`. `YYMMDD` is the date `create-spec` ran, not the implementation date.
- **Contents:** `spec.md`, `status.md` (update after every task, mandatory), `plan.md`, `tasks.md`,
  `research.md`, `data-dictionary.md`, `architecture.md`, `implementation-notes.md`, and the source
  `<feature>-PRD.md` (moved here by `create-spec`).
- **Lifecycle:** active specs live in `specs/`; when `status.md` shows 100%, `archive-spec` moves the
  directory to `specs/archive/`.
