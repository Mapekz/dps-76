/**
 * Append-only id→integer wire dictionary for build-share URLs.
 *
 * Each category file maps stable game ids to small non-negative integers so
 * encoded URLs carry integers instead of long ESM editor-id strings.
 *
 * ## Why an explicit-integer object, not an array
 *
 * An array whose position implies the index would be ~2× smaller, but its
 * correctness would rest entirely on "nobody ever reorders this file". Someone
 * alphabetising it for readability, or a formatter sorting keys, would
 * **silently** repoint every published URL with no error anywhere. The
 * explicit-integer object is immune to key reordering by construction.
 *
 * ## Rules
 *
 * - `ids` is **append-only**: a key is never deleted, a value is never reused
 *   or changed. A retired id simply stays and keeps resolving, so there is no
 *   tombstone mechanism to build.
 * - `nextIndex` is an explicit monotonic watermark, **not** `max(values) + 1`
 *   computed at read time. That way a human can later prune a genuinely dead key
 *   without the freed integer being handed to an unrelated id.
 * - `acknowledgedRemovals` only suppresses report noise ("yes, really gone, not
 *   a rename"). It has **zero** effect on encode/decode. No entry here may
 *   still be a key in `ids`.
 * - A Bethesda rename is fixed by **editing the key string in place, keeping
 *   the integer** — so the old wire integer keeps resolving to the current
 *   record.
 */
export interface WireDictionary {
  /** Next integer to assign; monotonic watermark, not derived from `ids`. */
  nextIndex: number;
  /** Append-only id → wire integer. Values are never reused or changed. */
  ids: Record<string, number>;
  /** Ids confirmed gone (not renamed) — report noise only, no encode/decode effect. */
  acknowledgedRemovals: string[];
}
