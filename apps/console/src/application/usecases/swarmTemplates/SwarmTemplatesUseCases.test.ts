import { describe, expect, it, vi } from "vitest";
import type { SwarmTemplateRecord, SwarmTemplatesPort } from "../../ports/swarmTemplates.js";
import {
  draftOf,
  emptyDraft,
  parseSpec,
  SwarmTemplatesUseCases,
  specText,
  summarise,
  type TemplateDraft,
  validateTemplate,
} from "./SwarmTemplatesUseCases.js";

const t = (
  id: string,
  enabled: boolean,
  over: Partial<SwarmTemplateRecord> = {},
): SwarmTemplateRecord => ({
  id,
  name: id,
  kind: "general",
  budgetUsd: "1.00",
  ttlHours: 1,
  teardownRule: "at_expiry",
  enabled,
  spec: { stages: [{ name: "scan", position: 1 }], pools: [{ name: "w", workers: 2 }] },
  version: 4,
  ...over,
});
const port = (over: Partial<SwarmTemplatesPort> = {}) =>
  ({
    list: vi.fn(async () => [t("a", true), t("b", false)]),
    get: vi.fn(),
    create: vi.fn(async () => t("n", false)),
    update: vi.fn(async () => t("a", true)),
    delete: vi.fn(async () => undefined),
    enable: vi.fn(async () => t("a", true)),
    disable: vi.fn(async () => t("a", false)),
    ...over,
  }) as unknown as SwarmTemplatesPort;
const valid = (over: Partial<TemplateDraft> = {}): TemplateDraft => ({
  ...draftOf(t("cve-fix", true, { budgetUsd: "500.00", ttlHours: 72 })),
  name: "cve-fix",
  ...over,
});

describe("SwarmTemplatesUseCases reads (M6-W1)", () => {
  it("offers only enabled templates for a work order", async () => {
    const uc = new SwarmTemplatesUseCases(port());
    expect((await uc.enabled()).map((x) => x.id)).toEqual(["a"]);
    expect(await uc.list()).toHaveLength(2);
  });
});

describe("template validation (M6-T1)", () => {
  it("accepts a complete draft", () => expect(validateTemplate(valid(), true)).toEqual({}));
  it("refuses a bad name only when creating", () => {
    expect(validateTemplate(valid({ name: "Bad Name" }), true).name).toBeTruthy();
    expect(validateTemplate(valid({ name: "Bad Name" }), false).name).toBeUndefined();
  });
  it("refuses a cap of zero or text, and a TTL out of range", () => {
    expect(validateTemplate(valid({ budgetUsd: "0" }), true).budgetUsd).toBeTruthy();
    expect(validateTemplate(valid({ budgetUsd: "abc" }), true).budgetUsd).toBeTruthy();
    expect(validateTemplate(valid({ budgetUsd: "" }), true).budgetUsd).toBeTruthy();
    for (const ttl of ["0", "8761", "1.5", "x"])
      expect(validateTemplate(valid({ ttlHours: ttl }), true).ttlHours).toBeTruthy();
    expect(validateTemplate(valid({ ttlHours: "8760" }), true).ttlHours).toBeUndefined();
  });
});

describe("parseSpec", () => {
  it("round-trips the editor text", () => {
    const s = t("a", true).spec;
    expect(parseSpec(specText(s)).spec).toMatchObject({ stages: s.stages, pools: s.pools });
  });
  it.each([
    ["{", "not valid JSON"],
    ["[]", "must be an object"],
    ['{"stages":[{}],"pools":[{}],"extra":[]}', "Unknown spec section"],
    ['{"stages":{},"pools":[{}]}', "must be a list"],
    ['{"stages":[1],"pools":[{}]}', "must be an object"],
    ['{"stages":[],"pools":[{}]}', "at least one stage"],
    ['{"stages":[{}],"pools":[]}', "at least one pool"],
  ])("refuses %s", (text, msg) => expect(parseSpec(text).error).toContain(msg));
  it("keeps the optional sections it was given", () => {
    const p = parseSpec(
      '{"stages":[{"name":"a"}],"pools":[{"name":"b"}],"handoffs":[],"secrets":[{"name":"s"}],"configValues":[]}',
    );
    expect(p.spec?.secrets).toEqual([{ name: "s" }]);
  });
});

describe("summarise", () => {
  it("orders stages and words pools, handoffs, secrets and configuration", () => {
    const s = summarise({
      stages: [
        { name: "fix", position: 2 },
        { name: "scan", position: 1 },
      ],
      pools: [{ name: "w", workers: 3 }, { name: "x" }],
      handoffs: [{ from: "w", to: ["x", "y"] }],
      secrets: [{ name: "gh" }],
      configValues: [{ name: "BRANCH" }],
    });
    expect(s).toEqual({
      stages: ["scan", "fix"],
      pools: ["w (3 workers)", "x"],
      handoffs: ["w → x, y"],
      secrets: ["gh"],
      configValues: ["BRANCH"],
    });
  });
});

describe("SwarmTemplatesUseCases writes (M6-T1)", () => {
  it("creates a disabled template from a valid draft and refuses an invalid one without calling the API", async () => {
    const p = port();
    const uc = new SwarmTemplatesUseCases(p);
    await uc.create(valid());
    expect(p.create).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, budgetUsd: "500.00", ttlHours: 72 }),
    );
    await expect(uc.create(valid({ name: "X" }))).rejects.toMatchObject({ kind: "validation" });
    expect(p.create).toHaveBeenCalledOnce();
  });
  it("sends only the changed fields, with the version", async () => {
    const p = port();
    const cur = t("a", true, { budgetUsd: "500.00", ttlHours: 72 });
    await new SwarmTemplatesUseCases(p).update(cur, {
      ...draftOf(cur),
      ttlHours: "96",
      description: "new",
    });
    expect(p.update).toHaveBeenCalledWith(
      { id: "a", version: 4 },
      { description: "new", ttlHours: 96 },
    );
  });
  it("refuses an update that changes nothing", async () => {
    const cur = t("a", true);
    await expect(
      new SwarmTemplatesUseCases(port()).update(cur, draftOf(cur)),
    ).rejects.toMatchObject({
      message: "Nothing has changed",
    });
  });
  it("enables, disables and deletes with the version", async () => {
    const p = port();
    const uc = new SwarmTemplatesUseCases(p);
    const cur = t("a", true);
    await uc.enable(cur);
    await uc.disable(cur);
    await uc.delete(cur);
    expect(p.enable).toHaveBeenCalledWith("a");
    expect(p.disable).toHaveBeenCalledWith("a");
    expect(p.delete).toHaveBeenCalledWith({ id: "a", version: 4 });
  });
  it("starts from an empty draft that is not yet valid", () => {
    expect(Object.keys(validateTemplate(emptyDraft, true))).toEqual(
      expect.arrayContaining(["name", "budgetUsd", "spec"]),
    );
  });
});
