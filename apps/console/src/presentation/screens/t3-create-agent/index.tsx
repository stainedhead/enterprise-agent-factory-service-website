import { useParams } from "react-router";
import { CreateAgentPage } from "./CreateAgentPage.js";

/** T3: create an agent (`/t/:teamId/agents/new`). Keyed by team so a draft never crosses teams. */
export default function T3() {
  const { teamId = "" } = useParams();
  return <CreateAgentPage key={teamId} />;
}
