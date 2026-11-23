# Data dictionary

| Type | Where | Fields |
|---|---|---|
| `OrchestrationRecord` | application port | teamId, agentId, agentName, phase, tool, toolVersion, registrationMode, limit, webUi and webApi (`SurfaceRecord`), connectedAgents, unmanagedToolAgents, version, generation, conditions |
| `SurfaceRecord` | application port | supported, exposure, effective, reasons[], hostname, url |
| `ModelsSpec` | application port | access (`all` or `selected`), modelIds[], defaultModelId, effectiveModelIds? |
| `TeamModelsRecord` | application port | access, modelIds[], items (`ModelRecord` with callable, priceState, inferenceProfileState) |
| `ServiceModelAccess` | application port | access, enabledModels, callableModels, version |
| `OrchestrationEndpointRecord` | application port | teamId, slug, teamState, agentId, tool, surface, exposure, effective, reasons[], limit, hostname, phase, lastAccessAt |
| `AgentRecord` (changed) | application port | role `worker` or `orchestration`, runtime?, models, template and image nullable for non-service-admin on the orchestration agent |
| `Exposure` | domain | `off`, `private`, `public`; ordered |
| `Tool` | domain | `paperclip`, `buzz` with label, mark, preview flag and surface support |
