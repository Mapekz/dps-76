# TODO: Armor Mods

## What
Add armor mods that affect outgoing damage (e.g. Bolstering, WWR) and incoming damage
(damage/energy resist from armor pieces and their mods).

## Current state
`ArmorConfig`, `ArmorSlotConfig`, `ArmorPiece`, `ArmorMod` types exist in `src/types/index.ts`.
No armor data is populated, and armor is not factored into damage calculations.

## Outgoing-damage-relevant mods
- Unyielding: +S/P/E/C/I/A/L when below 20% HP (feeds STR melee bonus)
- Zealot's: +damage vs Scorched/Scorchbeast

## Incoming-damage-relevant mods
- WWR: reduces ranged incoming damage
- Bolstering: increases DR/ER at low health
- Overeater's: +DR/ER per food/drink buff

## Phase
Do armor after enemy defenses — both affect the incoming damage path.
