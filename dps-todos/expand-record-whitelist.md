# TODO: Expand Record Whitelist Beyond Initial 8

## What
Grow `schema/fo76.json` coverage beyond the POC's eight record types: **AMMO, ARMO, PROJ, EXPL, WEAP, SPEL, MGEF, PERK**.

## Process
1. Add signatures to the whitelist in `esm-parser/tools/extractor/extract.py` (`WHITELIST`)
2. Re-run extractor (or hand-craft schema entries for hard types)
3. Commit updated `schema/fo76.json`
4. Spot-check decoded output against xEdit for sample records

## Priority candidates for DPS / data tooling
Likely next signatures: **ENCH**, **OMOD**, **COBJ**, **LVLI**, **KYWD**, **AVIF**, **CURV**, **NPC_**, **ALCH**

## References
- `TES5Edit/Core/wbDefinitionsFO76.pas` — `DefineFO76` record list
- `esm-parser/tools/extractor/extract.py` — `WHITELIST` constant

## Where to implement
- `esm-parser/tools/extractor/extract.py`
- `esm-parser/schema/fo76.json`
