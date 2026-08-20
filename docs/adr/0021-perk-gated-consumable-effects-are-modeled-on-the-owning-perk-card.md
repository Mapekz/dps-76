# Perk-gated consumable effects are modeled on the owning perk card

MGEF-record-level Conditions started translating (commit 85d92ce);
Happy-Go-Lucky's +2/+3 Luck rides on every alcohol ALCH record as
HasPerk-gated effects (flagged "Hide in UI" on the drink card in-game), and
before the fix extracted as unconditional modifiers (+6 phantom Luck per
drink).

Extraction drops the consumable-side twins
(`CONSUMABLE_MGEFS_MODELED_ELSEWHERE`, `scripts/extract/extract-buffs.ts`)
and the perk card carries its own effect via `extraPerkModifiers`
(`src/data/overrides/perk-overrides.ts`) with an `underAlcoholEffect`
condition (auto-derived from any selected alcohol —
`src/lib/loadout-memo-wrappers.ts`). Same split Live & Love 5 already used
via `buffValueOverrides`.

Alcohol-side `perkFamilyRank` conditions on every drink were considered and
rejected: ~45 records × 3 gated modifiers of dataset noise, a synergy
clause stamped on every drink's effect line, and an empty Happy-Go-Lucky
card contradicting its own in-game text.

Drink cards do not hint the synergy; the perk card shows "+2/+3 Luck
(under alcohol)". Rank arrays REPLACE (rank 2 = +3 total), matching the
ESM's exclusive HasPerk gating.

## Do not undo this

A future reviewer might reasonably want to stamp `perkFamilyRank` gates on
every alcohol ALCH instead of modeling the effect on the perk card —
don't. That reintroduces ~45×3 modifier noise, stamps a synergy clause on
every drink's effect line, and leaves Happy-Go-Lucky's card empty against
its own in-game text. The consumable-side twins stay in
`CONSUMABLE_MGEFS_MODELED_ELSEWHERE`; a new perk-gated ALCH effect of this
shape joins that map and `extraPerkModifiers`, not the drink records.
