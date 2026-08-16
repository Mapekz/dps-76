import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared helper/description-text idiom — Body voice at the muted 12px
 * caption size rather than Body's own 14px, since this is annotation on a
 * control, not paragraph copy. ~30 inline `<p>` literals existed before
 * this, none width-constrained (2026-08-10 design critique — line length).
 * `max-w-prose` caps a helper paragraph so it can't stretch the full
 * build-column width; pass `className` to extend per-site variants (`mt-1`,
 * `font-medium`, ...) — it composes after the defaults, so it can also
 * override them.
 */
export function HelperText({ className, ...props }: React.ComponentPropsWithoutRef<'p'>) {
  return <p className={cn('text-muted-foreground max-w-prose text-xs', className)} {...props} />;
}
