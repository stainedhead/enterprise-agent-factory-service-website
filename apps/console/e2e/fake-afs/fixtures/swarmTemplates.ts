import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
export const TEMPLATE_IDS = [`swt_${NS}0001`, `swt_${NS}0002`] as const;

const seedTemplates = (): Json[] => [
  {
    id: TEMPLATE_IDS[0],
    name: "cve-remediation",
    kind: "cve_remediation",
    description: "Scan, fix and open pull requests for a CVE",
    spec: {
      stages: [
        { name: "scan", position: 1 },
        { name: "fix", position: 2 },
      ],
      pools: [
        { name: "dep-scanner", stage: "scan", workers: 4 },
        { name: "pr-writer", stage: "fix", workers: 16 },
      ],
      handoffs: [{ from: "dep-scanner", to: ["pr-writer"] }],
      secrets: [{ name: "github-token" }],
      configValues: [{ name: "BASE_BRANCH", value: "main" }],
    },
    budgetUsd: "500.00",
    ttlHours: 72,
    teardownRule: "at_work_complete",
    enabled: true,
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  },
  {
    id: TEMPLATE_IDS[1],
    name: "legacy-patcher",
    kind: "general",
    description: "Retired approach",
    spec: {
      stages: [{ name: "patch", position: 1 }],
      pools: [{ name: "patchers", stage: "patch", workers: 2 }],
    },
    budgetUsd: "100.00",
    ttlHours: 24,
    teardownRule: "at_expiry",
    enabled: false,
    createdAt: ts,
    updatedAt: ts,
    version: 3,
  },
];

let templates: Json[] = seedTemplates();
export const currentTemplates = (): readonly Json[] => templates;
export const resetSwarmTemplates = (): void => {
  templates = seedTemplates();
};

/** Swarm templates (P5; read by *Create work order*). */
export const swarmTemplatesFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/admin/swarm-templates",
    response: () => ({ status: 200, body: { items: templates } }),
  },
];
