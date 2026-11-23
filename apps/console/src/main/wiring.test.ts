// M6-X1: feature complete means nothing is left unbuilt: every area of the console is wired to a real adapter,
// and no placeholder screen or port remains.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AfsClient } from "@afs/sdk";
import { expect, it } from "vitest";
import type { ListProviders } from "../application/usecases/session/ListProviders.js";
import { routeTable } from "../domain/routes.js";
import { registry } from "../presentation/routes/registry.js";
import type { AppServices } from "../presentation/services.js";
import { buildServices } from "./wiring.js";

/** Every key of AppServices: the compiler fails this literal when an area is added or removed. */
const AREAS: Record<keyof AppServices, true> = {
  agents: true,
  collaboration: true,
  orchestration: true,
  configValues: true,
  createAgent: true,
  externalSystems: true,
  adminExternalSystems: true,
  adminStorageClasses: true,
  adminAgentTemplates: true,
  adminModels: true,
  adminPricing: true,
  budgets: true,
  reports: true,
  identity: true,
  adminCostTagStatus: true,
  workOrders: true,
  teamDirectory: true,
  swarmTemplates: true,
  adminServiceTags: true,
  tags: true,
  adminOrgAccounts: true,
  adminAudit: true,
  adminExports: true,
  pools: true,
  reportSchedules: true,
  adminNotificationChannels: true,
  logDestinations: true,
  notifications: true,
  secrets: true,
  history: true,
  identityProviders: true,
  settings: true,
  dashboard: true,
  apiKeys: true,
  adminApiKeys: true,
  adminSecurityOperators: true,
  members: true,
  overview: true,
  teams: true,
  signInProviders: true,
};

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? files(f) : /\.tsx?$/.test(n) ? [f] : [];
  });
const SRC = join(import.meta.dirname, "..");

it("every area of AppServices is wired in buildServices", () => {
  const client = new AfsClient({ endpoint: "https://api.example.test" });
  const clock = { now: () => 0 };
  const services = buildServices(client, clock, { listProviders: {} as ListProviders });
  for (const area of Object.keys(AREAS))
    expect(services[area as keyof AppServices], area).toBeDefined();
});

it("every route, and the viewer variant of each, has a real screen", () => {
  for (const r of routeTable()) {
    expect(registry[r.screen as keyof typeof registry], r.path).toBeDefined();
    if (r.item?.viewerScreen)
      expect(registry[r.item.viewerScreen as keyof typeof registry]).toBeDefined();
  }
});

it("no NotBuiltYet screen and no notImplementedPort remain in the source", () => {
  const hits = files(SRC)
    .filter((f) => !f.endsWith("wiring.test.ts"))
    .filter((f) =>
      /NotBuiltYet|notImplementedPort|NotImplementedError|not built yet/.test(
        readFileSync(f, "utf8"),
      ),
    );
  expect(hits).toEqual([]);
});
