# TODO: Tree-Navigation API (Groups → Records → Fields)

## What
Browse plugin structure hierarchically: top-level groups by record type → records → subrecord/field tree — matching xEdit's left-pane navigation model.

## API sketch
```
open(file) → root groups
list_group(offset) → child groups + record headers
get_record(offset) → decoded fields
search(formid | edid | type)
```

## Current POC gap
- Index is flat FormID → offset
- No group-label / group-type navigation
- Decoder returns flat JSON + `_unmapped`, not a navigable tree

## References
- `TES5Edit/Core/wbImplementation.pas` — GRUP types, group type 0 = record signature label
- `esm-parser/src/reader.rs` — recursive `walk_container`

## Where to implement
- `esm-parser/src/tree.rs` — group-aware index
- Extend `lib.rs` public API and CLI subcommands (`browse`, `tree`)
