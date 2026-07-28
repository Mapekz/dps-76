import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Native <input type="radio"> — the exclusivity is the whole point. Every
 * radio sharing a `name` is one group, so "only one at a time" is enforced by
 * the browser (and arrow-key traversal comes free) even when the options are
 * spread across separate rows of a table. Styled to sit next to the Radix
 * Checkbox: same size, same focus ring, round instead of square.
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
