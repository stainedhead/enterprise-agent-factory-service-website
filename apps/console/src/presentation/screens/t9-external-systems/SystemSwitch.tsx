import type {
  SwitchState,
  SystemLevel,
} from "../../../application/usecases/externalSystems/ExternalSystemsUseCases.js";

const LEVEL: Record<SystemLevel, string> = {
  service: "service level",
  team: "team level",
  agent: "agent level",
};

/**
 * The on/off switch of one external system. A system off at a level above the one being edited is shown
 * off and locked, and the text names that level; a caller without the permission sees it disabled with the
 * reason as its tooltip.
 */
export function SystemSwitch({
  name,
  state,
  reason,
  busy,
  onChange,
}: {
  name: string;
  state: SwitchState;
  /** Why the caller cannot change it (the role required), if they cannot. */
  reason: string | undefined;
  busy?: boolean;
  onChange: (on: boolean) => void;
}) {
  const blocked = state.locked || reason !== undefined || busy === true;
  return (
    <span title={reason}>
      <input
        type="checkbox"
        role="switch"
        aria-label={name}
        aria-checked={state.on}
        checked={state.on}
        aria-disabled={blocked}
        onChange={(e) => {
          if (!blocked) onChange(e.target.checked);
        }}
      />{" "}
      {state.on ? "On" : `Off at ${state.level ? LEVEL[state.level] : "service level"}`}
    </span>
  );
}
