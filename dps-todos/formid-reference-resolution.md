# TODO: Follow FormID References to Target Records

## What
When decoding `formid` fields (e.g. WEAP → Ammo, PROJ → Explosion), optionally resolve and inline or link to the target record's EDID and key fields.

## Example
```json
"Ammo": {
  "form_id": "0x0001F278",
  "editor_id": "10mmRound",
  "signature": "AMMO"
}
```

## Dependencies
- `cross-file-formid.md` for references pointing into master plugins

## Use cases
- MCP / chatbot: "show me this weapon's ammo stats" without a second query
- DPS tooling: chase WEAP → AMMO → PROJ → EXPL chains from live ESM data

## Where to implement
- `esm-parser/src/decode.rs` — optional `resolve_refs` flag on `DecodeContext`
- `esm-parser` CLI: `--follow-refs` / `--ref-depth N`
