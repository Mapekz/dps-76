# TODO: axum HTTP + MCP Server

## What
Wrap `esm-parser` in an HTTP server (axum) and expose an MCP tool interface so chatbots and agents can query plugin records by FormID, EditorID, or type.

## Endpoints / tools (sketch)
- `GET /info?file=` — TES4 header
- `GET /record?formid=` / `?edid=` — decoded record JSON
- `GET /list?type=&limit=` — record listing
- MCP tools mirroring the above for LLM use

## Why (deferred from ESM parser POC)
POC ships as a CLI only; server layer is productization.

## Dependencies
- Stable `esm-parser` library API (`lib.rs`)
- Optional: `strings-reader.md` for human-readable names in MCP responses

## Where to implement
- New crate `esm-parser/crates/server/` with axum + MCP SDK
- Reuse `serde_json::Value` output from decoder for clean LLM consumption
