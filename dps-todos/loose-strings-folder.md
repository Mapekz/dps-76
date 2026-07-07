# TODO: Loose Strings/ Folder Runtime Option

## What
Support resolving LString IDs from a loose `Strings/` directory (as xEdit can use) without requiring BA2 extraction — useful for modders and dev setups that already have unpacked string files.

## Why (deferred from ESM parser POC)
Not all environments have BA2 archives; some workflows ship or generate loose `Strings/En/*.STRINGS` (and DL/IL variants) alongside plugins.

## Expected layout
Mirror xEdit's loose-strings convention:
```
Strings/
  SeventySix_En.STRINGS
  SeventySix_En.DLSTRINGS
  SeventySix_En.ILSTRINGS
```
(or per-master naming matching the plugin's localized name)

## Dependencies
- `strings-reader.md` — shared table parser

## Where to implement
- `esm-parser` CLI flags: e.g. `--strings-dir <path>`
- `Database::open()` options struct passing strings source into decoder
