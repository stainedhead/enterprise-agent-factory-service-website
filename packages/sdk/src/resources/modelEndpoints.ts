import type { AfsClient } from "../core/client.js";
import type { CallOptions, Versioned } from "../core/types.js";
import { adminInferenceProviders } from "../generated/resources/admin-inferenceProviders.js";
import type { InferenceProvider, UpdateInferenceProviderRequest } from "../generated/schemas.js";

/** A route model written `<route>/<model>`, as default models and fallbacks name it (API contract 4.13). */
export interface RouteModel {
  /** The route name (the endpoint slug), for example `openai-prod`. */
  readonly route: string;
  /** The model name the client sends in `model`; it may itself contain `/`. */
  readonly model: string;
}

const ROUTE = /^[a-z][a-z0-9-]{1,30}$/;

/** Whether `slug` is a valid route name: a DNS label of 2 to 31 characters starting with a letter. */
export function isRouteName(slug: string): boolean {
  return ROUTE.test(slug);
}

/**
 * The environment variable that carries a route's base URL: `AFS_LLM_<ROUTE>_BASE_URL`, with the route name in
 * upper snake case (`openai-prod` → `AFS_LLM_OPENAI_PROD_BASE_URL`). Pure; gateway contract v1.2.0.
 */
export function routeBaseUrlEnv(route: string): string {
  return `AFS_LLM_${route.toUpperCase().replace(/-/g, "_")}_BASE_URL`;
}

/** Splits `<route>/<model>` at the first `/`; `null` for a Bedrock model id or a malformed value. */
export function parseRouteModel(value: string): RouteModel | null {
  const i = value.indexOf("/");
  if (i <= 0 || i === value.length - 1) return null;
  const route = value.slice(0, i);
  return isRouteName(route) ? { route, model: value.slice(i + 1) } : null;
}

/** Joins a route and a model name as `<route>/<model>`. */
export function formatRouteModel(r: RouteModel): string {
  return `${r.route}/${r.model}`;
}

/** What turning a provider off asks for: the reason, and for Bedrock the fallback default model. */
export interface ProviderOffInput {
  /** Recorded as `disabledReason` and in the audit record. */
  readonly reason: string;
  /** Bedrock only: `<route>/<model>` that becomes the service default model. */
  readonly fallbackModel?: string;
  /** Bedrock only: select the fallback route for every team that lacks it, in the same transaction. */
  readonly selectForAllTeams?: boolean;
}

const offBody = (input: ProviderOffInput): UpdateInferenceProviderRequest => ({
  enabled: false,
  reason: input.reason,
  ...(input.fallbackModel !== undefined && { fallbackModel: input.fallbackModel }),
  ...(input.selectForAllTeams !== undefined && { selectForAllTeams: input.selectForAllTeams }),
});

/**
 * The `admin.inferenceProviders` namespace plus the provider-switch helpers of screen 68a: `impactOf` asks the API
 * what turning a provider off would change (`dryRun=true`, nothing is written) and `turnOff` / `turnOn` send the
 * change with `If-Match`. The API decides; the Bedrock fallback rule is enforced there (`no_fallback_model`).
 */
export function createInferenceProviders(core: AfsClient) {
  const g = adminInferenceProviders(core);
  return {
    ...g,
    /** The impact counts of turning `provider` off, without writing (requires `admin:inference-providers`). */
    impactOf(
      provider: string | Versioned,
      input: ProviderOffInput,
      opts?: CallOptions,
    ): Promise<InferenceProvider> {
      return g.update(provider, offBody(input), { ...opts, dryRun: true });
    },
    /** Turns `provider` off with a reason (and, for Bedrock, the fallback). */
    turnOff(
      provider: string | Versioned,
      input: ProviderOffInput,
      opts?: CallOptions,
    ): Promise<InferenceProvider> {
      return g.update(provider, offBody(input), opts);
    },
    /** Turns `provider` back on; opt-ins, selections, credentials and prices are as they were. */
    turnOn(
      provider: string | Versioned,
      reason?: string,
      opts?: CallOptions,
    ): Promise<InferenceProvider> {
      return g.update(provider, { enabled: true, ...(reason ? { reason } : {}) }, opts);
    },
  };
}
