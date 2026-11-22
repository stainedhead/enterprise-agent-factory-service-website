// Composition root: the only place infrastructure adapters are constructed and wired to use cases.
import { AfsClient, bearer } from "@afs/sdk";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { AppError, isAppError } from "../application/errors.js";
import { ConfigError } from "../application/ports/config.js";
import type { MePort } from "../application/ports/me.js";
import {
  BuildSearchIndex,
  teamsSource,
  workOrdersSource,
} from "../application/usecases/BuildSearchIndex.js";
import { ContractNotice } from "../application/usecases/ContractNotice.js";
import { GetMe } from "../application/usecases/GetMe.js";
import { Boot } from "../application/usecases/session/Boot.js";
import { BeginSignIn, CompleteSignIn } from "../application/usecases/session/CompleteSignIn.js";
import { DraftStore } from "../application/usecases/session/DraftStore.js";
import { IdleMonitor } from "../application/usecases/session/IdleMonitor.js";
import { ListProviders } from "../application/usecases/session/ListProviders.js";
import { ReAuthenticate } from "../application/usecases/session/ReAuthenticate.js";
import { Session } from "../application/usecases/session/Session.js";
import { SignOut } from "../application/usecases/session/SignOut.js";
import { BroadcastSessionChannel } from "../infrastructure/auth/BroadcastSessionChannel.js";
import { BrowserRedirect, systemClock } from "../infrastructure/auth/BrowserRedirect.js";
import { OidcClient, postCallbackToParent } from "../infrastructure/auth/OidcClient.js";
import { HttpConfig } from "../infrastructure/config/HttpConfig.js";
import { SdkMe, SdkSearch } from "../infrastructure/sdk/SdkMe.js";
import { SdkProviders } from "../infrastructure/sdk/SdkProviders.js";
import { LocalPreferences } from "../infrastructure/storage/LocalPreferences.js";
import {
  SessionDraftStorage,
  SessionFlowStore,
} from "../infrastructure/storage/SessionFlowStore.js";
import { BeaconTelemetry } from "../infrastructure/telemetry/BeaconTelemetry.js";
import { startTelemetry } from "../infrastructure/telemetry/collect.js";
import { AuthContext, type AuthServices } from "../presentation/auth/AuthContext.js";
import { ConfigErrorPage } from "../presentation/auth/screens.js";
import { createQueryClient } from "../presentation/query/createQueryClient.js";
import { appRoutes } from "../presentation/routes/AppRoutes.js";
import { ServicesContext } from "../presentation/services.js";
import {
  AccessDeniedProvider,
  createAccessDeniedBus,
} from "../presentation/shell/AccessDeniedProvider.js";
import { ShellContext, type ShellServices } from "../presentation/shell/ShellContext.js";
import { buildServices } from "./wiring.js";
import "../presentation/styles/tokens.css";
import "../presentation/styles/base.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element missing");
const root = createRoot(rootEl);

async function start(): Promise<void> {
  const config = await new HttpConfig().load();
  startTelemetry({ port: new BeaconTelemetry(config.telemetryUrl), build: __AFS_BUILD__ });
  const clock = systemClock;
  const redirect = new BrowserRedirect();
  const prefs = new LocalPreferences();
  const drafts = new DraftStore();
  const draftStorage = new SessionDraftStorage();
  const bus = createAccessDeniedBus();
  const contractNotice = new ContractNotice();

  // Local http issuers are allowed only in the e2e build (fake IdP); production requires https.
  const oidc = new OidcClient({ flows: new SessionFlowStore(), allowInsecure: __AFS_E2E__ });

  // Providers are public: a client with no auth.
  const publicClient = new AfsClient({ endpoint: config.apiUrl });
  const listProviders = new ListProviders(new SdkProviders(publicClient), config.providersFallback);
  let known: readonly { id: string }[] = config.providersFallback;
  const providerById = (id: string) =>
    (known as typeof config.providersFallback).find((p) => p.id === id);
  void listProviders.execute().then((r) => {
    known = r.providers;
  });

  const queryClient = createQueryClient((e) => bus.emit(e));
  let getMe: GetMe;
  const session = new Session({
    oidc,
    clock,
    channel: new BroadcastSessionChannel(),
    redirectUri: config.redirectUri,
    providerById,
    clearCaches: () => {
      queryClient.clear();
      getMe?.clear();
    },
  });
  session.onChange((s) => {
    if (s === "signed-out") drafts.clear();
  });

  const client = new AfsClient({
    endpoint: config.apiUrl,
    auth: bearer((o) => session.accessToken(o)),
    onContractMismatch: () => contractNotice.report(),
  });

  const services = buildServices(client, clock, { listProviders });
  const sdkMe = new SdkMe(client);
  const mePort: MePort = {
    get: async (signal) => {
      try {
        return await sdkMe.get(signal);
      } catch (e) {
        if (isAppError(e) && e.kind === "unauthenticated") session.expire();
        throw e;
      }
    },
  };
  getMe = new GetMe(mePort, clock);

  const begin = new BeginSignIn(oidc, redirect, config);
  const signOut = new SignOut(session, redirect, window.location.origin);
  const auth: AuthServices = {
    config,
    listProviders,
    beginSignIn: begin,
    completeSignIn: new CompleteSignIn(oidc, session, clock),
    reAuthenticate: new ReAuthenticate(begin, drafts, draftStorage),
    signOut,
    session,
    prefs,
    drafts,
    relayCallbackToParent: () => postCallbackToParent(),
  };
  const shell: ShellServices = {
    config,
    getMe,
    contractNotice,
    searchIndex: new BuildSearchIndex(new SdkSearch(client), [teamsSource, workOrdersSource]),
    signOut,
  };

  // Idle sign-out (WEB-US-7.9): input resets the timer; it runs only while signed in.
  const idle = new IdleMonitor(clock, config.idleTimeoutMinutes, () => void signOut.execute());
  const touch = () => idle.touch();
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"])
    window.addEventListener(ev, touch, { passive: true });
  session.onChange((s) => (s === "active" ? idle.start() : idle.stop()));

  if (__AFS_E2E__) {
    // Test-only: lets the sentinel scanner read the query and mutation cache. Compiled out otherwise.
    (window as unknown as { __afsE2E: unknown }).__afsE2E = {
      cache: () =>
        JSON.stringify([
          queryClient
            .getQueryCache()
            .getAll()
            .map((q) => q.state.data),
          queryClient
            .getMutationCache()
            .getAll()
            .map((m) => m.state.variables),
        ]),
    };
  }

  await new Boot(listProviders, begin, prefs, drafts, draftStorage, redirect).execute(
    window.location,
  );
  const router = createBrowserRouter(appRoutes());
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>
          <ShellContext.Provider value={shell}>
            <ServicesContext.Provider value={services}>
              <AccessDeniedProvider bus={bus}>
                <RouterProvider router={router} />
              </AccessDeniedProvider>
            </ServicesContext.Provider>
          </ShellContext.Provider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

start().catch((e: unknown) => {
  const reasons =
    e instanceof ConfigError
      ? e.reasons
      : [e instanceof AppError || e instanceof Error ? e.message : "The console failed to start"];
  root.render(
    <StrictMode>
      <ConfigErrorPage reasons={reasons} />
    </StrictMode>,
  );
});
