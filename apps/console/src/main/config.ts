export interface ConsoleConfig {
  apiEndpoint: string;
}

export function loadConfig(env: Record<string, string | undefined>): ConsoleConfig {
  return { apiEndpoint: env.VITE_AFS_ENDPOINT ?? "http://localhost:8080" };
}
