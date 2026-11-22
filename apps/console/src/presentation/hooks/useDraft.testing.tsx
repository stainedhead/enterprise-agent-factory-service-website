import type { ReactElement } from "react";
import { expect } from "vitest";
import type { DraftStore } from "../../application/usecases/session/DraftStore.js";
import { AuthContext, type AuthServices } from "../auth/AuthContext.js";

/** Test helper (FR-004): renders `ui` with a session `DraftStore`, as `main/` wires it. */
export function withDrafts(ui: ReactElement, drafts: DraftStore): ReactElement {
  return (
    <AuthContext.Provider value={{ drafts } as unknown as AuthServices}>{ui}</AuthContext.Provider>
  );
}

/** The form ids that currently hold a draft. */
export const draftIds = (drafts: DraftStore): string[] => Object.keys(drafts.snapshot());

/**
 * The shared FR-004 AC3 check for every draft-adopting form: no draft remains in the session store. The
 * `sessionStorage` carrier is written only by re-authentication; `e2e/specs/auth/drafts.spec.ts` checks it.
 */
export function expectNoDraftLeft(drafts: DraftStore): void {
  expect(draftIds(drafts)).toEqual([]);
}
