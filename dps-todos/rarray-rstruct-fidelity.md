# TODO: RArray / RStruct Grouping Fidelity

## What
Improve how sibling subrecords are grouped when the schema defines `rarray` / `rstruct` containers — present structured lists/objects instead of flat per-subrecord maps or `_unmapped` leftovers.

## Problem
xEdit's `wbRStruct` / `wbRArray` model runs of related subrecords (e.g. Keywords = KSIZ + KWDA[], Model = MODL + MODT + …). The POC decoder partially handles these but grouping fidelity is lower than xEdit's tree view.

## Examples needing better grouping
- `wbKeywords` — KSIZ count + KWDA array
- `wbGenericModel` — MODL, MODT, MODC, MODS, MODF siblings
- `wbRArray('Effects', wbEffect)` on SPEL

## References
- `TES5Edit/Core/wbInterface.pas` — `wbRStruct`, `wbRArray` builders
- `esm-parser/src/decode.rs` — `RStruct`, `RArray` arms

## Where to implement
- `esm-parser/src/decode.rs` — consume sibling subrecords as a unit, emit nested JSON arrays
- Extractor: ensure `rstruct` / `rarray` schema shapes match Pascal `wbRStructSK` summary keys
