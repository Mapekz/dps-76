# N&D and internal perk formats are separate

Two places parse the same-looking 3-char perk chunks (2-char key + 1-char rank),
but they are different wire formats and must stay that way. `parsePerkString` in
`src/lib/nukes-dragons.ts` decodes nukesdragons.com's own build-share URL scheme
(`p=` / `lp=`): base-10 rank, capped at 5 — externally fixed, we only read what
that site emits. `encodePerks` / `decodePerks` in `src/lib/persist/codec.ts`
implement our own `#b=…` share-link encoding: base-36 rank, capped at 35,
plus a fallback array for perks outside the 2-char dictionary — deliberately
richer so our links survive game updates that add ranks beyond 5 or perks not
in N&D's dictionary.

The one genuine shared seam is the `nukesDragonsPerks` dictionary in
`src/lib/nukes-dragons.ts` (key → `PerkId` mapping). `codec.ts` already imports
it and builds a reverse map locally; the dictionary is not duplicated.

A future reviewer might reasonably want to unify the encoders into one shared
codec module, or pick one radix everywhere (e.g. base-36 for both) — don't.
N&D's format is not ours to change: we are reading *their* site's URL emission,
and encoding ranks 6–35 in N&D's base-10, rank-≤5 scheme is impossible without
breaking roundtrips on nukesdragons.com when a link is opened there. There is
likewise no benefit to downgrading our internal format — losing ranks 6–35 and
the fallback array — just to match an external constraint that does not apply to
our own links.
