// Shared list (architecture §3.2): one entry per card on the team overview, added by the owning stream.
// Each card renders itself inside a WidgetBoundary; `visibleWhen` says which callers see it.
import type { ReactNode } from "react";
import type { Me } from "../../../domain/me.js";

export interface CardDef {
  readonly id: string;
  readonly visibleWhen: (me: Me, teamId: string) => boolean;
  readonly render: (ctx: { teamId: string }) => ReactNode;
}

/** Cards other streams add (M2 agents health refinements, M3 budget, M4 delivery); the built-in cards are fixed. */
export const cards: readonly CardDef[] = [];
