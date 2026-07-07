# TODO: SPECIAL Parsing from Nukes & Dragons

## What
Parse SPECIAL attribute values from the N&D build URL to use in damage calculations
(currently STR is flat 15 for all builds).

## N&D URL encoding for SPECIAL
The `s=` parameter encodes all 7 SPECIAL values as a 7-character hex string.
Each hex digit represents one attribute in S-P-E-C-I-A-L order.

Example from sample URL: `s=8c114f9`
- S = 8  (STR = 8)
- P = 12 (PER = 12, 'c' in hex)
- E = 1  (END = 1)
- C = 1  (CHA = 1)
- I = 4  (INT = 4)
- A = 15 (AGI = 15, 'f' in hex)
- L = 9  (LCK = 9)

Note: values 10–15 are encoded as hex a–f (lowercase).

## Parsing implementation
```ts
function parseSPECIAL(s: string): Record<string, number> {
  const attrs = ['strength','perception','endurance','charisma','intelligence','agility','luck'];
  const result: Record<string, number> = {};
  for (let i = 0; i < Math.min(s.length, 7); i++) {
    result[attrs[i]] = parseInt(s[i], 16); // base 16
  }
  return result;
}
```

## Legendary SPECIAL perks
Legendary Special perks (e.g. `RadioactiveStrength` = +5 STR above the 15 cap) can push
SPECIAL above 15 up to a maximum. Need to parse these from the N&D leggo perk section and
add to the base SPECIAL values. Cap per attribute: 15 (base) + up to 5 (leggo) = 20.

## Sources that contribute to effective SPECIAL
1. Base SPECIAL from character build (from `s=` param)
2. Legendary SPECIAL perk cards (e.g. RadioactiveStrength)
3. Consumables (e.g. mentats, alcohol — temporary boosts)
4. Mutations
5. Team buffs

For MVP+ (this week): parse base SPECIAL from `s=` and wire STR into melee formula.
Later: add consumable/mutation/team buffs.

## Where to update
- `src/lib/nukes-dragons.ts` — add `parseSPECIALString(s: string)` function
- `src/App.tsx` — set `playerConfig.conditions.strength` etc. from parsed SPECIAL
- Remove the flat STR=15 assumption from `createDefaultPlayerConditions`
