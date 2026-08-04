# Armor legendary effects are budgeted per star tier

The Armor checklist (`PlayerConfig.armorEffects`, effect id → worn-piece
count) originally treated every effect independently: each legendary effect
allowed 0–5 pieces, so Unyielding ×5 + Bruiser's ×5 was representable even
though both are 1★ effects competing for the same five armor pieces in game.

Decision: the model now enforces a **Tier Budget** — for each star tier
(1★–4★, derived from the effect's `ap_Legendary1-4` attach point and exposed
as `ArmorEffectEntry.starTier`), the summed worn-piece counts across every
effect in that tier must be ≤ 5. Limit Breaking ×2 + Battle-Loader's ×3 is
legal; ×5 + ×5 is not. Enforcement lives in three places that share
`getArmorTierUsage` (`src/data/armor-modifiers.ts`):

- `armorEffect/setCount` (`src/state/build-reducer.ts`) clamps the incoming
  count to the tier's remaining space. Pieces are never taken from other
  effects implicitly — freeing them is an explicit decrease-then-increase
  (the ArmorSection combobox switch and suggestion swap actions both order
  their steps that way).
- Hydration (`src/lib/persist/codec.ts`) runs `clampArmorTierBudgets` over
  decoded builds: persisted/shared URLs that oversubscribe a tier are trimmed
  first-set-wins with a warning in the existing hydration banner.
- The suggestions engine enumerates armor candidates that are legal by
  construction (increases bounded by tier free space; swaps piece-neutral).

Known data quirk, inherited deliberately: "Powered" (+AP regen) has twin
records on tiers 1 and 2; the checklist's representative pick lands on the
tier-2 record (the tier-1 twin is unobtainable in the current dump), so
Powered counts against the 2★ budget. If a future dump changes obtainability
the representative — and hence the budget tier — follows it.

'misc' checklist effects (linings, PA misc, underarmor styles) are not
legendary-slot content; their per-effect body-slot `maxCount` semantics are
unchanged and they participate in no tier.

Out of scope here: defense-aware suggestion costs. DPS-only deltas may today
suggest swapping away defensive effects (Sentinel → Bruiser's); once incoming
DPS/mitigation/Deflect modeling exists, that stops being free — separate
future work.

## Do not undo this

A future reviewer might reasonably want to enforce the budget only in the
suggestions engine (a "soft budget" that lets the model/editor represent
illegal states) — don't. Suggestions built on states that can violate the
invariant make swap advice ambiguous (replace *which* over-allocated
pieces?), and an editor that allows what advice forbids reads as a bug. The
trade-off accepted with full enforcement — previously-legal bookmarked
builds that oversubscribed a tier now hydrate smaller (surfaced, not
silent — the banner says so) — is intentional, not a gap to close.

`docs/adr/0008` grew each tier's picker roster from a handful of
engine-effective effects to the full obtainable set per tier (21–22 legendary
effects per tier on the 20260803 dump, most badged inert) — the budget now
competes against a much larger field within each tier. That is the intended
effect of surfacing the full roster, not a regression in this ADR's
invariant: `getArmorTierUsage`/`clampArmorTierBudgets` sum worn-piece counts
the same way regardless of how many *choices* exist per tier.
