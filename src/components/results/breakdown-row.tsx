import { cn } from '@/lib/utils';

function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('shrink-0 font-mono text-xs tabular-nums text-right', className)}>
      {children}
    </span>
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
  /** Falls back to `label` when it's a plain string; pass explicitly when `label` is JSX. */
  title?: string;
}) {
  const titleText = title ?? (typeof label === 'string' ? label : undefined);
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-2 py-px',
        indent && 'pl-3',
        muted && 'text-muted-foreground',
      )}
    >
      <span className="min-w-0 truncate text-xs" title={titleText}>
        {label}
      </span>
      <Num>{value}</Num>
    </div>
  );
}
