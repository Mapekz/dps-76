# TODO: wholeDamage Legendary Perks — Follow Through & Taking One for the Team

## What
Two Legendary perk cards select in the UI today but contribute **zero
effective modifiers** — both are card-real (`hasCard: true`, real PCRD
records, maxRank 4), and the engine's `wholeDamage` bucket already exists
and is tested, but nothing wires the two together.

- **Follow Through** (`LGN_FollowThrough_Perk`, formIds `0x005A5D69-6C`):
  "Ranged sneak damage increases damage to target by 10/20/30/40% for 10
  seconds." A **damage-taken debuff on the enemy** — while active, the
  player's damage to that target is multiplied, not a flat `dbm` add.
- **Taking One for the Team** (`LGN_TakingOneForTheTeam_Perk`, formIds
  `0x005A59C7-CA`): "Enemies take 10/20/30/40% more damage when they attack
  you, if you're on a team." Same shape — the enemy that attacks the player
  takes bonus damage, mechanically applied via a hidden companion perk
  `LGN_TakingOneForTheTeam_DamageIncrease_Perk` (formIds `0x005B01AE-B1`,
  `hasCard: false`) granted to the attacker.

Both are genuine ×(1+value) multipliers on damage the enemy takes — exactly
what the engine's `wholeDamage` bucket already models
(`foldWholeDamage`, `src/lib/engine/resolve.ts:289`, Π(1+value) per active
source, `paper-damage.ts:146`), which today has only synthetic test coverage
(`src/lib/engine/__tests__/engine.test.ts:254`, "TOFTT ×1.2 and Follow
Through ×1.1") and zero real data feeding it.

**Not the same shape as Tenderizer** — Tenderizer (non-legendary,
`PerkTenderizer01Spell`) is already correctly modeled as a stacking
**`dbm` ADD** (`src/data/overrides/perk-overrides.ts` `Tenderizer` override,
+10%/stack, 0–1000 stacks via the `{ kind: 'stacks', counter, max }`
condition, `src/types/modifiers.ts:194`) — additive, not multiplicative.
Don't conflate the two when extending this doc.

## Current state (verified 2026-07-13)
- `PerkId.FollowThrough` / `PerkId.TakingOneForTheTeam` exist
  (`src/data/perk-ids.ts:270,279`), join to the ESM families by name
  (`src/data/live/perks.ts:283,292`, both commented "wholeDamage bucket,
  pending extraction").
- Both ESM families extract with `modifiers: []` on every rank and **empty
  `notes`** — meaning the extractor didn't even flag them as unresolved (no
  recognized ENCH/AV chain at all), unlike the usual "needs override"
  pattern. This needs a from-scratch `esm-walk` VMAD/script chase, same
  shape as the Conductor's chase that landed in `legendary-values.ts`.
- `LGN_TakingOneForTheTeam_DamageIncrease_Perk` (the hidden companion perk
  that likely carries TOftT's actual applied-to-attacker magnitude) is also
  all-empty — chase this one too; the visible TOftT card may just be the
  gate/toggle, with the real magnitude living entirely on the companion.
- No `extraPerkModifiers` override exists for either perk today (compare
  Tenderizer's, which does).

## User-specified modeling approach
Not a rank-locked lookup — both effects are **conditional/temporary procs**
(Follow Through: 10s window after a ranged sneak hit; TOftT: procs on being
attacked while teamed), so exact uptime isn't steady-state-computable without
a much deeper proc-timing model. Model each as a **manual 0–40% slider** per
the project's established pattern of shipping a manual toggle ahead of full
conditional-uptime modeling (same call as Zealot's in
`armor-mods-outgoing.md`, or `isSneaking`) — the slider represents the
player's own assumption about effective uptime/rank, and folds to a single
`wholeDamage` ADD modifier (0.0–0.4) each. They compose multiplicatively per
`foldWholeDamage`'s existing Π(1+value) behavior: 1.0×–1.4× per slider,
up to 1.0×–1.96× if both are dialed to max simultaneously.

## Where to implement
1. `esm-walk` both chains (Follow Through's ENCH/MGEF; TOftT's two perk
   families) to find the actual magnitude source and confirm the
   percent-per-rank values match the static descriptions (10/20/30/40%) —
   don't assume the description text is the modeled value without checking,
   per the project's "verified against actual code" standard.
2. Two new `PlayerConditions` fields (e.g. `followThroughPct`,
   `takingOneForTheTeamPct`), 0–40, default 0 — likely alongside the other
   manual-uptime sliders (`hitRatePct`, `weaponConditionPct`) in
   `ConditionsSection.tsx`.
3. `assemble()` (`src/lib/loadout.ts`): emit one `wholeDamage` ADD modifier
   per active slider, gated on the corresponding perk actually being
   equipped (rank > 0) — a slider with no perk equipped should be inert or
   hidden.
4. `docs/assumptions.md`: new entry documenting the manual-slider
   simplification and the ESM chase findings, same rigor as the Tenderizer
   entry.

## Related: Taking One for the Team's enemy-Resist debuff
User-reported (2026-07-13): TOftT also debuffs the attacking enemy's DR/ER by
a small amount — suspected dev oversight bundled into the same effect chain,
not a separate named perk. **Scoped to
[phase-3-enemies.md](phase-3-enemies.md) §3.3** instead of here — it can't be
modeled until enemy DR/ER mitigation exists at all. Whoever esm-walks TOftT's
chain per step 1 above should check for a bundled DR/ER debuff at the same
time and hand the finding to phase 3's `armorPen` work.

## Verification
- Golden case or in-game measurement for at least one Follow Through hit and
  one TOftT proc, to confirm the 10/20/30/40% values are actually applied as
  described (not a case where the visible description overstates/understates
  the real ENCH magnitude — this project has hit that before, e.g. the ★4
  "BonusDamage x4/x5/x6" note in `phase-3-enemies.md`).
- `pnpm test`: extraction fixture for the new ENCH/AV mapping if one is
  found; engine test confirming both sliders compose multiplicatively with
  each other, consistent with the existing synthetic `wholeDamage` coverage.
