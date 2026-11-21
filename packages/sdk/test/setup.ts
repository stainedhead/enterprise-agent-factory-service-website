// A test that forgets to inject a fake fetch must fail loudly instead of reaching a network.
globalThis.fetch = (() => {
  throw new Error("Unmocked fetch: inject a fake fetch (src/testing/fakeFetch.ts)");
}) as typeof fetch;
