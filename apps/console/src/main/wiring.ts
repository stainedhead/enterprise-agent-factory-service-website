// Shared list (architecture.md §3.2): one line per port. Unbuilt areas get notImplementedPort, which
// throws Unavailable on first use; M6-X1 fails while any remains.
export class NotImplementedError extends Error {
  readonly area: string;
  constructor(area: string) {
    super(`Port "${area}" is not implemented yet`);
    this.name = "NotImplementedError";
    this.area = area;
  }
}

export function notImplementedPort<T extends object>(area: string): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      if (prop === "then") return undefined;
      return () => {
        throw new NotImplementedError(area);
      };
    },
  });
}
