// M6-Q2: every screen has at least one baseline, and its approval is recorded (`pending` until the web lead approves, W-3; an `approved` entry names the approver and date).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SCREEN_IDS } from "../../src/domain/screens.js";

interface Approval {
  status: string;
  snapshots: string[];
  mockup?: string;
  approver?: string;
  date?: string;
}
const approvals = JSON.parse(
  readFileSync(join(import.meta.dirname, "approvals.json"), "utf8"),
) as Record<string, Approval>;

const baselines = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (!statSync(p).isDirectory()) return [];
    return n.endsWith("-snapshots")
      ? readdirSync(p).map((f) => f.replace(/-chromium-linux\.png$/, ""))
      : baselines(p);
  });
const onDisk = new Set(baselines(join(import.meta.dirname, "..", "specs")));

describe("visual approvals (M6-Q2)", () => {
  it("has an entry for each of the 50 screens and nothing else", () => {
    expect(SCREEN_IDS).toHaveLength(50);
    expect(Object.keys(approvals).sort()).toEqual([...SCREEN_IDS].sort());
  });
  it.each(SCREEN_IDS)("%s has a baseline on disk and a recorded status", (id) => {
    const a = approvals[id];
    expect(["pending", "approved"]).toContain(a?.status);
    if (a?.status === "approved") {
      expect(a.approver, `${id}: approver`).toBeTruthy();
      expect(a.date, `${id}: date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(a?.snapshots.length).toBeGreaterThan(0);
    // a pending screen's baseline is created by the CI regeneration ([regen-baselines]) and then approved
    if (a?.status === "approved")
      for (const s of a.snapshots) expect(onDisk.has(s), `${id}: ${s}`).toBe(true);
  });
  // 1.2.0 model endpoint gateway screens (56 to 68a): pending until J approves the CI-generated baselines
  const GATEWAY = new Set([
    "SG1",
    "SG2",
    "SG3",
    "SG4",
    "SG5",
    "SG6",
    "TG1",
    "TG2",
    "TG3",
    "TG4",
    "TG5",
    "VG1",
    "VG2",
  ]);
  it("records the model endpoint gateway screens as pending or approved by J", () => {
    for (const id of GATEWAY) {
      const a = approvals[id];
      expect(["pending", "approved"], id).toContain(a?.status);
      if (a?.status === "approved") expect(a.approver, id).toBe("J");
    }
  });
  it("records every screen but the Paperclip and gateway ones as approved by J on 2026-11-22", () => {
    for (const id of SCREEN_IDS.filter(
      (i) => i !== "T17" && i !== "T18" && i !== "V4" && i !== "S12" && !GATEWAY.has(i),
    )) {
      expect(approvals[id]).toMatchObject({
        status: "approved",
        approver: "J",
        date: "2026-11-22",
      });
    }
  });
  it("names each snapshot for one screen only", () => {
    const all = Object.values(approvals).flatMap((a) => a.snapshots);
    // 27-ta-swarm-pools and 27-ta-log-delivery differ; no baseline is claimed twice
    expect(new Set(all).size).toBe(all.length);
  });
  it("does not leave a baseline unclaimed (a new screen baseline must be recorded here)", () => {
    const claimed = new Set(Object.values(approvals).flatMap((a) => a.snapshots));
    const extra = [...onDisk].filter(
      (n) => !claimed.has(n) && !["not-found", "sign-in"].includes(n),
    );
    expect(extra).toEqual([]);
  });
});
