import { AGENT_IDS } from "../../fake-afs/fixtures/agents.js";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { WORK_ORDER_IDS } from "../../fake-afs/fixtures/workOrders.js";

const T = TEAMS[0].id;

/** Every service-level route a service admin can open (one per screen or tab). */
export const SERVICE_ROUTES: readonly string[] = [
  "/",
  "/teams",
  "/teams/new",
  `/teams/${T}/admin`,
  "/work-orders",
  "/work-orders/new",
  `/work-orders/${WORK_ORDER_IDS[0]}`,
  "/swarm-templates",
  "/reports",
  "/reports/reconciliation",
  "/reports?tab=collaboration",
  "/cost-tags",
  "/audit",
  "/models",
  "/external-systems",
  "/export-import",
  "/settings/general",
  "/settings/collaboration",
  "/settings/storage-classes",
  "/settings/agent-templates",
  "/settings/identity-providers",
  "/settings/notification-channels",
  "/settings/service-api-keys",
  "/settings/security-operators",
];

/** Every team route, read by a team admin or a team viewer. */
export const TEAM_ROUTES: readonly string[] = [
  `/t/${T}`,
  `/t/${T}/agents`,
  `/t/${T}/agents/new`,
  `/t/${T}/agents/${AGENT_IDS[0]}`,
  `/t/${T}/members`,
  `/t/${T}/members/api-keys`,
  `/t/${T}/secrets`,
  `/t/${T}/identities`,
  `/t/${T}/external-systems`,
  `/t/${T}/models`,
  `/t/${T}/delivery/logs`,
  `/t/${T}/delivery/notifications`,
  `/t/${T}/config`,
  `/t/${T}/budget`,
  `/t/${T}/reports`,
  `/t/${T}/reports?tab=collaboration`,
  `/t/${T}/collaboration`,
  `/t/${T}/reports/agents/${AGENT_IDS[0]}`,
  `/t/${T}/tags`,
  `/t/${T}/history/audit`,
  `/t/${T}/history/revisions`,
];

/** Pools exist only on an ephemeral team (P4). */
export const POOL_ROUTES: readonly string[] = [`/t/${T}/pools`, `/t/${T}/pools/new`];
