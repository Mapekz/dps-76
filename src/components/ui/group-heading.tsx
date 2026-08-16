import { SectionLabel } from '@/components/ui/typography';

/**
 * Section Label heading for a cluster of related controls inside an
 * accordion section — the idiom already used inline in
 * ArmorSection.tsx/BuffsSections.tsx, extracted so ConditionsSection/
 * TargetSection's flat 12-22-control lists (2026-08-10 design critique —
 * cognitive-load chunking/grouping) can reuse it instead of inventing a
 * fourth heading treatment. Renders `<h4>` — every call site lives inside an
 * accordion section, and Base UI's AccordionHeader already wraps that
 * section's own trigger in an unconditional `<h3>` (not overridable from
 * this app's accordion.tsx wrapper), so this is one level deeper: Header
 * `h1` → panel/accordion-section titles `h2`/`h3` → this `h4`.
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
