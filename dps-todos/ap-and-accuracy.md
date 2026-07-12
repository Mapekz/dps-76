# TODO: AP Costs, Accuracy & Recoil

> **Scope re-decided 2026-07-11** — see [engine-mechanics-push.md](engine-mechanics-push.md)
> Stage B: full AP steady-state economy + manual-aim hit rate ship there;
> VATS hit-chance modeling explicitly deferred.
>
> **Stage B DONE (2026-07-11):** AP drain/regen/uptime model, the
> "AP-limited" VATS DPS line, and the manual-aim `hitRatePct` input are
> shipped (`src/lib/engine/ap-economy.ts`, `docs/assumptions.md`). Everything
> below this point — VATS Enhanced/Vector/Photoropter/Eye of the
> Hunter/Awareness accuracy %, and recoil/spread — is still open.


## What
Model AP drain/regen for VATS, hit accuracy for manual aim, and fire-rate reduction from recoil.

## AP for VATS
- Each VATS shot costs AP
- AP regenerates over time (base rate modified by AGI, perks like Action Boy/Girl)
- Effective VATS DPS limited by AP sustain: `sustainedDPS = perHit × (AP regen rate / AP per shot)`
- `playerConditions.agility` already exists for AGI perk bonus

Notes from `vats-accuracy.md`:
- VATS Enhanced: +50% VATS accuracy (2-star weapon mod)
- Vector: +10-50% (4-star armor mod)
- Photoropter furniture: +25%
- Eye of the Hunter: +30% (leggo perk)
- Awareness perk: +5-50% depending on PER

## Manual aim accuracy
User note: realistically miss 30–70% of shots depending on movement/target size.
Burst-fire weapons reduce effective fire rate 30–50% due to recoil.
Add a "hit rate" input (default 100% = VATS assumption) to model realistic manual aim.

## Recoil / spread
Ignored for MVP. Full accuracy model requires weapon-specific spread values and
aim-down-sight multipliers.

## Dependencies
- `playerConditions.agility` exists
- `playerConditions.perception` exists (for Awareness perk)
