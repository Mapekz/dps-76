import { Readout } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Readout size="sm" className={cn('shrink-0 text-right', className)}>
      {children}
    </Readout>
  );
}

/**
 * One label/value line shared by the "Why these numbers" derivation tables
 * (`MultiplierChainTable`, `ApEconomyPanel`) — kept in its own file (rather
 * than exported alongside a component) so both stay Fast-Refresh-friendly
 * (oxlint's `react/only-export-components`).
 */
export function Row({
  label,
  value,
  indent,
  muted,
  title,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  indent?: boolean;
  muted?: boolean;
  /**
   * No auto-fallback to `label` — that existed only to backstop the
   * `truncate` this row no longer applies. Pass explicitly for definitions
   * that add information beyond the visible label.
   */
  title?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-2 py-px',
        indent && 'pl-3',
        muted && 'text-muted-foreground',
      )}
    >
      {/*
       * No `truncate` — this row's whole value proposition is a
       * hand-verifiable derivation (DESIGN.md's Derivation Ledger Table), so
       * a cut-off label breaks that promise. `min-w-0` is still required: it
       * lets this flex item shrink below its content width so long labels
       * wrap instead of pushing the numeric column off-axis (that column is
       * `shrink-0` — see `Num` above).
       */}
      <span className="min-w-0 text-xs" title={title}>
        {label}
      </span>
      <Num>{value}</Num>
    </div>
  );
}
