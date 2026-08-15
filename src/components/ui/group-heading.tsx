/**
 * Micro-label heading for a cluster of related controls inside an accordion
 * section — the idiom already used inline in ArmorSection.tsx/BuffsSections.tsx,
 * extracted so ConditionsSection/TargetSection's flat 12-22-control lists
 * (2026-08-10 design critique — cognitive-load chunking/grouping) can reuse
 * it instead of inventing a fourth heading treatment.
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
      <p className="font-condensed text-muted-foreground text-micro font-semibold uppercase tracking-[0.1em]">
        {title}
      </p>
      {right && <p className="text-muted-foreground text-xs">{right}</p>}
    </div>
  );
}
