import { Badge } from '@/components/ui/badge';

/**
 * Small outline badge used next to picker option rows and active-selection
 * rows for status tags ('no effect yet', 'pending rework', 'standard').
 * Extracted from four near-identical inline copies (WeaponSection,
 * PerkEditorSection, BuffsSections) — same visual language across the whole
 * Build panel.
 */
export function OptionBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="text-muted-foreground ml-1 px-1 py-0 text-[10px] font-normal"
    >
      {children}
    </Badge>
  );
}

/** Shared 'no effect yet' predicate badge — same wording/style everywhere it's used. */
export function NoEffectBadge() {
  return <OptionBadge>no effect yet</OptionBadge>;
}
