import { AfsError } from "./errors.js";

/** Supplies a bearer token per request (OIDC access token or API key). */
export type TokenProvider = () => string | undefined | Promise<string | undefined>;

export interface AfsClientOptions {
  /** Base URL of afs-api, for example https://afs.example.internal */
  endpoint: string;
  token?: TokenProvider;
  /** Injected for tests and non-browser runtimes. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

export interface HealthStatus {
  status: string;
}

/** Low-level client for the Agent Factory REST API. Resource clients build on `request`. */
export class AfsClient {
  readonly #endpoint: string;
  readonly #token: TokenProvider | undefined;
  readonly #fetch: typeof fetch;

  constructor(options: AfsClientOptions) {
    this.#endpoint = options.endpoint.replace(/\/+$/, "");
    this.#token = options.token;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** GET /healthz */
  health(signal?: AbortSignal): Promise<HealthStatus> {
    return this.request<HealthStatus>("GET", "/healthz", { signal });
  }

  /** Sends a JSON request and returns the decoded body, or throws AfsError. */
  async request<T>(
    method: string,
    path: string,
    init: {
      body?: unknown;
      headers?: Record<string, string>;
      signal?: AbortSignal | undefined;
    } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json", ...init.headers };
    const token = await this.#token?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: string | undefined;
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.body);
    }

    const res = await this.#fetch(`${this.#endpoint}${path}`, {
      method,
      headers,
      ...(body !== undefined && { body }),
      ...(init.signal && { signal: init.signal }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
        requestId?: string;
      };
      throw new AfsError(
        res.status,
        err.code ?? "InternalError",
        err.message ?? res.statusText,
        err.requestId ?? res.headers.get("X-Request-Id") ?? undefined,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
