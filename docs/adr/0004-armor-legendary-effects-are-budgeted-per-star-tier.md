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

The "Powered" twin-record data quirk (which tier its representative pick
counts against) is documented at `buildEntry` (`armor-modifiers.ts`), not
repeated here.

'misc' checklist effects (linings, PA misc, underarmor styles) are not
legendary-slot content; their per-effect body-slot `maxCount` semantics are
unchanged and they participate in no tier.

## Do not undo this

A future reviewer might reasonably want to enforce the budget only in the
suggestions engine (a "soft budget" that lets the model/editor represent
illegal states) — don't. Suggestions built on states that can violate the
invariant make swap advice ambiguous (replace *which* over-allocated
pieces?), and an editor that allows what advice forbids reads as a bug. The
trade-off accepted with full enforcement — previously-legal bookmarked
builds that oversubscribed a tier now hydrate smaller (surfaced, not
silent — the banner says so) — is intentional, not a gap to close.
