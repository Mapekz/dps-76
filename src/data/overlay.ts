/**
 * Shared overlay-visibility contract: whether a generated record should be
 * shown, given the extractor's obtainability verdict plus the hand-maintained
 * hidden/forceVisible overlay (src/data/overrides/corrections.ts).
 *
 * A leaf module (no dependency on dataset.ts) so both the raw per-collection
 * adapters (live/weapons.ts, buffs.ts, omods.ts) and the dataset construction
 * / overlay-review layer (dataset.ts) share one predicate without a circular
 * import — dataset.ts itself imports from live/weapons.ts.
 */

export interface VisibilityOverlay {
  hidden: ReadonlySet<string>;
  forceVisible: ReadonlySet<string>;
}

/**
 * `extraForceVisible` covers rescue conditions that need more than just the
 * record's own id — e.g. an OMOD that's always visible when it's the
 * equipped weapon's own default part (omods.ts). That check is weapon-
 * contextual and stays at the call site; this predicate only owns the
 * id-keyed obtainable/hidden/forceVisible shape shared by every collection.
 */
export function isRecordVisible(
  record: { id: string; obtainable?: boolean },
  overlay: VisibilityOverlay,
  extraForceVisible = false
): boolean {
  return (
    (record.obtainable !== false || overlay.forceVisible.has(record.id) || extraForceVisible) &&
    !overlay.hidden.has(record.id)
  );
}
