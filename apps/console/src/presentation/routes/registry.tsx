// Shared list (architecture.md §3.2): one line per screen. A stream replaces its own line with a lazy
// import of its screen; every other line stays a NotBuiltYet placeholder.
import type { ComponentType } from "react";
import type { ScreenId } from "../../domain/screens.js";
import { SCREEN_IDS } from "../../domain/screens.js";
import { NotBuiltYet } from "./NotBuiltYet.js";

export type ScreenComponent = ComponentType;

const placeholder =
  (id: string): ScreenComponent =>
  () => <NotBuiltYet screen={id} />;

export const registry: Record<
  Exclude<ScreenId, "AUTH" | "NOT_FOUND">,
  ScreenComponent
> = Object.fromEntries(SCREEN_IDS.map((id) => [id, placeholder(id)])) as Record<
  (typeof SCREEN_IDS)[number],
  ScreenComponent
>;
