# Implementation notes

- M1: codegen skips `x-afs-sdk: none` (one operation) and renames eleven namespace-less names (`SDK_RENAMES`). A
  wrapper response (`TeamMcpServer`) gives the reader `versionIn: "server"`; an optional If-Match on such a path gets
  no reader. The MCP credential fields (`value`, `clientSecret`) are CLI secrets (`--secret-value file://<path>`,
  `--client-secret file://<path>`). The domain's browser-global rule ignores quoted names (`"window"` is the MCP
  report's query parameter in the generated CLI table); a red case keeps references caught.
