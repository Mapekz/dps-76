import { cva } from 'class-variance-authority';

/**
 * The cva definitions behind typography.tsx's five voice components, split
 * into their own module because oxlint's `react/only-export-components`
 * (Fast Refresh) forbids a component file from also exporting plain
 * functions — the same reason badge.tsx/button.tsx keep their own
 * `*Variants` module-private. These are exported so
 * src/data/__tests__/design-tokens.test.ts can pin the emitted classes
 * against DESIGN.md's `typography:` frontmatter without duplicating class
 * strings into the test; typography.tsx imports them to build its
 * components and doesn't re-export them.
 */

export type HeadingLevel = 1 | 2 | 3 | 4;
export const HEADING_TAG: Record<HeadingLevel, 'h1' | 'h2' | 'h3' | 'h4'> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
};

// ---- Header Title voice -----------------------------------------------
// "the app name in the header, the only place this large a label appears."
// Not in DESIGN.md's frontmatter `typography:` block (only section-label/
// micro-label/body/readout are) — a single-instance voice, nothing to pin.

export const titleVariants = cva(
  'font-condensed text-xl font-semibold uppercase tracking-[0.12em] leading-tight',
);

// ---- Section Label voice ------------------------------------------------
// "Damage output," "Suggestions," scenario names — the primary structural
// label voice. `size` covers the documented larger-size exceptions
// (SectionTrigger's 14px accordion headers); it is not a drift escape
// hatch — see DESIGN.md's Micro Label note on shared-voice-not-fixed-size
// for the sibling case.

export const sectionLabelVariants = cva(
  'font-condensed font-semibold uppercase tracking-[0.14em] leading-tight text-muted-foreground',
  {
    variants: {
      size: {
        default: 'text-2xs',
        lg: 'text-sm',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

// ---- Micro Label voice ----------------------------------------------------
// "A shared voice, not one fixed size" (DESIGN.md) — badges/group headings
// at the 10px default; `size="sm"` is the documented button/field-caption
// exception at 12px (DESIGN.md: "buttons render it at 12px"; button.tsx
// already implements this independently since it's a vendored primitive);
// `size="lg"` is the one documented exception in the other direction, the
// card/panel Title (DESIGN.md's Cards section: "Micro Label voice, text-lg,
// uppercase, tracking-wider").

export const microLabelVariants = cva('font-semibold uppercase tracking-widest', {
  variants: {
    size: {
      default: 'text-3xs leading-none',
      sm: 'text-xs leading-none',
      lg: 'text-lg leading-tight',
    },
  },
  defaultVariants: { size: 'default' },
});

// ---- Body voice -------------------------------------------------------
// Descriptions, helper copy, tooltip content.

export const bodyVariants = cva('text-sm font-normal leading-relaxed');

// ---- Readout voice ------------------------------------------------------
// "Every DPS/percentage/seconds/AP value on screen" — the Numerals-Are-Mono
// Rule lives here as a size variant rather than a free-form size prop
// specifically so it can never be satisfied without `tabular-nums`.

export const readoutVariants = cva('font-mono tabular-nums font-medium leading-tight', {
  variants: {
    size: {
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-2xl',
    },
  },
  defaultVariants: { size: 'sm' },
});
