# Implementation notes

- G1: codegen keeps contract SDK names except `SDK_RENAMES` (one entry, `GetTeamInferenceReport`). Plain `{items}`
  lists serve as If-Match readers only for required If-Match.
