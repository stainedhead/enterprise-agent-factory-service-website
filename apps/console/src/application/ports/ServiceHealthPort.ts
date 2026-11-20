/** Port: reports whether the Agent Factory API is reachable. Implemented in infrastructure/. */
export interface ServiceHealthPort {
  check(signal?: AbortSignal): Promise<{ healthy: boolean }>;
}
