import type { Fixture, FixtureContext } from "./index.js";
import { openOrdersUsing } from "./workOrders.js";

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

const isOperator = (c: FixtureContext) =>
  c.principal?.id === "svc-admin" || c.principal?.id === "sec-op";
const denied = (permission: string) => ({
  status: 403,
  body: {
    code: "AccessDenied",
    message: `Requires ${permission}`,
    requestId: "req_fake_ad",
    details: { requiredPermission: permission },
  },
});
const err = (status: number, code: string, message: string) => ({
  status,
  body: { code, message, requestId: "req_fake_err", details: {} },
});
const find = (id: string | undefined) => templates.findIndex((t) => t.id === id);
let seq = 100;

/** Swarm templates (P5; read by *Create work order*): service admins write, security operators read. */
export const swarmTemplatesFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/admin/swarm-templates",
    response: (c) =>
      isOperator(c) ? { status: 200, body: { items: templates } } : denied("swarm-templates:read"),
  },
  {
    method: "POST",
    path: "/v1/admin/swarm-templates",
    response: (c) => {
      if (c.principal?.id !== "svc-admin") return denied("admin:swarm-templates");
      const b = c.body as Json;
      if (templates.some((t) => t.name === b.name))
        return err(409, "Conflict", `A template named ${String(b.name)} already exists`);
      seq += 1;
      const t: Json = {
        ...b,
        id: `swt_${NS}${String(seq).padStart(4, "0")}`,
        enabled: b.enabled ?? false,
        createdAt: ts,
        updatedAt: ts,
        version: 1,
      };
      templates = [...templates, t];
      return { status: 201, body: t };
    },
  },
  {
    method: "GET",
    path: "/v1/admin/swarm-templates/{templateId}",
    response: (c) => {
      if (!isOperator(c)) return denied("swarm-templates:read");
      const t = templates[find(c.params.templateId)];
      return t ? { status: 200, body: t } : err(404, "NotFound", "Template not found");
    },
  },
  {
    method: "PATCH",
    path: "/v1/admin/swarm-templates/{templateId}",
    response: (c) => {
      if (c.principal?.id !== "svc-admin") return denied("admin:swarm-templates");
      const i = find(c.params.templateId);
      const t = templates[i];
      if (!t) return err(404, "NotFound", "Template not found");
      const next = { ...t, ...(c.body as Json), updatedAt: ts, version: Number(t.version) + 1 };
      templates[i] = next;
      return { status: 200, body: next };
    },
  },
  {
    method: "DELETE",
    path: "/v1/admin/swarm-templates/{templateId}",
    response: (c) => {
      if (c.principal?.id !== "svc-admin") return denied("admin:swarm-templates");
      const t = templates[find(c.params.templateId)];
      if (!t) return err(404, "NotFound", "Template not found");
      if (openOrdersUsing(String(t.id)))
        return err(409, "Conflict", "An open work order uses this template");
      templates = templates.filter((x) => x.id !== t.id);
      return { status: 204 };
    },
  },
  ...(["enable", "disable"] as const).map(
    (verb): Fixture => ({
      method: "POST",
      path: `/v1/admin/swarm-templates/{templateId}:${verb}`,
      response: (c) => {
        if (c.principal?.id !== "svc-admin") return denied("admin:swarm-templates");
        const i = find(c.params.templateId);
        const t = templates[i];
        if (!t) return err(404, "NotFound", "Template not found");
        const next = {
          ...t,
          enabled: verb === "enable",
          version: Number(t.version) + 1,
          updatedAt: ts,
        };
        templates[i] = next;
        return { status: 200, body: next };
      },
    }),
  ),
];
