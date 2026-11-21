import {
  ConfigError,
  type ConfigPort,
  parseConfig,
  type RuntimeConfig,
} from "../../application/ports/config.js";

/** Loads `/config.json` at start-up, never from cache, so one build serves every environment (D43). */
export class HttpConfig implements ConfigPort {
  constructor(
    private readonly url = "/config.json",
    private readonly fetcher: typeof fetch = (...a) => fetch(...a),
  ) {}

  async load(): Promise<RuntimeConfig> {
    let res: Response;
    try {
      res = await this.fetcher(this.url, { cache: "no-store" });
    } catch {
      throw new ConfigError(["config.json could not be fetched"]);
    }
    if (!res.ok) throw new ConfigError([`config.json returned HTTP ${res.status}`]);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ConfigError(["config.json is not valid JSON"]);
    }
    return parseConfig(body);
  }
}
