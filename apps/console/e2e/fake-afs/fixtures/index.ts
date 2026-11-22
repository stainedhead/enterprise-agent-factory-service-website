// Shared list: one fixture module per area, added by the area stream.
import type { SeedUser } from "../users.js";
import { coreFixtures } from "./core.js";
import { dashboardFixtures } from "./dashboard.js";
import { historyFixtures } from "./history.js";
import { membersFixtures, resetMembers } from "./members.js";
import { overviewFixtures, resetOverview } from "./overview.js";
import { resetSettings, settingsFixtures } from "./settings.js";
import { resetTeams, teamsFixtures } from "./teams.js";

export interface FixtureContext {
  readonly principal: SeedUser | undefined;
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  readonly body: unknown;
  /** Per-server settings a fixture may need, such as the fake IdP's issuer URL. */
  readonly config: { readonly idpIssuer: string };
}

export interface FixtureResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** A canned answer for one operation. The body is validated against the pinned OpenAPI. */
export interface Fixture {
  readonly method: string;
  /** OpenAPI path template, for example `/v1/teams/{teamId}`. */
  readonly path: string;
  readonly response: FixtureResponse | ((ctx: FixtureContext) => FixtureResponse);
}

export const fixtureModules: readonly (readonly Fixture[])[] = [
  coreFixtures,
  teamsFixtures,
  overviewFixtures,
  membersFixtures,
  dashboardFixtures,
  settingsFixtures,
  historyFixtures,
];

/** Stateful fixture modules register a reset here; the server calls them on `/__reset`. */
export const fixtureResets: readonly (() => void)[] = [
  resetTeams,
  resetOverview,
  resetMembers,
  resetSettings,
];
