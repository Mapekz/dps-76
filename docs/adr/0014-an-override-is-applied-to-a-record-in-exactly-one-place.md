# An override is applied to a record in exactly one place

The **Overlay** layer (`src/data/overrides/`) exists so a wrong or missing
value can be fixed without a re-extract. That only holds if each table has one
direction. Several didn't.

`omodNameOverrides` was applied twice to the same records: baked into
`omods.json`'s `name` by `extract-omods.ts`'s `resolveVariantDisplayName`, then
applied again over the whole merged collection at `dataset.ts`. A name fix
needed a re-extract to take effect in the generated file even though the app
would have overridden it anyway.

`hiddenOmodIds` carried two different policies under one name — the app-side
picker's visibility rule, and `extract-uniques.ts`'s "never synthesize a preset
from this record" rule — with no way to tell which entries served which.

`omodBadgeOverrides`, `omodWeaponRestrictions`, and `omodNameOverrides` were
re-exported raw on the `Dataset` interface, so accessors did their own lookups
against tables the chokepoint had already merged past.

Decision, three rules:

- **An Overlay keyed by a record's id is applied once, at the merge chokepoint
  (`buildDataset`), and exposed as a field on the merged record** — `MergedOmod`'s
  `badgeOverride` / `restrictedToWeaponIds`, alongside the pre-existing name and
  modifier merges. An accessor reads a field; it never learns that a table
  exists. A table not keyed by a record id (`perWeaponSlotLabelOverrides`, keyed
  by weapon × attach point) legitimately stays on `Dataset`.
- **Extraction may *read* an Overlay to derive a *different* record, but must
  never pre-apply it to the record the app layer will override.**
  `extract-uniques.ts` reads `omodNameOverrides` to name a synthesized unique
  preset — a record that does not exist in the ESM and that `dataset.ts` never
  touches. That is legal. `resolveVariantDisplayName` baking the same table into
  the omod's own name was not, and is gone.
- **Two policies get two tables, even when their members overlap.**
  `cutUniqueIdentityOmodIds` (`scripts/extract/`) is the extraction policy;
  `hiddenOmodIds` (`src/data/overrides/`) is the app-side visibility policy. Four
  ids are in both because both policies genuinely apply — verified, not
  accidental: `hiddenOmodIds` is the sole filter keeping those records out of the
  picker, so removing them would leak cut content into the UI. A subset test pins
  the intersection.

The distinction between the last two rules is what to look at: `hiddenOmodIds`'s
two uses encoded two different **policies** that happened to share members, so
they split. `omodNameOverrides`'s uses encode one **fact** — this record's real
in-game name — consumed by two derivations, so it stays one table.

## Do not undo this

Don't "simplify" `cutUniqueIdentityOmodIds` by having extraction import
`hiddenOmodIds` again. That reinstates the backwards import from
`scripts/extract/` into the app's Overlay layer, and silently re-couples a
picker decision to an extraction decision. If the subset test fails, adjudicate
the id — don't merge the lists.

Don't move an id out of `hiddenOmodIds` on the grounds that it is "already
handled at extraction." Extraction dropping a unique preset and the picker
hiding an OMOD are different records and different code paths;
`src/data/uniques.ts` and `src/data/omods.ts` both read `hiddenOmodIds`, and
`getUniqueById` does not filter at all.

Don't put a new id-keyed override table back on the `Dataset` interface because
"the accessor is the only consumer." One consumer today is how all four of these
started.
