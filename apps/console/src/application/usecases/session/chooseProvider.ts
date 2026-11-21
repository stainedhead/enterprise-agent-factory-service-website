import type { ProviderInfo } from "../../ports/config.js";

export type ProviderChoice =
  | { kind: "none" }
  | { kind: "redirect"; provider: ProviderInfo }
  | { kind: "pick"; providers: readonly ProviderInfo[]; preselected: string };

/**
 * Decides how to sign in (WEB-US-7.1, 7.2): a `?provider=` deep link skips the picker; one provider goes
 * straight to it; several show the picker with the remembered (else default) provider preselected.
 */
export function chooseProvider(input: {
  providers: readonly ProviderInfo[];
  remembered?: string | undefined;
  deepLinkProvider?: string | undefined;
}): ProviderChoice {
  const { providers } = input;
  if (providers.length === 0) return { kind: "none" };
  const linked = providers.find((p) => p.id === input.deepLinkProvider);
  if (linked) return { kind: "redirect", provider: linked };
  if (providers.length === 1) return { kind: "redirect", provider: providers[0] as ProviderInfo };
  const pre =
    providers.find((p) => p.id === input.remembered) ??
    providers.find((p) => p.isDefault) ??
    (providers[0] as ProviderInfo);
  return { kind: "pick", providers, preselected: pre.id };
}

/** Where a `?teamId=` deep link goes after sign-in; a team the caller cannot see is not found, never confirmed. */
export function resolveTeamDeepLink(
  teams: readonly { teamId: string }[],
  teamId: string | undefined,
): { kind: "none" } | { kind: "team"; route: string } | { kind: "not-found" } {
  if (!teamId) return { kind: "none" };
  return teams.some((t) => t.teamId === teamId)
    ? { kind: "team", route: `/t/${teamId}` }
    : { kind: "not-found" };
}
