# Data dictionary (console records)

| Record | Port | From |
|---|---|---|
| `EndpointRecord` | `AdminModelEndpointsPort` | `ModelEndpoint` |
| `EndpointModelRecord` | both endpoint ports | `EndpointModel` (with `price`, `priceState`, `callable`) |
| `EndpointTeamRecord` | `AdminModelEndpointsPort.teams` | `EndpointTeam` (credential and federation state only) |
| `EndpointProposalRecord` | `AdminModelEndpointsPort.proposals` | `EndpointPriceProposal` |
| `ProviderRecord` | `InferenceProvidersPort` | `InferenceProvider` (+ `impact`) |
| `TeamEndpointRecord` | `TeamModelEndpointsPort` | `TeamModelEndpoint` (`relation`, `selectableBy`, `offReason`) |
| `TeamEndpointsRecord` | `TeamModelEndpointsPort.list` | `TeamModelEndpointList` (`gatewayDeployment`, `mayAddModelEndpoints`) |
| `GatewaySettingsRecord` | `AdminModelEndpointsPort.putGatewaySettings` | `TeamGatewaySettings` |
| `InferenceReportData` | `InferenceReportsPort` | `InferenceReport` |
| `AgentModelsRecord` (+ routes) | `AgentsPort` | `AgentModels` (`routeAccess`, `routes`, `defaultRoute`, `effectiveRoutes`, `env`) |

No record has a credential value member. Credential values pass from the masked input straight to the port call.
