import * as React from 'react';

import { cn } from '@/lib/utils';
import { microLabelVariants } from '@/components/ui/typography-variants';

/**
 * Two type styles in one element, by design: the default caption is the
 * Micro Label voice at its 12px button-exception size (DESIGN.md), but a
 * Label wrapping a Checkbox/Radio/Switch instead renders that control's own
 * option text, which is Body voice (text-sm font-normal, not uppercase) —
 * the peer-data-[slot=…] overrides below switch voice based on which
 * control is the label's sibling. Was previously `tracking-wide`
 * (0.025em); DESIGN.md's Micro Label voice is `tracking-widest` (0.1em) —
 * button.tsx already had this right since it hardcodes its own copy.
 */
function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        microLabelVariants({ size: 'sm' }),
        'flex items-center gap-2 select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-data-[slot=checkbox]:text-sm peer-data-[slot=checkbox]:font-normal peer-data-[slot=checkbox]:tracking-normal peer-data-[slot=checkbox]:normal-case peer-data-[slot=radio-group-item]:text-sm peer-data-[slot=radio-group-item]:font-normal peer-data-[slot=radio-group-item]:tracking-normal peer-data-[slot=radio-group-item]:normal-case peer-data-[slot=switch]:text-sm peer-data-[slot=switch]:font-normal peer-data-[slot=switch]:tracking-normal peer-data-[slot=switch]:normal-case',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
