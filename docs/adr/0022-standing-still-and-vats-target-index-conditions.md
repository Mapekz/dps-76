# Standing-still and VATS-target-index conditions

`IsMoving()=0` gates ~13 damage-relevant modifiers (Rooted, Steady, Chameleon
DR, armor stand-still legendaries) that previously extracted as `unresolved` and
were permanently inactive. Gun Fu's three `Mod VATS Gun-Fu * Target Dmg Mult`
entry points (+30/60/90% at ranks 1–3, ESM Set Value 1.3/1.6/1.9 on GunFu01–03)
had no condition kind and empty perk-card modifiers.

Both become explicit player-input conditions:

- `{ kind: 'standingStill'; value: boolean }` — `value: true` requires not
  moving (`IsMoving()=0`); `value: false` requires moving (`IsMoving()=1`, e.g.
  Speed Demon's penalty). Default **off** (moving) so previously-inert
  stand-still bonuses stay at zero until toggled (ADR-0009 honest-zero rule).
- `{ kind: 'vatsTargetIndex'; min: number }` — evaluated only when
  `ctx.scenario.isVats`; passes when `PlayerInput.vatsTargetIndex >= min`.
  Default **1** (first target, no Gun Fu bonus) so existing numbers are
  unchanged. Gun Fu is a discrete 1st/2nd/3rd/4th+ chip selector, not a
  kill-rate blend; AP-refund/on-kill procs stay out of scope (issue #89).

`Set VATS Gun-Fu` (rank-1 enabler) extracts with no modifier — the damage EPs
carry the `vatsOnly` + `vatsTargetIndex` gates. Magnitudes are ESM-proven
(float−1 → additive `dbm` MUL_ADD).

## Do not undo this

Do not default `standingStill` to on or `vatsTargetIndex` to 2+ — that would
inflate DPS for builds that never opted in. Do not model Gun Fu as a sustained
kill-rate average or fold AP-refund procs here; that is issue #89, explicitly
parked.
