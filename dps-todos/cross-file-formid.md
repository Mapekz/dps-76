# TODO: Cross-File FormID Resolution & Load-Order Fixup

## What
Resolve FormIDs across multiple plugins using master load order — FO76 full-slot FormIDs encode master index (high byte) + object ID (low 24 bits).

## Current POC behavior
- Single-file index over `SeventySix.esm` only
- FormID fields display as `0xXXXXXXXX` with no cross-file context
- Hardcoded FormIDs `< 0x800` are not special-cased in display beyond hex

## Needed
1. Parse `MAST` list from each plugin's TES4 header
2. Build load-order-aware master index → file mapping
3. Fix up FormID display and lookup across masters (self = master count in FO76)

## References
- `TES5Edit/Core/wbInterface.pas` — FormID (~975), FO76 full-slot only
- `esm-parser/src/formid.rs`
- `esm-parser/src/index.rs`

## Where to implement
- `esm-parser/src/load_order.rs` — multi-plugin open API
- Extend `Database` to accept a load-order file list
