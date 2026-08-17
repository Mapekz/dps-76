# Build-share URLs encode dictionary indices, not editor ids

The v1 share URL was `'1.' + base64url(deflate-raw(JSON))` with every id a
full ESM editor-id string — a realistic heavy build was **1252 characters**
(~77% of the wire JSON was id strings and field names). v2 is
`'2.' + <decorative slug> + '.' + base64url(headerByte + bit-packed payload)`
(`src/lib/persist/codec.ts`), with ids replaced by small integers from an
append-only checked-in dictionary (`src/data/wire-dictionary/`). Backward
compatibility was deliberately dropped (alpha app); there is no v1 decoder.

Decisions:

- **Indices come from append-only JSON checked into git**, synced by
  `scripts/build-wire-dictionary.ts` — not from array position in
  `src/data/*/generated/*.json`. Generated files are rebuilt from each ESM
  dump and records are added, removed, and reordered; position is not stable.
- **Not raw ESM formIds on the wire.** Sorted-delta formIds cost ~370 bits
  vs ~240 for the dictionary on the same heavy-build ids, and
  `ArmorEffectEntry` has no formId — armor effects would need a dictionary
  anyway. FormIds **are** used as the dictionary regeneration **matching key**
  (`syncWireDictionary`'s `formIdOf`), so a Bethesda editor-id rename is
  fixed by editing the key in place while keeping the integer.
- **Not a deterministic sort order computed at load** (no artifact): one added
  record shifts every later index, so every ESM sync would break every
  published link.
- **The artifact is an explicit `ids` object with a `nextIndex` watermark**,
  not an array whose position implies the index (`src/data/wire-dictionary/types.ts`).
  An array would be ~2× smaller but correctness would rest on "nobody ever
  reorders this file" — alphabetising or formatter sorting would silently
  repoint every published URL with no error.
- **The dictionary is shared across `live`/`pts`, never per-mode.**
  `decodeBuild(encoded, mode)` takes mode from the caller's app context and
  there is no mode field on the wire; a per-mode dictionary would make the
  same integer resolve to different ids depending only on which tab opened
  the link.
- **Bit widths are spec constants** (`WIRE_GROUP_WIDTHS`,
  `MUTATION_BITMASK_WIDTH`, etc. in `src/lib/persist/wire-sections.ts`) —
  never derived from the live dictionary's current length. An older browser tab
  must agree with a newer deploy on every field width or the stream
  desynchronises after that field.
- **Backward compatibility was dropped on purpose** — the v1 decoder and its
  migration shims were deleted rather than kept.

Unknown dictionary ids at encode time fall back to a literal-string escape
slot (`writeDictRef`/`readDictRef` in `wire-sections.ts`); decode skips the
resolved value but **must still consume every bit** the entry declared.

## Do not undo this

Don't delete an `ids` entry and reuse its integer — integer reuse silently
corrupts published URLs. Retire by leaving the key in place; `nextIndex` is
the only allocator (`acknowledgedRemovals` is report noise only).

Don't make the dictionary per-mode — the wire carries no mode and
`decodeBuild` resolves through the shared tables regardless of tab.

Don't derive a bit width from runtime data (`dictionary.length`, live row
counts, etc.) — field widths are compile-time constants so old tabs stay in
sync with new deploys.

Don't let a decoder skip an invalid entry's **bits** when dropping the value
— that desynchronises the rest of the stream (`wire-sections.ts`'s
stream-alignment rule).

Don't fix a wire id mapping in `src/data/overrides/*` — per ADR-0014 an
Overlay applies to a record's data or visibility, not to wire integer
assignment; rename fixes belong in the dictionary key string in place.

Don't restore a v1 decoder "for old links" — v1 was intentionally removed
and the alpha app does not owe backward compatibility.
