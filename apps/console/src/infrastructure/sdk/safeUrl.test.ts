import { describe, expect, it } from "vitest";
import { httpsUrlOrUndefined } from "./safeUrl.js";

describe("httpsUrlOrUndefined (FR-020)", () => {
  it.each([
    ["https://github.com/acme/api/pull/7", "https://github.com/acme/api/pull/7"],
    ["HTTPS://example.test/x", "HTTPS://example.test/x"],
    ["javascript:alert(1)", undefined],
    [" javascript:alert(1)", undefined],
    ["data:text/html,<script>1</script>", undefined],
    ["http://example.test/x", undefined],
    ["//example.test/x", undefined],
    ["/relative", undefined],
    ["not a url", undefined],
    ["", undefined],
    [null, undefined],
    [undefined, undefined],
  ])("%j -> %j", (input, out) => {
    expect(httpsUrlOrUndefined(input)).toBe(out);
  });
});
