import type { ReactNode } from 'react';

/**
 * Accordion trigger row: section name + a muted summary of what's inside, so
 * the whole build reads without opening anything.
 *
 * The name gets `min-w-0` so it can give ground on a narrow screen; without it
 * the row's three parts (name, badge, summary) can't shrink below their combined
 * width and the header spills out of the card.
 */
export function SectionTrigger({ label, summary, badge }: { label: string; summary?: string; badge?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-2">
      <span className="font-condensed min-w-0 text-sm font-semibold uppercase tracking-[0.1em]">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        {badge}
        {summary && <span className="text-muted-foreground truncate text-xs font-normal normal-case">{summary}</span>}
      </span>
    </span>
  );
}
