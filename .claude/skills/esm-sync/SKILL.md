---
name: esm-sync
description: Run a full ESM game-data sync + audit cycle after a new SeventySix.esm snapshot lands (~every 1-2 months). Use when Data/<YYYYMMDD> gains a new dump, when the user asks to "update the calc to the latest patch/ESM", or when generated/_meta.json's esmDate lags the newest snapshot. Orchestrates extraction, the round-trip auditor, unresolved classification, override revalidation, and the verification tier — delegating to weapon-vetting, esm-walk, verify, and docs-writing for their pieces.
---

# ESM sync + audit cycle

End-to-end procedure distilled from the 2026-08-27/28 pre-release full audit
(commits `4d258f8`…; evidence log in `NOTES.md` beside this file). Run every
command from the repo root. `esm` CLI is on PATH; `FO76_ESM_PATH` resolves
the newest `Data/<YYYYMMDD>/SeventySix.esm` per new shell.

## 0. Scope the patch BEFORE extracting

Read `Data/notes/<old>_to_<new>/diff.json` and census the record types
YOURSELF (don't trust prose): count WEAP/PERK/MGEF/OMOD/SPEL/LGDI/INNR/CURV/
GLOB/GMST/AMMO/ARMO/LVLI/COBJ/KYWD entries. Also diff
`Data/<old|new>/misc/curvetables` (byte-compare) and check
`work/strings-diff.json`. This predicts the whole extract diff in minutes —
a CELL/QUST/RACE-only churn is a re-save, not a content patch. Check the
comprehensive.md `zzz_` cut-marker section per the 20260724 lesson.

## 1. Baselines, then extract

```bash
cp src/data/live/generated/_meta.json /tmp/meta-<old>.json   # gitignored — only baseline
bun run audit:inert --mode live > /tmp/inert-before.txt
bun run extract --mode live          # ~3.5 min warm; --esm only if FO76_ESM_PATH is stale
```

A shell opened before the snapshot landed still has the old `FO76_ESM_PATH`.
`esm daemon stop` is needed only after loose sidecar (curvetable) changes.

## 2. Review checkpoints, in order

| checkpoint | pass condition |
|---|---|
| `_meta.json` | `esmDate` == new snapshot; `counts` deltas explained; `unresolved` **set-diff vs baseline** (see below) |
| `bun run extract:diff` | weapons/omods roster+visibility churn all explained (covers ONLY those two files — `git diff --stat src/data/live/generated/` for the rest) |
| `bun run vet:weapons` | exit 0, else adjudicate via the **weapon-vetting** skill |
| `bun run wire-dict:build -- --dry-run` | no RENAMED/MISSING, else decide; removals: delete the id key AND add to `acknowledgedRemovals` (test requires both) |
| `bun run audit:records` | tier-1/2 clean; tier-3 findings adjudicated (see §4) |
| `bun run audit:inert --mode live` diff | badge-count moves explained |

**The unresolved set-diff is the fastest truth** about what a dump or an
extractor change actually did:

```bash
bun -e 'const a=JSON.parse(require("fs").readFileSync("/tmp/meta-<old>.json","utf8")).unresolved;
const b=JSON.parse(require("fs").readFileSync("src/data/live/generated/_meta.json","utf8")).unresolved;
const sa=new Set(a),sb=new Set(b);
console.log("GONE:",a.filter(x=>!sb.has(x)).length,"NEW:",b.filter(x=>!sa.has(x)).length);
b.filter(x=>!sa.has(x)).slice(0,40).forEach(x=>console.log(" +",x))'
```

## 3. Unresolved classification (the zero gate)

`scripts/extract/unresolved-classification.ts` holds evidence-dated rules
(dispositions: `out-of-scope` / `resolve-pending` / `deferred-with-issue` +
`#issue`). The run report prints classified/unclassified; the checked-in
remainder test (unresolved-classification.test.ts) fails when a NEW gap
appears — that failure is the signal a patch added something unhandled.

- A NEW unclassified entry = walk it (**esm-walk** skill), then either fix
  extraction or add a rule with the evidence in its comment. Never a blanket
  rule over a live class (e.g. `archetype Script`) — new members must keep
  surfacing.
- Validate rules with a harness run; a zero-match rule = wrong matcher or
  already-resolved entries — delete it.
- Two distinct backlogs, don't conflate: `_meta.unresolved` = extractor
  DROPPED it; `audit:inert`'s unresolved-condition census = modifier KEPT
  but its condition never fires.

## 4. Round-trip auditor

`bun run audit:records [--domain …] [--tier 1,2,3] [--json out] [--out md]`.
Three tiers: identity / re-derivation equality / provenance completeness.
Calibration invariant: right after an extraction from the same dump, ANY
tier-1/2 finding is an auditor bug by construction — tier 2 must compare
against extractor **re-derivation**, never raw ESM fields. Tier-3 crediting
covers notes describing the CHASED mechanism and Include-derived child
output; findings name formid+edid for adjudication.

## 5. Extractor-change hygiene (the recurring trap)

**Fixture-pass/live-fail** bit four separate times: fixture tests exercised
`translateGrantedPerk` while live perks flow through `extract-perks.ts`'s
shared `resolveDirectEntryPointModifiers`, or fixtures pinned a shape the
live records don't have (flat value vs constant curve). Every new EP route or
condition translation MUST be wired through the shared resolver and pinned by
fixtures captured from the LIVE records (`esm get <id> --json`), then proven
by a live re-extract + set-diff. Other standing rules:

- GetRandomPercent proc chances FOLD INTO the value (EP-198/199 pattern);
  `SET 1` + unresolved gate is a landmine.
- Unknown EPs report only the dedup `unknown entry point:` line — never
  per-record condition dumps.
- Curve overrides magnitude when both are present (Tesla: 5, not 20 or 100).
- Walk to the actual Damage-archetype MGEF before trusting any cloak/ability
  wrapper's magnitude (Plague Walker's cloak said 10/12; damage rows said
  5→25 disease-scaled).
- Zero-magnitude script-set effects (Miasma, Rage, Kinetic Servos): never
  hand-author magnitudes — measured-pending notes + assumptions entries
  (wiki-banned wording per legendary-values.ts's header).
- Deliberately-skipped duplicate arms (Brawler/IgnoreArmor lining AV writes)
  need the skip documented at the site AND an assumptions entry.

## 6. Verification tier

CI order: `bun run lint && bun run lint:design && bun run fmt:check &&
bun run typecheck && bun run test` (`--parallel` is mandatory, not a perf
knob). Then:

- **Goldens**: measured cases must not move; a moved golden after a real
  balance patch means re-measure in game (weapon-vetting skill) — never edit
  the expectation.
- **Browser pass** (**verify** skill) after any engine/UI change: check new
  conditions surface and gate correctly, results lines (aura/proc streams)
  render, share-URL round-trips, zero console errors. a11y `find` refs go
  stale across accordion re-renders — re-find after any section toggle.
- New-mechanic paperwork per **docs-writing**: assumptions entry per
  non-ESM-proven value; ADR only for a new Condition kind or stream concept.

## 7. Landing

Direct-to-main, one commit per coherent round, `git show --stat` after every
commit (shared worktree — peers' staged files sweep in). Push per commit and
watch CI. Plain `git push` may fail credentials —
`gh auth switch -u Mapekz` then retry (see the gh-account memory).

## Known deferred piles (check before re-adjudicating)

- #88 retaliation-on-being-hit family (elemental armor, Reflective,
  Unstable Isotope, Electrically Charged) — pending a hits-taken model.
- #89 AP-refund-on-kill (Grim Reaper's Sprint, Combo-Breaker, SlugBuster,
  bulletStormOnKill) — pending enemy TTK.
- P62 season content: obtainable:false, classified by prefix. TRAP: Ruiner's
  extracted `wholeDamage ADD 500` with every gate unresolved — a forceVisible
  rescue without a condition fix ships an unconditional +500.
- Eye of Ra upgrade (Voice of Set 70-dmg tier), Blitz, Hack and Slash
  splash, Pin-Pointers, Lady Killer/Black Widow target-sex gate, grenade
  roster addition (17-candidate list in NOTES) — awaiting user scope calls.
