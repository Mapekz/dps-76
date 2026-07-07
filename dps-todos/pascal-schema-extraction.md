# TODO: Pascal Compile-and-Introspect Schema Extraction

## What
Alternative to source-parsing `wbDefinitionsFO76.pas`: build a small Free Pascal program that runs `DefineFO76`, walks the resulting def tree in memory, and serializes it to JSON — higher fidelity than regex/bracket parsing in `extract.py`.

## Trade-offs
| Approach | Pros | Cons |
|----------|------|------|
| `extract.py` (current) | Cross-platform, no Pascal toolchain | Misses closure deciders; parsing edge cases |
| Pascal introspect | Full def tree fidelity | Requires FPC; Windows-API portability risk for FO76 xEdit codebase |

## References
- `esm-parser/tools/extractor/extract.py` — current extractor
- `TES5Edit/xEdit/xeInit.pas` — `DefineFO76` dispatch (~1383)

## Where to implement
- New tool under `esm-parser/tools/pascal-extract/` or `TES5Edit/Tools/`
- Output must match `esm-parser/src/schema.rs` JSON schema shape
