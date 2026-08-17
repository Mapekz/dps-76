import { SectionLabel } from '@/components/ui/typography';

/**
 * Section Label heading for a cluster of related controls inside an
 * accordion section — the idiom already used inline in
 * ArmorSection.tsx/BuffsSections.tsx, extracted so ConditionsSection/
 * TargetSection's flat 12-22-control lists (2026-08-10 design critique —
 * cognitive-load chunking/grouping) can reuse it instead of inventing a
 * fourth heading treatment. Renders `<h4>` — every call site lives one level
 * below a real h3: either an accordion section's Base UI AccordionHeader
 * (unconditional `<h3>` on the trigger, not overridable from this app's
 * accordion.tsx wrapper) or a plain panel heading (see
 * `EncounterCard.tsx`/`TargetPanel.tsx`), so this stays one level deeper:
 * Header `h1` → panel/accordion-section titles `h2`/`h3` → this `h4`.
 */
export function GroupHeading({
  title,
  right,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between pb-1">
      <SectionLabel level={4}>{title}</SectionLabel>
      {/* Short tabular status text ("2/4"), not prose — no HelperText/max-width here. */}
      {right && <p className="text-muted-foreground text-xs">{right}</p>}
    </div>
  );
}
