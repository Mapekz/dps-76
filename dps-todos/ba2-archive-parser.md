# TODO: BA2 Archive Parser (FO76 + LZ4)

## What
Parse `esm-parser/SeventySix - Localization.ba2` and extract the **English** string tables needed to resolve LString IDs when decoding `SeventySix.esm`.

FO76 BA2 uses **BTDX/GNRL** containers with **LZ4** compression (not the zlib used in `.esm` record streams).

## Source asset
```
esm-parser/SeventySix - Localization.ba2   (~205 MB, committed or vendored locally)
```

Archive magic: `BTDX` header, `GNRL` chunks, compression method `3` = LZ4 (`TES5Edit/Core/wbBSArchive.pas`).

## EN entries to extract (for `SeventySix.esm`)
Inside the BA2, paths are lowercase. Pull these three files for English:

| BA2 internal path | Loose xEdit equivalent | Table type |
|-------------------|------------------------|------------|
| `strings/seventysix_en.strings` | `Strings/SeventySix_En.STRINGS` | zstring (`lstring` default) |
| `strings/seventysix_en.dlstrings` | `Strings/SeventySix_En.DLSTRINGS` | length-prefixed |
| `strings/seventysix_en.ilstrings` | `Strings/SeventySix_En.ILSTRINGS` | length-prefixed |

The archive also contains `strings/nw_en.{strings,dlstrings,ilstrings}` and other locales — **ignore non-EN** for the initial implementation. Add `nw_en.*` later only if IDs resolve against the SeventySix tables alone.

## Target output
Decompressed string table bytes (or parsed in-memory tables) passed to the strings reader:

```
esm-parser/strings/SeventySix_En.STRINGS      (extracted)
esm-parser/strings/SeventySix_En.DLSTRINGS
esm-parser/strings/SeventySix_En.ILSTRINGS
```

Alternatively, load directly from BA2 at runtime without writing loose files — but expose the same `TwbLocalizationFile`-compatible API to `decode.rs`.

## Parser integration
Once extracted/loaded, wire into `Database::open()` so `lstring` fields resolve to text:

```json
// before
"Name": { "lstring_id": "0x0003E712", "_unresolved": true }

// after
"Name": "Assault Rifle"
```

Default CLI: auto-detect `SeventySix - Localization.ba2` next to the opened `.esm`, language `en`, plugin stem `SeventySix`.

## Why (deferred from ESM parser POC)
The parser POC shows raw `uint32` LString IDs because string tables were not available. The localization BA2 is now present under `esm-parser/`.

## Dependencies
- Downstream: `strings-reader.md` — parse the decompressed table format
- Rust crate: `lz4_flex` or `lz4` for chunk decompression

## References
- `esm-parser/SeventySix - Localization.ba2` — source archive
- `esm-parser/SeventySix.esm` — plugin that references these tables (localized flag set)
- `TES5Edit/Core/wbBSArchive.pas` — BTDX/GNRL/LZ4 (~533, ~1455, ~1901)
- `TES5Edit/Core/wbLocalization.pas` — table format + `GetLocalizationFileNameByType` (`SeventySix` + `En` + extension)
- `esm-parser/todos.md` — Localization section

## Where to implement
- `esm-parser/src/ba2.rs` — BA2 index, per-entry LZ4 decompress, extract by path
- `esm-parser/tools/extract-strings.rs` or subcommand `fo76 strings extract` — one-shot extraction to `esm-parser/strings/`
- `esm-parser/Cargo.toml` — add LZ4 dependency
- Hook in `esm-parser/src/lib.rs` / `decode.rs` via `strings-reader.md`

## Acceptance criteria
1. `fo76 strings extract --ba2 "SeventySix - Localization.ba2" --lang en` writes the three `SeventySix_En.*` tables.
2. `fo76 get ../TES5Edit/SeventySix.esm --edid AssaultRifle --pretty` shows resolved `FULL` / `DESC` text (not `_unresolved`).
3. Non-EN locales and unrelated BA2 entries are not loaded by default.
