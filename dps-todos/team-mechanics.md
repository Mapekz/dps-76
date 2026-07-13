# TODO: Team Mechanics — Teammate UX, United Ordeal, Public Team Bonuses

## What
Teammate-gated mechanics are effectively invisible/broken:
- `teammateCount` (0–3) is a bare slider buried at the bottom of the
  **Conditions** accordion, default 0 — every teammate-gated perk (Strange in
  Numbers, Fencer's, United Ordeal, Bodyguards) silently does nothing until a
  user finds it.
- The app's simplifying assumption — any teammate counts as "mutated" (for
  SiN) or "ghoul" (for United Ordeal), since teammate identity isn't modeled
  — is undocumented in the UI except one badge tooltip in the Mutations
  section, which even misnames the section ("Character section" doesn't
  exist; it means Conditions).
- **United Ordeal is fully inert.** `GHL_UnitedOrdeal`'s 22 generated
  modifiers all carry `unresolved: "GetPlayerTeammateCount Greater Than Or
  Equal To 1"` (the extractor only handles `Equal To`, for Fencer's) *and*,
  even if resolved, `foldSpecialStat` (`src/lib/player-stats.ts`) only folds
  **unconditional** SPECIAL ADDs — conditional ones (mutation SiN tiers,
  United Ordeal) never reach effective SPECIAL at all.
- **Public team bonuses aren't modeled.** FO76 grants a team-size-scaled
  SPECIAL fortify via public teams. Confirmed against the ESM (2026-07-13,
  dump `20260710`): `PT_PublicTeamBonuses_Perk` (0x005B7584) grants 8 ability
  spells gated on `GetTeamType` + `GetTeammateBondScore` (1–4). Only two are
  damage-relevant SPECIAL grants (the rest are XP/condition-loss, out of
  scope):
  - **Casual** (TeamType 6) → spell `PT_CasualTeamBonus` 0x005B7585 → mgef
    `AbFortifyIntelligence` 0x0004C938 (AV Intelligence 0x000002C6), +1..+4
    Intelligence by bond score.
  - **Exploration** (TeamType 4) → spell `PT_ExplorationTeamBonus`
    0x005B7587 → mgef `AbFortifyEndurance` 0x00169559 (AV Endurance
    0x000002C4), +1..+4 Endurance by bond score.
  - Bond score has no separate UI input in this app — model it as team size
    incl. self, `min(teammateCount + 1, 4)` (documented simplification; real
    bond builds over time in-game).

User-decided scope (2026-07-13): wire United Ordeal fully (accept that
condition-aware SPECIAL folding also activates a couple of previously-inert
mutation SiN tiers — verified as a net correctness fix, not a regression, see
below). Public-team toggle limited to **None / Casual (INT) / Exploration
(END)** — the other 6 team types are out of scope (non-SPECIAL or
non-damage).

## Where to implement

### Engine: `teammateAtLeast` condition + condition-aware SPECIAL folding
1. New condition kind `{ kind: 'teammateAtLeast'; count: number }` in
   `src/types/modifiers.ts`; eval in `src/lib/engine/resolve.ts`:
   `(ctx.player.teammateCount ?? 0) >= cond.count`.
2. `scripts/extract/normalize/conditions.ts`, `GetPlayerTeammateCount` case
   (~line 205): `Greater Than Or Equal To` → `teammateAtLeast` (keep the
   existing `Equal To` → `teammateCount` branch for Fencer's).
3. Re-extract (`pnpm extract --only perks`) and diff
   `src/data/live/generated/perks.json` — should touch ONLY United Ordeal's
   22 modifiers (verified as the sole record carrying that unresolved raw as
   of the 20260710 dump). Investigate anything else that changes.
4. `src/lib/player-stats.ts`: `foldSpecialStat` currently filters
   `conditions.length === 0` — replace with the existing condition-aware
   `foldBucket(modifiers, bucket, base, ctx)` (already used for `maxHealth`).
   Build the `ResolveContext` with **derived** flags (`strangeInNumbers` via
   `deriveStrangeInNumbers`, `teammateCount`, `isGhoul`, `mutationCount`), not
   raw stored conditions. Thread through `derivePlayerStats`'s two callers in
   `src/lib/loadout.ts` (`resolveLoadout`, `resolveStats`) — reorder so
   derived flags are computed before the SPECIAL fold runs.
   - Ripple checked against `mutations.json`: SiN false/true SPECIAL variants
     are mutually exclusive (no double-count); mutation base-SPECIAL entries
     sit behind pre-existing `unresolved` conditions and still drop. The only
     newly-active DPS-relevant effects are Herd Mentality's SiN-boosted +3
     STR/LCK and United Ordeal's STR/LCK (STR→melee term, LCK→crit meter;
     PER/END/CHA/INT/AGI stay engine-inert except END→maxHealth).

### Public team bonuses
1. Add `publicTeamType?: 'none' | 'casual' | 'exploration'` to
   `PlayerConditions` (`src/types/index.ts`), default `'none'`. User-set, not
   derived — don't add to `DERIVED_PLAYER_CONDITION_KEYS` in
   `src/lib/persist/codec.ts` (it round-trips automatically via the generic
   default-diff).
2. New `src/data/public-teams.ts`: `casual → specialIntelligence`,
   `exploration → specialEndurance`, both with a source comment citing the
   form IDs above.
3. In `assemble()` (`src/lib/loadout.ts`), emit one unconditional SPECIAL ADD
   modifier when `publicTeamType !== 'none'`, magnitude
   `min(teammateCount + 1, 4)`.

### UI: dedicated Team section
New `src/components/build/TeamSection.tsx` (use `/frontend-design` for the
pass), inserted in `BuildColumn.tsx` after SPECIAL Loadout / before
Conditions:
1. **Teammates** slider (0–3) — move out of `ConditionsSection.tsx` (drop it
   from that section's `activeCount` term too).
2. **Public Team** toggle group (None/Casual/Exploration), styled like the
   Race `ButtonGroup` in `SpecialLoadoutSection.tsx`; show the live bonus
   (e.g. "+3 INT").
3. One-line muted assumption note: teammates assumed mutated (SiN) and ghoul
   (United Ordeal).
4. Live status list for equipped teammate-gated perks (SiN, Fencer's, United
   Ordeal) showing active/inactive + current effect — reuse
   `deriveStrangeInNumbers`; United Ordeal active ⇔ `isGhoul && teammateCount
   >= 1`.
5. Fix `BuffsSections.tsx`'s SiN badge tooltip: "(Character section)" →
   "(Team section)".

### Docs & tests
- `docs/assumptions.md`: new "Public team bonuses" row; update "United
  Ordeal" (now wired) and "Strange in Numbers"/"SPECIAL buffs" rows
  (conditional SPECIAL now folds; note Herd Mentality's base-+2
  `unresolved` quirk so only its SiN tier lands).
- Tests: `teammateAtLeast` eval boundary; extraction fixture for the new
  `Greater Than Or Equal To` branch; United Ordeal ghoul+teammate → +STR/+LCK;
  public Casual/Exploration → +INT/+END; solo/human negatives; re-run golden
  cases and reconcile any SiN-mutation-build shifts (Herd Mentality) as
  intended corrections.

## Verification
1. `pnpm test` + `pnpm build` green; reconcile golden-case shifts.
2. `git diff src/data/live/generated/perks.json` after re-extract touches
   only United Ordeal.
3. Drive the app: ghoul + United Ordeal equipped, Teammates 0→2 → effective
   STR/LCK and DPS rise; toggle Casual/Exploration → effective INT/END track
   `teammates+1`; Team section assumption note + status list read correctly
   and update live; SiN badge tooltip points to "Team section"; human race
   keeps United Ordeal inactive regardless of teammate count.
