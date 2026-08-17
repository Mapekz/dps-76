import * as React from 'react';

import { cn } from '@/lib/utils';
import { microLabelVariants } from '@/components/ui/typography-variants';

function Card({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'group/card flex flex-col gap-(--card-spacing) overflow-hidden bg-card py-(--card-spacing) text-sm text-card-foreground shadow-sm ring-1 ring-foreground/5 [--card-spacing:--spacing(6)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(5)] *:[img:first-child]:rounded-none *:[img:last-child]:rounded-none',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1.5 rounded-none px-4 sm:px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Micro Label voice at its documented larger exception, `size="lg"`
 * (DESIGN.md's Cards section: "Micro Label voice, text-lg, uppercase,
 * tracking-wider" — the one place Micro Label appears larger than a
 * button/badge). `level` renders it as a real heading — pass `level={2}`
 * for a panel/card title in the app's h1→h2→h3 outline (Header is `h1`).
 */
function CardTitle({
  level,
  className,
  ...props
}: React.ComponentProps<'div'> & { level?: 1 | 2 | 3 }) {
  const Tag = level ? (`h${level}` as const) : 'div';
  return (
    <Tag
      data-slot="card-title"
      className={cn(microLabelVariants({ size: 'lg' }), className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-4 sm:px-(--card-spacing)', className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center px-4 sm:px-(--card-spacing) [.border-t]:pt-(--card-spacing)',
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
