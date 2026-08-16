import { describe, expect, it } from 'bun:test';
import { cn } from '../utils';

/**
 * Regression test for a tailwind-merge trap: a custom `--text-*` @theme
 * token whose name doesn't parse as a Tailwind t-shirt size (the original
 * `--text-micro`/`--text-section`, since renamed to `--text-3xs`/`--text-2xs`
 * — see src/index.css's comment above the token block) gets classified by
 * tailwind-merge as a text-COLOR utility, not font-size. That silently
 * dropped `text-positive`/`text-negative` from combobox ΔDPS text
 * (DeltaText, src/components/diff/DiffTooltip.tsx) and dropped the size
 * class from every Badge variant (src/components/ui/badge.tsx), since each
 * carries its own `text-*` color. Pin the fixed behavior so the next custom
 * `--text-*` addition can't reintroduce it.
 */
describe('cn', () => {
  it('keeps a color class alongside the custom text-3xs size token', () => {
    expect(cn('text-positive font-mono tabular-nums', 'ml-2 text-3xs')).toBe(
      'text-positive font-mono tabular-nums ml-2 text-3xs',
    );
    expect(cn('text-negative font-mono tabular-nums', 'ml-2 text-3xs')).toBe(
      'text-negative font-mono tabular-nums ml-2 text-3xs',
    );
  });

  it('keeps text-3xs alongside every Badge variant color', () => {
    // Mirrors badgeVariants' base + each variant's color class
    // (src/components/ui/badge.tsx) without importing the cva output, which
    // isn't exported.
    const base =
      'inline-flex items-center justify-center rounded-none border px-2 py-0.5 text-3xs font-semibold tracking-widest uppercase';
    const variantColors = [
      'border-transparent bg-primary text-primary-foreground',
      'border-transparent bg-secondary text-secondary-foreground',
      'border-transparent bg-destructive text-white',
      'text-foreground',
    ];
    for (const variantColor of variantColors) {
      expect(cn(base, variantColor)).toContain('text-3xs');
    }
  });

  it('still collapses a genuine font-size conflict to the last one', () => {
    expect(cn('text-3xs', 'text-2xs')).toBe('text-2xs');
    expect(cn('text-2xs', 'text-3xs')).toBe('text-3xs');
  });

  it('still collapses a genuine text-color conflict to the last one', () => {
    expect(cn('text-positive', 'text-negative')).toBe('text-negative');
  });
});
