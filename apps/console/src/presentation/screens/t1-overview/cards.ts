// Shared list (architecture §3.2): one entry per card on the team overview, added by the owning stream.
// Each card renders itself inside a WidgetBoundary; `visibleWhen` says which callers see it.
import { createElement, type ReactNode } from "react";
import { can, type Me } from "../../../domain/me.js";
import { GuardrailsTab } from "../team-admin/tabs/guardrails/GuardrailsTab.js";
import { EphemeralCard } from "./ephemeral/EphemeralCard.js";
import { KubeconfigCard } from "./kubeconfig/KubeconfigCard.js";

export interface CardDef {
  readonly id: string;
  readonly visibleWhen: (me: Me, teamId: string) => boolean;
  readonly render: (ctx: { teamId: string }) => ReactNode;
}

/** Cards other streams add (M5 ephemeral team and kubeconfig); the built-in cards are fixed. */
export const cards: readonly CardDef[] = [
  {
    id: "ephemeral-team",
    visibleWhen: (me, teamId) => can(me, "teams:read", teamId),
    render: ({ teamId }) => createElement(EphemeralCard, { teamId }),
  },
  {
    id: "kubeconfig",
    visibleWhen: (me, teamId) => can(me, "teams:read", teamId),
    render: ({ teamId }) => createElement(KubeconfigCard, { teamId }),
  },
  {
    id: "guardrails",
    visibleWhen: (me, teamId) => can(me, "teams:read", teamId),
    render: ({ teamId }) => createElement(GuardrailsTab, { teamId }),
  },
];
