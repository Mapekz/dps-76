# Eye of Ra worn toggle (Voice of Set upgrade tier)

`WornHasKeyword(MoMEyeOfRaItemKeyword)` `0x004E60E2` gates two exclusive
Voice of Set robot-shock proc tiers on `MoM_VoiceofSetPerk` effect[1] (base
35, NOT wearing) vs effect[2] (upgrade 70, wearing the Eye of Ra headwear).
Previously the upgrade row was note-only and the base row had its NOT-worn gate
stripped.

Decided: model as `{ kind: 'eyeOfRaWorn'; value: boolean }` — sibling of
`wellTuned` (ADR-0009 honest-zero default OFF), not ADR-0022's combat-position
gates. `PlayerInput.eyeOfRaWorn` defaults false so existing builds keep the
35-damage base tier until toggled. The upgrade spell's 25% paralyze stays a CC
note only.

## Do not undo this

Do not default `eyeOfRaWorn` to on — that would inflate Voice of Set DPS for
builds that never equipped the headwear. Do not fold paralyze into `dotDamage`
without a CC model.
