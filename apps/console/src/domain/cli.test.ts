import { describe, expect, it } from "vitest";
import { renderCli } from "./cli.js";

describe("renderCli", () => {
  it("renders flags, space-separated lists and quotes unsafe values", () => {
    expect(
      renderCli({
        service: "budgets",
        operation: "put-budget",
        args: [
          ["team-id", "team_1"],
          ["thresholds", ["50", "80", "100"]],
          ["note", "it's fine"],
        ],
      }),
    ).toBe("afs budgets put-budget --team-id team_1 --thresholds 50 80 100 --note 'it'\\''s fine'");
  });
  it("skips undefined, empty and empty-list values", () => {
    expect(
      renderCli({
        service: "teams",
        operation: "list-teams",
        args: [
          ["state", undefined],
          ["kind", ""],
          ["x", []],
        ],
      }),
    ).toBe("afs teams list-teams");
  });
});

import { buildCli, SECRET_FILE_PLACEHOLDER } from "./cli.js";
import { cliOperations } from "./generated/cliOperations.js";

describe("M1-L1 CLI table", () => {
  it("covers the CLI operations with kebab-case flags", () => {
    expect(cliOperations.CreateTeam?.service).toBe("teams");
    expect(cliOperations.CreateTeam?.operation).toBe("create-team");
    expect(cliOperations.UpdateAgent?.path.map((f) => f.flag)).toEqual(["team-id", "agent-id"]);
    expect(Object.keys(cliOperations).length).toBeGreaterThan(150);
  });
  it("marks secret fields", () => {
    expect(cliOperations.CreateSecret?.body.find((f) => f.name === "value")?.secret).toBe(true);
    expect(cliOperations.CreateTeam?.body.find((f) => f.name === "models")?.kind).toBe("list");
    expect(cliOperations.CreateTeam?.body.find((f) => f.name === "firstAdmin")?.kind).toBe("json");
  });
});

describe("M1-L2 buildCli", () => {
  it("renders kebab flags, space-separated lists, JSON for objects and quotes", () => {
    const cmd = renderCli(
      buildCli("CreateTeam", {
        displayName: "Team A",
        kind: "persistent",
        maxBudgetUsd: "5000.00",
        models: ["m1", "m2"],
        firstAdmin: { email: "a@b.c" },
      }),
    );
    expect(cmd).toBe(
      `afs teams create-team --display-name 'Team A' --first-admin '{"email":"a@b.c"}' --kind persistent --max-budget-usd 5000.00 --models m1 m2`,
    );
  });
  it("renders a secret as a file placeholder and never the value", () => {
    const cmd = renderCli(
      buildCli("CreateSecret", {
        teamId: "team_1",
        name: "tok",
        scope: "team",
        value: "SENTINEL-VALUE",
      }),
    );
    expect(cmd).toContain(`--secret-value ${SECRET_FILE_PLACEHOLDER}`);
    expect(cmd).not.toContain("SENTINEL");
  });
  it("rejects an unknown operation or field", () => {
    expect(() => buildCli("NoSuch", {})).toThrow();
    expect(() => buildCli("CreateTeam", { nope: 1 })).toThrow(/no field/);
  });
});
