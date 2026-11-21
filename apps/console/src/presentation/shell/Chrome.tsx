import { useSyncExternalStore } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { type ActiveRole, activeRole, type Me } from "../../domain/me.js";
import { type NavGroup, routeFor, visibleItems } from "../../domain/navigation.js";
import { ActionsMenu, Alert, Banner } from "../components/index.js";
import { HeaderSearch } from "./HeaderSearch.js";
import { useAccessDenied, useShell } from "./ShellContext.js";
import s from "./shell.module.css";

const PILL: Record<ActiveRole, { label: string; cls: string }> = {
  service_admin: { label: "Service admin", cls: s.pillAdmin as string },
  security_operator: { label: "Security operator", cls: s.pillSecOp as string },
  team_admin: { label: "Team-admin", cls: s.pillTeamAdmin as string },
  team_viewer: { label: "Team viewer", cls: s.pillViewer as string },
  workload: { label: "Workload", cls: s.pillViewer as string },
  none: { label: "No role", cls: s.pillViewer as string },
};

export function RolePill({ me, teamId }: { me: Me; teamId?: string | undefined }) {
  const p = PILL[activeRole(me, teamId)];
  return <span className={`${s.pill} ${p.cls}`}>{p.label}</span>;
}

/** The dark global header: brand, environment, search, active role and team, identity menu (WEB-3). */
export function Header({ me, teamId }: { me: Me; teamId?: string | undefined }) {
  const { config, signOut } = useShell();
  const team = teamId ? me.teams.find((t) => t.teamId === teamId) : undefined;
  const who = me.principal.name ?? me.principal.email ?? me.principal.id;
  return (
    <header className={s.header}>
      <Link to="/" className={s.brand}>
        Agent Factory
      </Link>
      <span className={s.env}>{config.environmentName}</span>
      <HeaderSearch />
      <span className={s.spacer} />
      <RolePill me={me} teamId={teamId} />
      {(team || teamId) && <span className={s.teamName}>{team?.slug ?? teamId}</span>}
      <ActionsMenu
        label={who}
        actions={[{ id: "sign-out", label: "Sign out", onSelect: () => void signOut.execute() }]}
      />
    </header>
  );
}

/** Lists exactly the teams in `GetMe`; service admins also get *All teams* (WEB-US-8.6). */
export function TeamSwitcher({ me, teamId }: { me: Me; teamId?: string | undefined }) {
  const navigate = useNavigate();
  if (!me.serviceAdmin && me.teams.length === 0) return null;
  return (
    <div className={s.switcher}>
      <label htmlFor="team-switcher">Team</label>
      <select
        id="team-switcher"
        value={teamId ?? ""}
        onChange={(e) => navigate(e.target.value === "" ? "/" : `/t/${e.target.value}`)}
      >
        {(me.serviceAdmin || !teamId) && (
          <option value="">{me.serviceAdmin ? "All teams" : "Select a team"}</option>
        )}
        {me.teams.map((t) => (
          <option key={t.teamId} value={t.teamId}>
            {t.slug}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Side navigation filtered by each item's `visibleWhen` for the caller and current team. */
export function SideNav({ me, teamId }: { me: Me; teamId?: string | undefined }) {
  const team = teamId ? { teamId } : undefined;
  const items = visibleItems(me, team);
  const groups = [...new Set(items.map((i) => i.group))] as NavGroup[];
  return (
    <nav className={s.nav} aria-label="Main">
      <TeamSwitcher me={me} teamId={teamId} />
      {groups.map((g) => (
        <section key={g} aria-label={g}>
          <h2>{g}</h2>
          <ul>
            {items
              .filter((i) => i.group === g)
              .map((i) => (
                <li key={i.id}>
                  <NavLink to={routeFor(i, teamId)} end>
                    {i.label}
                  </NavLink>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

const subscribeWidth = (cb: () => void) => {
  const m = window.matchMedia("(max-width: 1023px)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** The console is designed for 1024 px and wider; narrower viewports get a notice, not a broken layout. */
export function NarrowViewportNotice() {
  const narrow = useSyncExternalStore(
    subscribeWidth,
    () => window.matchMedia("(max-width: 1023px)").matches,
    () => false,
  );
  if (!narrow) return null;
  return <Banner>This console works best on a screen at least 1024 px wide.</Banner>;
}

/** Dismissible notice when the server's contract is newer than this build's (D47). */
export function ContractBanner() {
  const { contractNotice } = useShell();
  const visible = useSyncExternalStore(
    (cb) => contractNotice.onChange(cb),
    () => contractNotice.visible,
  );
  if (!visible) return null;
  return (
    <Banner action={{ label: "Reload", onClick: () => window.location.reload() }}>
      A newer version of AFS is available; reload.{" "}
      <button type="button" onClick={() => contractNotice.dismiss()}>
        Dismiss
      </button>
    </Banner>
  );
}

/** The access-denied alert: names the permission and the request id, for any call (WEB-US-8.9). */
export function AccessDeniedAlert() {
  const { error, dismiss } = useAccessDenied();
  if (!error) return null;
  const perm = error.requiredPermission;
  return <AlertWrap perm={perm} requestId={error.requestId} onDismiss={dismiss} />;
}

function AlertWrap({
  perm,
  requestId,
  onDismiss,
}: {
  perm: string | undefined;
  requestId: string | undefined;
  onDismiss: () => void;
}) {
  return (
    <Alert kind="error" title="Access denied" requestId={requestId} onDismiss={onDismiss}>
      {perm ? (
        <>
          You do not have permission to do that. It requires <code>{perm}</code>.
        </>
      ) : (
        "You do not have permission to do that."
      )}
    </Alert>
  );
}
