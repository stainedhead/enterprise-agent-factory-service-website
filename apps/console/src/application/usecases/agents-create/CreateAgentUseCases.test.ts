import { describe, expect, it, vi } from "vitest";
import { fakeAgentsPort } from "../../../presentation/testing/agents.js";
import { fakeConfigPort } from "../../../presentation/testing/secrets.js";
import { AppError } from "../../errors.js";
import { AgentsUseCases } from "../agents/AgentsUseCases.js";
import { ConfigUseCases } from "../config/ConfigUseCases.js";
import {
  type CreateAgentDraft,
  CreateAgentUseCases,
  validateDraft,
} from "./CreateAgentUseCases.js";

const draft = (over: Partial<CreateAgentDraft> = {}): CreateAgentDraft => ({
  name: "security-patcher",
  template: "hermes-dev",
  image: "ghcr.io/acme/hermes-dev@sha256:4b1e",
  persona: "Keeps services patched",
  modelAccess: "selected",
  modelIds: ["claude-sonnet"],
  defaultModelId: "claude-sonnet",
  cpu: "2",
  memory: "8Gi",
  sizeGiB: "20",
  storageClass: "gp3",
  onDelete: "snapshot_then_delete",
  snapshotSchedule: "daily",
  snapshotRetain: "7",
  iamIdentity: "dedicated",
  config: [],
  bindings: [],
  ...over,
});

describe("validateDraft (M2-C1, C3, C5)", () => {
  it("accepts a complete draft", () => {
    expect(validateDraft(draft())).toEqual({});
  });
  it("flags required fields, the size range and a bad name", () => {
    const e = validateDraft(
      draft({
        name: "X",
        template: "",
        image: " ",
        modelIds: [],
        defaultModelId: "",
        sizeGiB: "0",
      }),
    );
    expect(Object.keys(e).sort()).toEqual([
      "defaultModelId",
      "image",
      "models",
      "name",
      "template",
      "volume.sizeGiB",
    ]);
    expect(validateDraft(draft({ sizeGiB: "1001" }))["volume.sizeGiB"]).toBeTruthy();
  });
  it("blocks an env binding whose name is a configuration value of the agent", () => {
    const e = validateDraft(
      draft({
        config: [{ name: "LOG_LEVEL", source: "literal", value: "info" }],
        bindings: [{ secretId: "sec_1", delivery: "env", target: "LOG_LEVEL" }],
      }),
    );
    expect(e["binding.0.target"]).toMatch(/already a configuration value/);
  });
  it("a file binding may share the name; it needs an absolute path", () => {
    expect(
      validateDraft(
        draft({
          config: [{ name: "LOG_LEVEL", source: "literal", value: "info" }],
          bindings: [{ secretId: "sec_1", delivery: "file", target: "/var/run/secrets/x" }],
        }),
      ),
    ).toEqual({});
    expect(
      validateDraft(draft({ bindings: [{ secretId: "sec_1", delivery: "file", target: "x" }] }))[
        "binding.0.target"
      ],
    ).toBeTruthy();
  });
  it("offers Use namespace value only for a name the namespace has", () => {
    const rows = draft({ config: [{ name: "LOG_LEVEL", source: "namespace", value: "" }] });
    expect(validateDraft(rows)["config.0.source"]).toBeTruthy();
    expect(validateDraft(rows, ["LOG_LEVEL"])).toEqual({});
  });
  it("refuses credential-like config names and duplicates", () => {
    const e = validateDraft(
      draft({
        config: [
          { name: "API_TOKEN", source: "literal", value: "x" },
          { name: "A", source: "literal", value: "x" },
          { name: "A", source: "literal", value: "y" },
        ],
      }),
    );
    expect(e["config.0.name"]).toMatch(/credential/);
    expect(e["config.2.name"]).toMatch(/twice/);
  });
});

describe("CreateAgentUseCases (M2-C1)", () => {
  const make = (cfg = fakeConfigPort()) => {
    const agents = fakeAgentsPort();
    return {
      agents,
      cfg,
      uc: new CreateAgentUseCases(new AgentsUseCases(agents), new ConfigUseCases(cfg)),
    };
  };

  it("creates the agent with persona as description and no replica field, then puts the config values", async () => {
    const { agents, cfg, uc } = make();
    const r = await uc.create(
      "team_1",
      draft({
        config: [{ name: "MAX_OPEN_PRS", source: "literal", value: "3" }],
        bindings: [{ secretId: "sec_1", delivery: "env", target: "GITHUB_APP_KEY" }],
      }),
    );
    const body = agents.create.mock.calls[0]?.[1];
    expect(body).toMatchObject({
      name: "security-patcher",
      description: "Keeps services patched",
      iamIdentity: "dedicated",
      resources: { cpu: "2", memory: "8Gi" },
      volume: {
        sizeGiB: 20,
        storageClass: "gp3",
        onDelete: "snapshot_then_delete",
        snapshotSchedule: "daily",
        snapshotRetain: 7,
      },
      secretBindings: [{ secretId: "sec_1", delivery: "env", target: "GITHUB_APP_KEY" }],
    });
    expect(JSON.stringify(body)).not.toMatch(/replica/i);
    expect(cfg.putAgent).toHaveBeenCalledWith(
      "team_1",
      r.agent.id,
      { name: "MAX_OPEN_PRS" },
      { source: "literal", value: "3" },
    );
    expect(r.configFailures).toEqual([]);
  });

  it("does not call the API for an invalid draft", async () => {
    const { agents, uc } = make();
    const e = await uc.create("team_1", draft({ name: "" })).catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect(e.fields.name).toBeTruthy();
    expect(agents.create).not.toHaveBeenCalled();
  });

  it("reports config values the API refused after the agent exists", async () => {
    const cfg = fakeConfigPort({
      putAgent: vi.fn(async () => {
        throw new AppError({ kind: "validation", message: "refused" });
      }),
    });
    const { uc } = make(cfg);
    const r = await uc.create(
      "team_1",
      draft({ config: [{ name: "MAX", source: "literal", value: "1" }] }),
    );
    expect(r.configFailures).toEqual([{ name: "MAX", message: "refused" }]);
  });

  it("passes the API's image refusal through unchanged", async () => {
    const agents = fakeAgentsPort({
      create: vi.fn(async () => {
        throw new AppError({
          kind: "validation",
          message: "tags not accepted",
          fields: { image: "Tags are not accepted" },
        });
      }),
    });
    const uc = new CreateAgentUseCases(
      new AgentsUseCases(agents),
      new ConfigUseCases(fakeConfigPort()),
    );
    const e = await uc.create("team_1", draft({ image: "x:latest" })).catch((x) => x);
    expect(e.fields.image).toBe("Tags are not accepted");
  });
});
