import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Me } from "../../domain/me.js";
import { createQueryClient } from "../query/createQueryClient.js";
import { type AppServices, ServicesContext } from "../services.js";
import { MeProvider } from "../shell/ShellContext.js";

/**
 * Renders one screen with fake use cases (screen tests use fake ports, tasks.md): a router at `path`
 * matching `route`, a fresh query client, the caller, and the services under test.
 */
export function renderScreen(
  ui: ReactElement,
  o: { me: Me; services: Partial<AppServices>; path?: string; route?: string },
) {
  const queryClient = createQueryClient(() => {});
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ServicesContext.Provider value={o.services}>
        <MeProvider value={o.me}>
          <MemoryRouter initialEntries={[o.path ?? "/"]}>
            <Routes>
              <Route path={o.route ?? "*"} element={ui} />
              <Route path="*" element={<p>elsewhere</p>} />
            </Routes>
          </MemoryRouter>
        </MeProvider>
      </ServicesContext.Provider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}
