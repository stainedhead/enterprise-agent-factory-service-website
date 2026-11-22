// The use cases a screen may call, built once in main/wiring.ts (architecture §3.2: one line per area).
import { createContext, useContext } from "react";
import type { DashboardUseCases } from "../application/usecases/dashboard/DashboardUseCases.js";
import type {
  ApiKeysUseCases,
  MembersUseCases,
} from "../application/usecases/members/MembersUseCases.js";
import type { OverviewUseCases } from "../application/usecases/overview/OverviewUseCases.js";
import type { ListProviders } from "../application/usecases/session/ListProviders.js";
import type { TeamsUseCases } from "../application/usecases/teams/TeamsUseCases.js";

export interface AppServices {
  readonly dashboard: DashboardUseCases;
  readonly apiKeys: ApiKeysUseCases;
  readonly members: MembersUseCases;
  readonly overview: OverviewUseCases;
  readonly teams: TeamsUseCases;
  /** The sign-in providers a team may be bound to (S3, T1, T6). */
  readonly signInProviders: ListProviders;
}

export const ServicesContext = createContext<Partial<AppServices>>({});

/** One area's use cases; a screen whose area is not wired fails loudly rather than rendering empty. */
export function useService<K extends keyof AppServices>(area: K): AppServices[K] {
  const s = useContext(ServicesContext)[area];
  if (!s) throw new Error(`Service "${area}" is not wired in main/wiring.ts`);
  return s;
}

/** Like {@link useService} but returns undefined when the area is not wired (shell parts that must not crash). */
export function useOptionalService<K extends keyof AppServices>(
  area: K,
): AppServices[K] | undefined {
  return useContext(ServicesContext)[area];
}
