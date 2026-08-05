# Armor picker groups mirror the in-game workbench slot order, including inert mods

`getArmorEffects` (`src/data/armor-modifiers.ts`) used to curate its roster
to only `hasAnyEngineEffect` records (32 of ~890 distinct armor-mod names),
hiding every mod with zero ESM modifiers — jetpack, sleek, custom-fitted,
cushioned, etc. — even though those are real in-game workbench choices. The
weapon OMOD picker had already made the opposite call
(`src/data/omods.ts:126-133`); armor now matches it.

Decision: `getArmorEffects` includes every obtainable, non-cosmetic armor/PA
mod, and `ArmorSection` groups them by the in-game workbench's slot
categories — **Underarmor Lining → Material → Misc → 1★ → 2★ → 3★ → 4★**.
Entries with no engine-effective modifier get `badge: 'inert'` rather than
being dropped.

**Cosmetic exclusion is now an explicit allow-list, not the engine-effect
filter**: `nonLegendaryGroup` (`armor-modifiers.ts`) admits exactly three
non-legendary attach points, documented at that function — everything else
(`ap_armor_Paint`, PA limb paints, `ap_Backpack_*`, `ap_Legendary_Reroll`,
headlamp/skin attach points, `ap_customName`) stays excluded. Jetpack
cosmetic reskins collapse to one entry per attach point
(`isJetpackReskin`), and the representative-record tiebreak for a same-name
group now prefers engine-effective records (`buildEntry`) — both documented
at their functions, not repeated here.

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
id check in `nonLegendaryGroup` is a deliberate un-flattening, not a
workaround.
