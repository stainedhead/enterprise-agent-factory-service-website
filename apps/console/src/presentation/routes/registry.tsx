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
  T16: lazy(() => import("../screens/t16-collaboration/index.js")),
  V3: lazy(() => import("../screens/t16-collaboration/viewer.js")),
  V1: lazy(() => import("../screens/t1-overview/viewer.js")),
};
