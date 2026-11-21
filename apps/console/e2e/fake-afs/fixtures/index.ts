// Shared list: one fixture module per area, added by the area stream.
export interface Fixture {
  method: string;
  path: string;
  role?: string;
  response: { status: number; body?: unknown; headers?: Record<string, string> };
}
export const fixtureModules: readonly (readonly Fixture[])[] = [];
