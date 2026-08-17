# Last Shot is a magazine-cycle average, not a per-shot toggle

The `isLastShot` player toggle asked the user to answer a question DPS already
answers: how often is the fired round the magazine's last? It could only show
0% or the full bonus, and it hid a second factor entirely — the flag the
`lastRound` condition reads is set by `Legendary_LastShot_Roll_Perk`
(`0x0077176B`, entry point 198 "Is Next Clip Last Shot") on a
`GetRandomPercent() <= LGND_LastShotChance` roll, GLOB `0x006C20BB` = 25.0.
The extractor dropped that record as "not modeled", so the toggle overstated
the effect by 4×.

The roll is now extracted like any other `GetRandomPercent` gate
(`scripts/extract/normalize/mgef.ts`, alongside EP-172 `ammoFreeChance` and
EP-199 `reloadSkipChance`) into a `lastShotChance` bucket, folded onto the
weapon in `effective-weapon.ts`, and the `lastRound` condition returns
`procChance / shotsPerMagazine` as its scale factor
(`src/lib/engine/resolve.ts`, `src/lib/engine/sustain.ts`).

This is exact rather than approximate: `paper-damage.ts` computes
`scaledBase × (dbmFold + strTerm + critTerm + sneakTerm + powerAttackTerm) ×
outerMult` and `foldOps` sums `ADD` entries linearly, so damage is affine in
the dbm fold — averaging the modifier gives precisely the mean per-shot
damage, and `burstDps`/`sustainedDps` inherit it. Same move as
`docs/adr/0005-stack-defaults-are-sustained-averages.md` made for Onslaught
and Bullet Storm.

Wire ordinal 6 is retired with the toggle (`src/types/knob-registry.ts`).
Share links predating this change that carried it decode incorrectly, which is
acceptable while the app is pre-release.

## Do not undo this

A future reviewer might reasonably want to reintroduce a manual "last shot"
toggle to preview the once-per-magazine spike — don't add it back as a
`PlayerInput` field or reopen wire ordinal 6. Every other cadence mechanic in
the engine resolves to a steady-state average by construction
(`docs/adr/0005-stack-defaults-are-sustained-averages.md`), and a per-shot
toggle that multiplies a 25% roll by 100% uptime is not a number any build
can sustain. A spike preview, if ever wanted, belongs as a display-only value
beside the averaged `perHit`.

The exactness argument above is a property of the two current sources being
plain `dbm` `ADD`s, not of the `lastRound` condition itself. A future
`lastRound` source using a `SET` op, a product-folded bucket
(`wholeDamage`/`foldBucketProduct`, where `E[∏] ≠ ∏E`), or a bucket outside
that one parenthesis would need its own treatment rather than riding this
scale factor.
