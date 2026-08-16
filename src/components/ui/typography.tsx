import type * as React from 'react';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import {
  HEADING_TAG,
  type HeadingLevel,
  titleVariants,
  sectionLabelVariants,
  microLabelVariants,
  bodyVariants,
  readoutVariants,
} from '@/components/ui/typography-variants';

/**
 * The five type voices named in DESIGN.md's Typography section, each owning
 * every axis (family, size, weight, tracking, leading) so a call site can no
 * longer re-decide one axis in isolation — that per-site re-deciding is how
 * the Section Label voice ended up as 13 different class strings across 21
 * sites, and how `tracking-[0.1em]`/`tracking-widest` (the same computed
 * value, spelled two ways) stopped actually distinguishing DESIGN.md's Two
 * Uppercase Voices Rule. `leading-*` is explicit on every voice because
 * `--text-3xs`/`--text-2xs` (src/index.css) ship no bundled line-height and
 * would otherwise inherit whatever line-height is in scope.
 *
 * The cva definitions live in typography-variants.ts (a plain-function file,
 * not a component file — see its own doc-comment) and are pinned against
 * DESIGN.md's `typography:` front-matter by
 * src/data/__tests__/design-tokens.test.ts — a mismatch there means this
 * file and the spec have drifted, the same failure mode that let the
 * `colors:` block stay in sync while this one didn't.
 *
 * Every component composes `className` after its defaults via `cn()`, so a
 * call site can still extend or override (same contract as HelperText).
 * Internal classes are always t-shirt-shaped Tailwind sizes — never add a
 * `--text-<word>` token to satisfy a new variant here (src/index.css:59-74).
 */

// ---- Header Title voice -----------------------------------------------

export function Title({
  level,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'h1'> & { level?: HeadingLevel }) {
  const Tag = level ? HEADING_TAG[level] : 'div';
  return <Tag className={cn(titleVariants(), className)} {...props} />;
}

// ---- Section Label voice ------------------------------------------------

export function SectionLabel({
  level,
  as,
  size,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'p'> &
  VariantProps<typeof sectionLabelVariants> & {
    level?: HeadingLevel;
    /** Escape hatch for phrasing-content-only containers (e.g. a `<button>`
     * AccordionTrigger, which can't contain a `<p>`) — ignored if `level` is set. */
    as?: React.ElementType;
  }) {
  const Tag = level ? HEADING_TAG[level] : (as ?? 'p');
  return <Tag className={cn(sectionLabelVariants({ size }), className)} {...props} />;
}

// ---- Micro Label voice ----------------------------------------------------

export function MicroLabel({
  level,
  size,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'> &
  VariantProps<typeof microLabelVariants> & { level?: HeadingLevel }) {
  const Tag = level ? HEADING_TAG[level] : 'span';
  return <Tag className={cn(microLabelVariants({ size }), className)} {...props} />;
}

// ---- Body voice -------------------------------------------------------

export function Body({ className, ...props }: React.ComponentPropsWithoutRef<'p'>) {
  return <p className={cn(bodyVariants(), className)} {...props} />;
}

// ---- Readout voice ------------------------------------------------------

export function Readout({
  as,
  className,
  size,
  ...props
}: React.ComponentPropsWithoutRef<'span'> &
  VariantProps<typeof readoutVariants> & {
    /** Escape hatch for a standalone block context (a plain-flow parent, not
     * flex/grid) where the default inline `<span>` won't stack the way the
     * `<p>` it's replacing did — e.g. a readout that's its own paragraph
     * rather than inline text within a row. */
    as?: React.ElementType;
  }) {
  const Tag = as ?? 'span';
  return <Tag className={cn(readoutVariants({ size }), className)} {...props} />;
}
