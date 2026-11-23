# Architecture

Dependency rule unchanged (`architecture.test.ts` enforces it). New and changed pieces:

- `domain/orchestration.ts`, `domain/modelAccess.ts`: pure rules, texts and CLI builders.
- `application/ports/orchestration.ts` and `usecases/orchestration/`: get, put, change tool, endpoint list.
- `application/ports/collaboration.ts`: links, key rotation, managed secrets and recent access only; the
  deprecated collaboration resource and endpoint list are gone from the console.
- `infrastructure/sdk/orchestration.ts`: maps `createOrchestration` and `admin.orchestrationEndpoints`.
- `presentation/screens/t17-orchestration` (T17, V4, T18 tab), `s12-orchestration`, `components/ModelsControl`,
  `components/ExposureControl`, `components/OrchestrationMark`; the shared agent configuration component lives in
  `t2-agents/AgentConfiguration` and is used by T2 detail and the T18 tab (ORC-22).
- Routes: `/t/:teamId/orchestration[/config|usage|logs|revisions]`, `/orchestration` (S12); the old
  `/t/:teamId/collaboration` redirects.
