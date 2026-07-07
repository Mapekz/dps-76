# TODO: VMAD (Script) Decoding

## What
Decode `VMAD` (Virtual Machine Adapter) subrecords — Papyrus script properties, fragments, and object bindings — into structured JSON instead of raw hex.

## Why (deferred from ESM parser POC)
`wbVMAD` is referenced on many records (WEAP, ARMO, PERK, …) but intentionally skipped; scripts are complex and not needed for the initial structural + field decode POC.

## References
- `TES5Edit/Core/wbDefinitionsFO76.pas` — `wbVMAD` (~5153), fragmented variants for PERK/QUST/SCEN/INFO
- `TES5Edit/Core/wbDefinitionsCommon.pas` — VMAD version/object format helpers

## Where to implement
- Schema entries for `VMAD` struct layout (version-gated)
- `esm-parser/src/decode.rs` — or a dedicated `vmad.rs` module
- Consider raw fallback for unknown VMAD versions with `_raw` marker
