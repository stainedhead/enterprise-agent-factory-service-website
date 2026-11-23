import type { Page, Paginated, PaginatedCsv, ResponseMeta } from "./types.js";

export interface RawPage<T> {
  items: T[];
  nextToken?: string;
  meta: ResponseMeta;
  extras?: Readonly<Record<string, unknown>>;
}

/** Builds a lazy {@link Paginated} over `fetchPage`; one request per page. */
export function makePaginated<T>(
  fetchPage: (token: string | undefined) => Promise<RawPage<T>>,
  startToken: string | undefined,
  csv?: () => Promise<string>,
): Paginated<T> | PaginatedCsv<T> {
  async function* pages(): AsyncGenerator<Page<T>> {
    let token = startToken;
    for (;;) {
      const page = await fetchPage(token);
      yield page;
      if (!page.nextToken) return;
      token = page.nextToken;
    }
  }
  const base: Paginated<T> = {
    pages,
    first: () => fetchPage(startToken),
    async *[Symbol.asyncIterator]() {
      for await (const p of pages()) yield* p.items;
    },
  };
  return csv ? { ...base, asCsv: csv } : base;
}
