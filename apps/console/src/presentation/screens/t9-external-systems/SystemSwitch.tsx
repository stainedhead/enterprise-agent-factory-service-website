import { useId } from "react";
import { Link } from "react-router";
import type {
  SwitchState,
  SystemLevel,
} from "../../../application/usecases/externalSystems/ExternalSystemsUseCases.js";
import { mcpReasonWord } from "../../../domain/mcp.js";

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
  governedBy,
  governedHref,
}: {
  name: string;
  state: SwitchState;
  /** Why the caller cannot change it (the role required), if they cannot. */
  reason: string | undefined;
  busy?: boolean;
  onChange: (on: boolean) => void;
  /** The MCP server that governs this system (1.6.0): the switch is locked and links to the server. */
  governedBy?: string | null | undefined;
  /** Where the governing server's page is, for the link. */
  governedHref?: string | undefined;
}) {
  const whyId = useId();
  if (governedBy) {
    const why = mcpReasonWord("governed_by_mcp_server");
    return (
      <span title={why} id={whyId}>
        <input
          type="checkbox"
          role="switch"
          aria-label={name}
          aria-checked={false}
          checked={false}
          aria-disabled={true}
          aria-describedby={whyId}
          onChange={() => undefined}
        />{" "}
        {why}:{" "}
        {governedHref ? (
          <Link to={governedHref}>
            <code>{governedBy}</code>
          </Link>
        ) : (
          <code>{governedBy}</code>
        )}
      </span>
    );
  }
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
