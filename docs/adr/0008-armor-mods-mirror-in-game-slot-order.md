# Armor picker groups mirror the in-game workbench slot order, including inert mods

Before this decision, `getArmorEffects` (`src/data/armor-modifiers.ts`)
curated its roster by filtering to ONLY `hasAnyEngineEffect` records — 32
entries out of ~890 distinct armor-mod names — and `ArmorSection.tsx`
rendered them as two flat groups ("Legendary effects", "Misc & PA mods"),
alphabetical within each. Every mod with zero modifiers in the ESM (jetpack,
sleek, custom-fitted, cushioned, pocketed, dense, shielded, treated, polymer
— the mods a player actually picks at the in-game armor workbench) was
invisible. The weapon OMOD picker had already made the opposite call
(`src/data/omods.ts:126-133`, "show ALL valid + obtainable mods, even those
with zero DPS delta... Zero-modifier non-stock mods show badged 'inert'
instead of vanishing") — armor now matches it.

Decision: `getArmorEffects` includes every obtainable, non-cosmetic armor/PA
mod, and `ArmorSection` groups them the way the in-game workbench does —
**Material → Lining → Misc → 1★ → 2★ → 3★ → 4★** — instead of two flat
buckets. Entries with no engine-effective modifier get `badge: 'inert'`
(same `hasAnyEngineEffect` predicate, now a badge input instead of a filter)
rather than being dropped.

**Cosmetic exclusion is now an explicit allow-list, not the engine-effect
filter.** `nonLegendaryGroup` (`armor-modifiers.ts`) admits exactly four
non-legendary attach points and drops everything else:

| `attachPointEdid` | Group | Example names |
|---|---|---|
| `ap_armor_Tier`, `ap_PowerArmor_Lining` | Material | Polymer, Fiberglass, Shadowed; Mk.I, Model A, Standard Plate |
| `ap_underarmor_style`; `ap_armor_Lining` where id contains `_UnderArmor_` | Lining | Casual Style; Shielded/Treated/Protective/Resistant Lining |
| `ap_armor_Lining` (all other ids); `ap_PowerArmor_Misc` | Misc | Sleek, Cushioned, Deep Pocketed, Jetpack; Targeting HUD, Core Assembly |
| `ap_Legendary1`–`ap_Legendary4` | Legendary, split by `starTier` | Unyielding (1★) … Bruiser's (4★) |

Everything else (`ap_armor_Paint`, the six `ap_PowerArmor_*Mod` limb paints,
`ap_Backpack_*`, `ap_Legendary_Reroll`, headlamp/skin attach points,
`ap_customName`) stays excluded, same outcome as before, now reached
explicitly instead of as a side effect of the engine-effect filter.

**`ap_armor_Lining` is one ESM attach point covering two in-game slots.**
Underarmor lining effects (`mod_armor_UnderArmor_<style>_Shielded`, …) and
non-PA functional Misc mods (`mod_armor_<Set>_Lining_<Torso|Limb>_<Effect>`
— Sleek, Cushioned, Ultra-Light Build, …) share it; the `_UnderArmor_` id
token is the only discriminator, checked in `nonLegendaryGroup`.

**Jetpack cosmetic reskins collapse to one entry per attach point.**
`ap_armor_Lining` and `ap_PowerArmor_Misc` each carry dozens of zero-modifier
jetpack skins (Nuka-Cola Jetpack, MothMan Jet Pack, Alien Invader Jet
Pack, …). `isJetpackReskin` drops any name matching `/jet ?pack/i` except
the two base names ("Jetpack" on `ap_armor_Lining`, "Jet Pack" on
`ap_PowerArmor_Misc`) before the by-name grouping step, so a reskin never
becomes its own roster row.

**Representative-record tiebreak now prefers engine-effective records.**
`buildEntry`'s sort used to be pure `id.localeCompare`; it now sorts
engine-effective records before non-effective ones, then by id. This is a
no-op for every effect that existed before this change (verified: all 16
pre-existing legendary effect ids are unchanged) — it only starts mattering
now that a same-name group can mix an effective and an inert record.

Roster grew from 32 to 170 entries on the 20260803 dump: 24 material / 14
lining / 54 misc (post jetpack-collapse) / 80 legendary (21+19+22+16 across
the four tiers).

## Do not undo this

A future reviewer might reasonably want to go back to filtering the roster
to only engine-effective mods — "why show 24 Material choices that all say
'no effect yet'?" Don't: the armor workbench's Material/Lining slots are
real in-game choices a player makes for every build regardless of whether
this app's engine happens to model their stat effect yet (most don't — DR/ER
mitigation from armor material isn't modeled at all, see
`docs/assumptions.md`'s "Resist mitigation"). Hiding them reads as "this
mod doesn't exist," not "this app doesn't model it yet." The badge is the
honest signal; the filter was the actual gap. This mirrors the weapon
picker's `omods.ts:126-133` decision — don't special-case armor back out of
it.

Also don't fold the `ap_armor_Lining` split (Lining vs Misc) back into one
group to "match the ESM's one attach point" — the ESM's attach-point
boundary is an implementation detail of how Bethesda modeled the mod slot,
not the in-game category a player sees at the workbench. The `_UnderArmor_`
id check is a deliberate un-flattening, not a workaround.
