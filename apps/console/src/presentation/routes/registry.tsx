// Shared list (architecture.md §3.2): one line per screen, each a lazy import of its page. Screens that are
// tabs or variants of another page (S6, T10, P2, V1, V2) name the page that hosts them. M6-X1: no placeholder remains.
import { type ComponentType, lazy } from "react";
import type { ScreenId } from "../../domain/screens.js";

export type ScreenComponent = ComponentType;

export const registry: Record<Exclude<ScreenId, "AUTH" | "NOT_FOUND">, ScreenComponent> = {
  // P2 (create an ephemeral team) is the budget-step variant of S3, so it shares S3's page
  P2: lazy(() => import("../screens/s3-create-team/index.js")),
  P3: lazy(() => import("../screens/p3-work-orders/index.js")),
  P5: lazy(() => import("../screens/p5-swarm-templates/index.js")),
  P6: lazy(() => import("../screens/p6-work-order/index.js")),
  // S6 (team AWS accounts) is a tab of the service-admin team page, T10 (agent external systems) a tab of the agent panel
  S6: lazy(() => import("../screens/s2-teams/index.js")),
  T10: lazy(() => import("../screens/t2-agents/index.js")),
  P4: lazy(() => import("../screens/p4-pools/index.js")),
  S1: lazy(() => import("../screens/s1-dashboard/index.js")),
  S11: lazy(() => import("../screens/s11-export-import/index.js")),
  S9: lazy(() => import("../screens/s9-cost-tags/index.js")),
  T13: lazy(() => import("../screens/t13-tags/index.js")),
  T8: lazy(() => import("../screens/t8-identities/index.js")),
  S5: lazy(() => import("../screens/s5-audit/index.js")),
  S10: lazy(() => import("../screens/s10-settings/index.js")),
  S2: lazy(() => import("../screens/s2-teams/index.js")),
  S3: lazy(() => import("../screens/s3-create-team/index.js")),
  S4: lazy(() => import("../screens/s4-models/index.js")),
  T14: lazy(() => import("../screens/t14-delivery/index.js")),
  S8: lazy(() => import("../screens/s8-reports/index.js")),
  T11: lazy(() => import("../screens/t11-reports/index.js")),
  T12: lazy(() => import("../screens/t12-report/index.js")),
  T5: lazy(() => import("../screens/t5-budget/index.js")),
  T4: lazy(() => import("../screens/t4-secrets/index.js")),
  T7: lazy(() => import("../screens/t7-config/index.js")),
  T9: lazy(() => import("../screens/t9-external-systems/index.js")),
  S7: lazy(() => import("../screens/s7-external-systems/index.js")),
  V2: lazy(() => import("../screens/t4-secrets/viewer.js")),
  T3: lazy(() => import("../screens/t3-create-agent/index.js")),
  T2: lazy(() => import("../screens/t2-agents/index.js")),
  T6: lazy(() => import("../screens/t6-members/index.js")),
  T15: lazy(() => import("../screens/t15-history/index.js")),
  T1: lazy(() => import("../screens/t1-overview/index.js")),
  // T17 (orchestration) and T18 (its agent configuration tab) are one page; V4 is its read-only variant
  T17: lazy(() => import("../screens/t17-orchestration/index.js")),
  T18: lazy(() => import("../screens/t17-orchestration/index.js")),
  V4: lazy(() => import("../screens/t17-orchestration/viewer.js")),
  S12: lazy(() => import("../screens/s12-orchestration/index.js")),
  V1: lazy(() => import("../screens/t1-overview/viewer.js")),
  // 1.2.0 model endpoint gateway. SG6 (provider policy) is a tab of SG1; SG4/TG4 (inference) are tabs of the
  // reports pages, SG5 a tab of the service-admin team page, TG3/VG2 a tab of the agent panel, TG5 a card of budget
  SG1: lazy(() => import("../screens/sg-model-endpoints/index.js")),
  SG2: lazy(() => import("../screens/sg-model-endpoints/create.js")),
  SG3: lazy(() => import("../screens/sg-model-endpoints/detail.js")),
  SG4: lazy(() => import("../screens/s8-reports/index.js")),
  SG5: lazy(() => import("../screens/s2-teams/index.js")),
  SG6: lazy(() => import("../screens/sg-model-endpoints/index.js")),
  TG1: lazy(() => import("../screens/tg-model-endpoints/index.js")),
  TG2: lazy(() => import("../screens/tg-model-endpoints/create.js")),
  TG3: lazy(() => import("../screens/t2-agents/index.js")),
  TG4: lazy(() => import("../screens/t11-reports/index.js")),
  TG5: lazy(() => import("../screens/t5-budget/index.js")),
  VG1: lazy(() => import("../screens/tg-model-endpoints/viewer.js")),
  VG2: lazy(() => import("../screens/t2-agents/index.js")),
  // 1.3.0 governed MCP servers. SM5 (MCP report) is a tab of the service reports page and TM4 a tab of the agent
  // panel; SM4 is the review queue and one server's review
  SM1: lazy(() => import("../screens/sm-mcp/index.js")),
  SM2: lazy(() => import("../screens/sm-mcp/create.js")),
  SM3: lazy(() => import("../screens/sm-mcp/detail.js")),
  SM4: lazy(() => import("../screens/sm-mcp/reviews.js")),
  SM5: lazy(() => import("../screens/s8-reports/index.js")),
  TM1: lazy(() => import("../screens/tm-mcp/index.js")),
  TM2: lazy(() => import("../screens/tm-mcp/register.js")),
  TM3: lazy(() => import("../screens/tm-mcp/detail.js")),
  TM4: lazy(() => import("../screens/t2-agents/index.js")),
  TM5: lazy(() => import("../screens/tm-mcp/usage.js")),
  VM1: lazy(() => import("../screens/tm-mcp/viewer.js")),
};
