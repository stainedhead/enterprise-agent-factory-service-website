import { useEffect, useState } from "react";
import type { ServiceHealth } from "../../application/usecases/CheckServiceHealth.js";
import { useUseCases } from "../AppContext.js";

export function ConnectionBanner() {
  const { checkServiceHealth } = useUseCases();
  const [health, setHealth] = useState<ServiceHealth | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    checkServiceHealth.execute(ctrl.signal).then(setHealth);
    return () => ctrl.abort();
  }, [checkServiceHealth]);

  if (!health) return <p role="status">Connecting to Agent Factory API…</p>;
  if (health.state === "up") return <p role="status">Connected to Agent Factory API</p>;
  return <p role="alert">Agent Factory API unavailable: {health.reason}</p>;
}
