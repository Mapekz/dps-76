import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Native <input type="radio"> — the exclusivity is the whole point. Every
 * radio sharing a `name` is one group, so "only one at a time" is enforced by
 * the browser (and arrow-key traversal comes free) even when the options are
 * spread across separate rows of a table. Styled to sit next to the Radix
 * Checkbox: same size, same focus ring, round instead of square — the round
 * shape is the codebase's one documented exception to DESIGN.md's No-Radius
 * Rule (see "Shapes" there), because round-vs-square is the only remaining
 * single-select/multi-select affordance cue now that Checkbox is
 * `rounded-none`. Both `rounded-full` uses below (outer control, inner dot)
 * are that exception — nowhere else in the app should reach for it.
 */
function Radio({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <input
        type="radio"
        data-slot="radio"
        className={cn(
          'peer border-input checked:border-primary focus-visible:ring-ring size-4 appearance-none rounded-full border shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
      <span
        aria-hidden
        className="bg-primary pointer-events-none absolute size-2 scale-0 rounded-full motion-safe:transition-transform motion-safe:duration-100 peer-checked:scale-100"
      />
    </span>
  );
}

export { Radio };
