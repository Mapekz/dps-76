# TODO: Hand-Model Hard Union Deciders (SPEL / MGEF / PERK)

## What
Fully decode record types that currently fall back to raw hex because their Pascal definitions use runtime closure deciders that cannot be statically extracted from source.

## Affected deciders
| Decider | Records | Subrecords |
|---------|---------|------------|
| `wbConditions` | SPEL, MGEF, PERK, … | CTDA chains |
| `wbMGEFAssocItemDecider` | MGEF | DATA assoc item branch |
| `wbPerkEffectDataDecider` + EPF* | PERK | PRKE / effect payloads |

## Current POC behavior
```json
"Effects": { "_raw": true, "hex": "...", "reason": "wbPerkEffectDataDecider closure decider" }
```
Header, EDID, and non-union fields decode correctly; decider-gated unions do not.

## References
- `TES5Edit/Core/wbDefinitionsFO76.pas` — `wbConditions` (~6805), `wbMGEFData` (~12664), `wbPerkEffect` (~9928)
- `esm-parser/schema/fo76.json` — `raw_fallback` entries for SPEL/MGEF/PERK

## Where to implement
- Extend `esm-parser/tools/extractor/extract.py` or hand-edit schema branches
- Extend `esm-parser/src/decode.rs` union/decider engine for runtime branch selection
