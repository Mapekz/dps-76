# TODO: OMOD Slot Hygiene — Dedupe, No-ops, Standard-Only Slots

Created 2026-07-14 from the weapon-pane mod-selection bug sweep. Mostly
app-side rules in `getOmodSlots()`; the craftability gate leans on the COBJ
work in [omod-eligibility.md](omod-eligibility.md).

## Problem

Slots render whatever survives filtering with no hygiene pass:
duplicate "Standard" entries (several distinct stock OMOD records with the
same display name), slots whose only option is the stock part, and slots that
exist in data but are not player-changeable at all (universal range offsets —
which are also no-op since the stat changes were removed; Weapon Model
Replacement). `WeaponSection.tsx:88-138` renders every slot `getOmodSlots()`
returns.

## Rules to implement

1. **Dedupe** functionally-identical entries per slot (same display name +
   same modifiers ⇒ keep one; prefer the record referenced by
   `templateModFormIds`).
2. **Hide Standard-only slots**: if after all filtering a slot's only visible
   option is the stock/Standard part, drop the slot entirely (user req #4).
3. **Hide non-craftable slots**: only surface slots where the user can
   actually change something (≥1 COBJ-craftable non-stock option). Kills
   universal-range-offset and model-replacement slots systematically.

## Issue checklist

- [ ] Crossbow: "standard frame" + 2 more "standard" in one receiver slot.
- [ ] Crusader pistol: "standard receiver" + 2 more "standard".
- [ ] Gauss shotgun: 2× standard receivers ("seems a lot of weapons do").
- [ ] Circuit Breaker: 2× standard receivers.
- [ ] Cremator: receiver slot lists "standard" twice + "generic fuel (red)"
      (chem-color cosmetics — no DPS effect; likely wrong slot too).
- [ ] Black powder pistol/rifle/blunderbuss/dragon: receiver slot lists
      standard twice.
- [ ] Flamer: 2× standard "receiver" — and receiver isn't even a real flamer
      slot (uses nozzle/muzzle, fuel tank, …); overlaps with eligibility doc.
- [ ] Hatchet: extra "no upgrade" entry in its melee slot.
- [ ] Cryolator: "stock muzzle" vs "standard muzzle" — confirm via
      `/esm-walk` whether these are duplicates or one shouldn't exist.
- [ ] Universal range offset slots (hunting rifle et al.): hide — not
      moddable/removable, and no-op since the stat mods were removed.
- [ ] Death Tambo + baseball bat: "Weapon Model Replacement" slot — hide.
- [ ] .44 pistol, 10mm pistol, 10mm SMG, assault rifle "only have a receiver
      mod slot" — i.e. their other real slots are missing; that's the
      obtainability doc, but re-verify these four after both land.

## Files

- `src/data/omods.ts` — `getOmodSlots()` dedupe + slot-visibility rules.
- `scripts/extract/extract-omods.ts` — only if dedupe is better done at
  extraction (probably not; keep data faithful, filter app-side).
- `src/components/build/WeaponSection.tsx` — should need no change if
  `getOmodSlots` returns clean slots.
