import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { AppError } from "../../application/errors.js";
import type { SearchPort } from "../../application/ports/me.js";
import { BuildSearchIndex, teamsSource } from "../../application/usecases/BuildSearchIndex.js";
import { ContractNotice } from "../../application/usecases/ContractNotice.js";
import { GetMe } from "../../application/usecases/GetMe.js";
import { DraftStore } from "../../application/usecases/session/DraftStore.js";
import { Session } from "../../application/usecases/session/Session.js";
import type { Me } from "../../domain/me.js";
import { PERMISSIONS, type Permission } from "../../domain/permission.js";
import { AuthContext, type AuthServices } from "../auth/AuthContext.js";
import { createQueryClient } from "../query/createQueryClient.js";
import { appRoutes } from "../routes/AppRoutes.js";
import { AccessDeniedProvider, createAccessDeniedBus } from "../shell/AccessDeniedProvider.js";
import { ShellContext, type ShellServices } from "../shell/ShellContext.js";

const readPerms: Permission[] = PERMISSIONS.filter((p) => p.endsWith(":read"));
export const teamViewerPerms = readPerms;

export const SERVICE_ADMIN: Me = {
  principal: { id: "usr_a", type: "user", name: "Sam Service" },
  serviceAdmin: true,
  securityOperator: false,
  teams: [],
};
export const TEAM_ADMIN: Me = {
  principal: { id: "usr_t", type: "user", name: "Tia Teamadmin" },
  serviceAdmin: false,
  securityOperator: false,
  teams: [
    {
      teamId: "team_1",
      slug: "alpha",
      role: "team_admin",
      permissions: [...PERMISSIONS].filter((p) => !p.startsWith("admin:")),
    },
  ],
};
export const VIEWER: Me = {
  principal: { id: "usr_v", type: "user", name: "Vic Viewer" },
  serviceAdmin: false,
  securityOperator: false,
  teams: [{ teamId: "team_1", slug: "alpha", role: "team_viewer", permissions: readPerms }],
};
export const SEC_OP: Me = {
  principal: { id: "usr_s", type: "user", name: "Sec Op" },
  serviceAdmin: false,
  securityOperator: true,
  teams: [],
};
export const NO_ACCESS: Me = {
  principal: { id: "usr_n", type: "user", name: "Nobody" },
  serviceAdmin: false,
  securityOperator: false,
  teams: [],
};

export interface Harness {
  readonly listTeams: ReturnType<typeof vi.fn>;
  readonly meGet: ReturnType<typeof vi.fn>;
  readonly signOut: ReturnType<typeof vi.fn>;
  readonly contractNotice: ContractNotice;
  readonly bus: ReturnType<typeof createAccessDeniedBus>;
  readonly session: Session;
  readonly router: ReturnType<typeof createMemoryRouter>;
  readonly queryClient: ReturnType<typeof createQueryClient>;
  readonly getMe: GetMe;
  readonly view: ReturnType<typeof render>;
}

/** Renders the whole console shell against fake use-case dependencies. */
export function renderApp(opts: {
  me: Me | Error;
  path: string;
  teams?: { teamId: string; label: string }[];
}): Harness {
  const listTeams = vi.fn(
    async () =>
      opts.teams ?? [
        { teamId: "team_1", label: "Alpha" },
        { teamId: "team_2", label: "Beta" },
      ],
  );
  const search: SearchPort = { listTeams: listTeams as unknown as SearchPort["listTeams"] };
  const meGet = vi.fn(async () => {
    if (opts.me instanceof Error) throw opts.me;
    return opts.me;
  });
  const getMe = new GetMe({ get: meGet }, { now: () => Date.now() });
  const contractNotice = new ContractNotice();
  const signOut = vi.fn(async () => {});
  const bus = createAccessDeniedBus();
  const session = new Session({
    oidc: {} as never,
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    channel: { post: () => {}, subscribe: () => () => {} },
    redirectUri: "r",
    providerById: () => undefined,
  });
  session.establish({ accessToken: "t", expiresAt: 1e15, providerId: "x" });
  const queryClient = createQueryClient((e) => bus.emit(e));
  const shell: ShellServices = {
    config: { environmentName: "Dev" },
    getMe,
    contractNotice,
    searchIndex: new BuildSearchIndex(search, [teamsSource]),
    signOut: { execute: signOut } as never,
  };
  const auth: AuthServices = {
    config: { environmentName: "Dev" },
    listProviders: { execute: async () => ({ providers: [], usedFallback: false }) } as never,
    beginSignIn: { execute: async () => {} } as never,
    completeSignIn: { execute: async () => ({ kind: "login-required" }) } as never,
    reAuthenticate: { execute: async () => {} } as never,
    signOut: shell.signOut,
    session,
    prefs: { get: () => undefined, set: () => {}, remove: () => {} },
    drafts: new DraftStore(),
    relayCallbackToParent: () => false,
  };
  const router = createMemoryRouter(appRoutes(), { initialEntries: [opts.path] });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <ShellContext.Provider value={shell}>
          <AccessDeniedProvider bus={bus}>
            <RouterProvider router={router} />
          </AccessDeniedProvider>
        </ShellContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return {
    listTeams,
    meGet,
    signOut,
    contractNotice,
    bus,
    session,
    router,
    queryClient,
    getMe,
    view,
  };
}

export const accessDenied = (permission?: string, requestId = "req_42") =>
  new AppError({
    kind: "access-denied",
    message: "denied",
    requestId,
    requiredPermission: permission,
  });
