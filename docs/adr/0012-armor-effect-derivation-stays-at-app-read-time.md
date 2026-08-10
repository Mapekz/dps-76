# Armor-effect derivation stays at app-read time, not in the extractor

An architecture review flagged that `src/data/armor-modifiers.ts` parsed raw
ESM strings in the browser on every `getArmorEffects` cache miss — editor-id
substring checks, regexes over display names, splitting ids and target-keyword
edids on `_` — none of it visible to `_meta.json`'s unresolved reporting, none
pinnable by an extraction fixture. The proposal was to move that derivation into
the extraction pipeline and emit the results as fields on `armor-omods.json`.

The proposal was investigated and **rejected**. It is not feasible without
inverting the dependency direction it was meant to fix.

- **Derivation is not per-record.** `buildEntry(name, records)` takes a *group*
  of records sharing a display name. `legendaryArmorType` decides
  `bodyArmor | powerArmor | both` by whether both an Armor and a PowerArmor
  record exist under that name; `isJetpackReskin` reads the group's display
  name. Neither answer exists for a single OMOD, so extraction would have to
  move deduplication too.
- **Deduplication keys on data extraction doesn't have.** The grouping key is
  the *Overlay-applied* display name, and the group is filtered through
  `hiddenArmorOmodIds` / `forceVisibleArmorOmodIds`, which are per-**Mode**
  (`getArmorEffects` caches per mode). Extraction runs against a live ESM once
  per mode and has no merged **Dataset** — by design, since the merged dataset
  reads the *previous*, checked-in generation.
- **`derivePieceReach` already consults `armorPieceOverrides`**, an app-layer
  Overlay.

So extraction would have to import the app's Overlay layer and its merge
chokepoint — the exact backwards import the move was supposed to eliminate. The
`src/data → scripts/extract` direction is one-way for a reason (see
`omod-eligibility.ts`'s BOUNDARY comment for the one shared-pure-predicate
exception).

Decision: **armor derivation stays in `src/data/`.** The real complaint — no
isolated test surface, 776 lines mixing two concerns — is addressed by splitting
the module in place instead (`armor-types` / `armor-capacities` /
`armor-derivation` / `armor-roster` / `armor-budget`, behind the
`armor-modifiers` barrel), which gives the parsing half a front door without
moving where it runs.

Per ADR-0010, `derivePieceReach`'s union reading and `legendaryArmorType`'s
record-presence signal are settled; this changed neither.

## Do not undo this

Don't re-propose moving derivation into `scripts/extract/` on the grounds that
"it's just string parsing." It is string parsing over a *group* the extractor
cannot assemble. If a future change makes armor effects one-record-per-effect —
no name-keyed grouping, no per-mode visibility in the grouping key — this
becomes possible again, and only then.

Don't add the derived slot-group / piece-reach / armor-type fields to
`GeneratedOmod` as a halfway step. They would be wrong for exactly the records
where derivation is hard: the multi-record name groups.

Don't "fix" the runtime cost by memoizing harder. `getArmorEffects` already
caches per **Mode** and the roster is built once; the parsing is not a hot path.
