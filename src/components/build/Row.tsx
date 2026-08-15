import { HelperText } from '@/components/ui/helper-text';
import { NoEffectBadge } from './OptionBadge';

/**
 * The "chip" shell shared by PerkRow (PerkEditorSection) and ArmorEffectRow's
 * two branches (ArmorSection) — a muted box with a truncating label, an
 * optional "no effect yet" badge, a description line below, and whatever
 * control the caller owns in between (a rank/count CountStepper, a static
 * "on" Badge, a cost readout — genuinely different per caller, so left as
 * `children` rather than forced into a shared prop shape).
 *
 * Deliberately NOT shared with CheckboxRow (BuffsSections/MutationsSection):
 * that one is push not pull, has no chip background, no remove control, and
 * models a persistent toggle rather than an addable/removable item — a
 * different kind of row, not the same shell with different data. See
 * ADR-0016.
 */
export function Row({
  label,
  noEffect,
  description,
  children,
}: {
  label: string;
  noEffect?: boolean;
  description?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/40 rounded-none space-y-1 px-2 py-1 text-sm">
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {noEffect && <NoEffectBadge />}
        {children}
      </div>
      {description && <HelperText>{description}</HelperText>}
    </div>
  );
}
