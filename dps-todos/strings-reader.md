# TODO: STRINGS / DLSTRINGS / ILSTRINGS Reader

## What
Read Bethesda localized string table files and resolve LString `uint32` IDs to human-readable text at decode time.

## Format (from xEdit)
- Header: `count u32`, `dataSize u32`, then `[id u32, offset u32] × count`, then a data block
- **STRINGS**: zstring entries in the data block
- **DLSTRINGS / ILSTRINGS**: length-prefixed strings
- Per-field table choice (which of the three tables a given `lstring` field uses) — see `wbLocalization.pas`

## Why (deferred from ESM parser POC)
`fo76 get` currently emits:
```json
"Name": { "lstring_id": "0x0003E712", "_unresolved": true }
```
instead of the actual item name.

## Dependencies
- `ba2-archive-parser.md` (or loose `Strings/` folder support) to obtain the table files

## References
- `TES5Edit/Core/wbLocalization.pas` (~line 329 for format, ~558 for table choice)
- `esm-parser/src/decode.rs` — `LString` member kind
- `esm-parser/src/schema.rs` — `lstring` schema primitive

## Where to implement
- `esm-parser/src/strings.rs` — table loader + lookup API
- Wire into `decode.rs` and optionally `Database::open()` with a strings path/BA2 source
