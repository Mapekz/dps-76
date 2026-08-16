import type { ReactNode } from 'react';
import { SectionLabel } from '@/components/ui/typography';

/**
 * Accordion trigger row: section name + a muted summary of what's inside, so
 * the whole build reads without opening anything.
 *
 * The name gets `min-w-0` so it can give ground on a narrow screen; without it
 * the row's three parts (name, badge, summary) can't shrink below their combined
 * width and the header spills out of the card.
 */
export function SectionTrigger({
  label,
  summary,
  badge,
}: {
  label: string;
  summary?: string;
  badge?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-2">
      {/* text-foreground override: unlike a passive Section Label sub-header
          (muted by default), this is the accordion's primary clickable
          header — full-ink emphasis, matching its pre-migration treatment. */}
      <SectionLabel as="span" size="lg" className="min-w-0 text-foreground">
        {label}
      </SectionLabel>
      <span className="flex min-w-0 items-center gap-2">
        {badge}
        {summary && (
          <span className="text-muted-foreground truncate text-xs font-normal normal-case">
            {summary}
          </span>
        )}
      </span>
    </span>
  );
}
