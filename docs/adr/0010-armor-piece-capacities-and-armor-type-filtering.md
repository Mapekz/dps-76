# Armor mods occupy per-piece slots with data-derived reach, and the picker filters by armor type

Non-legendary armor effects used to carry a scalar `maxCount` from a
since-removed 3-token tag heuristic that got Cushioned (1, should be 2),
Deep Pocketed (2, should be 5), and every Material (1, should be 5)
wrong, and nothing stopped two mods from occupying the same physical slot
(Emergency Protocols + Jet Pack, both PA-torso Misc). The Body/PA toggle
lived in `ConditionsSection` and didn't constrain the roster at all.

Decision, in four parts (`src/data/armor-modifiers.ts`):

- **Piece reach is the plain union of ESM piece tags** across a name-group's
  ids/targetKeywords — `Torso`, `Helmet`, `LimbArm`/`Arm`, `LimbLeg`/`Leg`,
  bare `Limb` (= arms and legs). `maxCount` = Σ piece capacity over the
  reach (body armor torso 1 / arms 2 / legs 2, no mod-bearing helmet; PA
  adds helmet 1; underarmor style and lining are one slot each).
  `src/data/overrides/armor-piece-overrides.ts` exists for future tag
  inconsistencies; it ships empty (2026-08-04, 20260803 dump).
- **Cross-effect exclusivity is subset-sum feasibility** (Hall's condition
  over ≤4 piece classes) per family — (bodyArmor, material),
  (bodyArmor, misc), (powerArmor, misc), underarmor style, underarmor
  lining. The reducer, persist decode, and suggestion variants all clamp
  through it (`maxFeasibleArmorEffectCount`/`clampArmorPieceCapacities`).
- **Every effect is classified `bodyArmor` | `powerArmor` | `both`.**
  Non-legendary from `attachPointEdid`; legendary from record presence per
  display name — verification evidence at `legendaryArmorType`
  (`armor-modifiers.ts`), not repeated here. The picker shows only the
  active type (plus `both`); toggling armor type prunes now-invalid
  selections behind a confirm dialog (`armorType/set`, mirroring `race/set`).
- **PA materials (`ap_PowerArmor_Lining`) are excluded from the roster**
  entirely (user decision 2026-08-03): stat-inert, and Material is a
  body-armor-only group. This narrows ADR-0008's "inert mods are badged,
  not hidden" rule by one attach point; ADR-0008's table is amended.

## Do not undo this

A future reviewer might reasonably want to re-add a "specific tags beat
generic `Limb`" tie-break so Muffled reads legs-only like Cushioned — don't:
the union reading is correct, and the ARMO-level evidence for why is
documented at `derivePieceReach` (`armor-modifiers.ts`).

Don't pool Material and Misc into one capacity family "since they share
pieces" — they are separate slots on the same physical piece at the in-game
workbench; pooling them would make a full Material loadout block Misc mods.

Don't infer legendary PA-exclusivity from the `ma_PowerArmorMod` keyword —
record presence per name (`legendaryArmorType`) is the signal; see that
function's doc-comment for why the keyword alone doesn't work.

Don't switch the armor-type toggle from prune-with-confirm to
retain-and-filter for A/B comparison convenience — retain was proposed and
explicitly rejected (2026-08-04) in favor of matching the race toggle's
one prune precedent; revisit only with the user, not as a drive-by.
