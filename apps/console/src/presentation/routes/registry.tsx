// Shared list (architecture.md §3.2): one line per screen. A stream replaces its own line with a lazy
// import of its screen; every other line stays a NotBuiltYet placeholder.
import { type ComponentType, lazy } from "react";
import type { ScreenId } from "../../domain/screens.js";
import { SCREEN_IDS } from "../../domain/screens.js";
import { NotBuiltYet } from "./NotBuiltYet.js";

export type ScreenComponent = ComponentType;

const placeholder =
  (id: string): ScreenComponent =>
  () => <NotBuiltYet screen={id} />;

export const registry: Record<Exclude<ScreenId, "AUTH" | "NOT_FOUND">, ScreenComponent> = {
  ...(Object.fromEntries(SCREEN_IDS.map((id) => [id, placeholder(id)])) as Record<
    (typeof SCREEN_IDS)[number],
    ScreenComponent
  >),
  // one line per built screen
  S1: lazy(() => import("../screens/s1-dashboard/index.js")),
  S10: lazy(() => import("../screens/s10-settings/index.js")),
  S2: lazy(() => import("../screens/s2-teams/index.js")),
  S3: lazy(() => import("../screens/s3-create-team/index.js")),
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
  V1: lazy(() => import("../screens/t1-overview/viewer.js")),
};
