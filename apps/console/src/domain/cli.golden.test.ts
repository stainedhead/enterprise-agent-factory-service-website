import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCli, type CliValue, renderCli } from "./cli.js";

const DIR = join(import.meta.dirname, "cli.golden");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

interface Case {
  readonly name: string;
  readonly op: string;
  readonly values: Record<string, CliValue>;
}

/** Every create form and action that shows a CLI command (M1-L3). Later milestones add their cases. */
export const CASES: readonly Case[] = [
  {
    name: "create-team",
    op: "CreateTeam",
    values: {
      displayName: "Payments",
      kind: "persistent",
      maxBudgetUsd: "5000.00",
      costCenter: "CC-100",
      models: ["claude-sonnet", "claude-haiku"],
      firstAdmin: { email: "lead@example.com" },
    },
  },
  {
    name: "add-member",
    op: "AddMember",
    values: {
      teamId: "team_1",
      subjectType: "user",
      email: "dev@example.com",
      role: "team_viewer",
    },
  },
  {
    name: "create-api-key",
    op: "CreateApiKey",
    values: {
      teamId: "team_1",
      name: "ci",
      role: "team_viewer",
      expiresAt: "2026-12-22T00:00:00Z",
    },
  },
  {
    name: "create-agent",
    op: "CreateAgent",
    values: { teamId: "team_1", name: "reviewer", template: "default", modelId: "claude-sonnet" },
  },
  {
    name: "create-secret",
    op: "CreateSecret",
    values: { teamId: "team_1", name: "github-token", scope: "team", value: "never-printed" },
  },
  {
    name: "create-pool",
    op: "CreatePool",
    values: { teamId: "team_1", name: "swarm", workers: 4, scratchSizeGiB: 20 },
  },
  {
    name: "scale-pool",
    op: "ScalePool",
    values: { teamId: "team_1", poolId: "pool_1", workers: 8 },
  },
  {
    name: "create-work-order",
    op: "CreateWorkOrder",
    values: {
      title: "Patch CVE-2026-0001",
      templateId: "swt_1",
      severity: "high",
      slaDueAt: "2026-12-01T00:00:00Z",
      repos: [{ host: "github.com", repo: "acme/api" }],
    },
  },
  {
    name: "update-team-guardrails",
    op: "UpdateTeam",
    values: {
      teamId: "team_1",
      isolationTier: "dedicated",
      viewerKubectl: true,
      mayAddExternalSystems: false,
    },
  },
];

describe("CLI preview goldens (M1-L3)", () => {
  mkdirSync(DIR, { recursive: true });
  for (const c of CASES) {
    it(c.name, () => {
      const got = `${renderCli(buildCli(c.op, c.values))}\n`;
      const file = join(DIR, `${c.name}.txt`);
      if (UPDATE || !existsSync(file)) writeFileSync(file, got);
      expect(got).toBe(readFileSync(file, "utf8"));
      expect(got).not.toContain("never-printed");
    });
  }
});
