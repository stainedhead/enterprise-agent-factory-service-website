# Data dictionary (console records)

| Record | Port | From |
|---|---|---|
| `McpServerRecord` | `McpCatalogPort`, `TeamMcpPort` | `McpServer` (`credentialState` only, never a value) |
| `McpPrimitiveRecord` | both | `McpPrimitive` (+ `decision`) |
| `McpChangeRecord` | `McpCatalogPort.change` | `McpPrimitiveChange` (diff, checks, `crossesRiskLine`) |
| `McpReviewRecord` | `McpCatalogPort.reviews` | `McpReviewItem` |
| `TeamMcpServerRecord` | `TeamMcpPort` | `TeamMcpServer` (`enabled`, `mode`, `state`, `credential` metadata, `federationState`) |
| `McpCredentialRecord` | both | `McpCredential` (state, scopes, subject, rotatedAt) |
| `EffectiveMcpRecord` | `TeamMcpPort.effective` | `EffectiveMcp` |
| `AgentMcpRecord` | `AgentsPort` | `Agent.mcp` |
| `McpUsageData` | `McpUsagePort` | `McpUsageReport` |
| `QueryCaptureRecord` | `McpCatalogPort` | `McpQueryCapture` |
| `FederatedIdentityRecord` | `FederatedIdentitiesPort` | `FederatedIdentity` |

No record has a credential value member. Credential values pass from the masked input straight to the port call.
