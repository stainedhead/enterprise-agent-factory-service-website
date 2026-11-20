import { describe, expect, it } from "vitest";
import { AfsClient } from "./client.js";
import { AfsError } from "./errors.js";

function fakeFetch(status: number, body: unknown, seen: Request[] = []): typeof fetch {
  return async (input, init) => {
    seen.push(new Request(input, init));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("AfsClient", () => {
  it("returns the decoded body and sends the bearer token", async () => {
    const seen: Request[] = [];
    const client = new AfsClient({
      endpoint: "https://afs.test/",
      token: () => "tok",
      fetch: fakeFetch(200, { status: "ok" }, seen),
    });

    await expect(client.health()).resolves.toEqual({ status: "ok" });
    expect(seen[0]?.url).toBe("https://afs.test/healthz");
    expect(seen[0]?.headers.get("Authorization")).toBe("Bearer tok");
  });

  it("maps API errors to AfsError", async () => {
    const client = new AfsClient({
      endpoint: "https://afs.test",
      fetch: fakeFetch(403, { code: "AccessDenied", message: "no", requestId: "req_1" }),
    });

    const err = await client.health().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AfsError);
    expect((err as AfsError).isAccessDenied).toBe(true);
    expect((err as AfsError).requestId).toBe("req_1");
  });
});
