import type { BucketTrace, TraceContribution } from '@/lib/engine/trace';
import { Row } from './breakdown-row';

function cadenceSubRow(c: TraceContribution, parentKey: string, op: 'mulAdd' | 'add') {
  if (!c.cadence) return null;
  const { raw, procChance, oneInShots } = c.cadence;
  const rawFormatted = op === 'mulAdd' ? `${signed(raw * 100, 0)}%` : signed(raw);
  const procPercent = Math.round(procChance * 100);
  return (
    <Row
      key={`${parentKey}-cadence`}
      indent={2}
      muted
      label={`${rawFormatted} at ${procPercent}% on 1 of ${oneInShots} shots`}
      value=""
    />
  );
}

/** Shared by `MultiplierChainTable`'s reload/mag-cycle rows and `ApEconomyPanel`'s pool-cycle rows. */
export const formatSeconds = (value: number) => `${value.toFixed(1)}s`;

export function signed(v: number, digits = 2): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;
}

/**
 * `labelSuffix` distinguishes contributors that don't act like ordinary
 * peers of the bucket's other rows (e.g. critDmgBonusScale, which scales the
 * crit-bonus rows above it rather than adding to the total directly) without
 * touching `source.name` itself — that name is shared with other UI (e.g. an
 * equipped-mods list) and shouldn't carry a breakdown-specific caveat.
 * Magazine-cycle averages (`cadence` on a contribution) get a second muted
 * sub-row showing the raw proc and shot count behind the folded value.
 */
export function contributionRows(trace: BucketTrace, keyPrefix: string, labelSuffix = '') {
  // Key rows by fold-array index too: one source may emit several modifiers
  // onto the same bucket (e.g. Daisy Cutter's OMOD), so edid+rank alone
  // collides. Fold order is deterministic per render, so the index is stable.
  const rows: React.ReactNode[] = [];
  for (const [i, c] of trace.overriddenSets.entries()) {
    const text = `${c.source.name}${labelSuffix} = ${c.value.toFixed(2)} (overridden)`;
    rows.push(
      <Row
        key={`${keyPrefix}-ov-${c.source.edid}-${i}`}
        indent
        muted
        label={<s>{text}</s>}
        value=""
        title={text}
      />,
    );
  }
  if (trace.set) {
    rows.push(
      <Row
        key={`${keyPrefix}-set`}
        indent
        label={`${trace.set.source.name}${labelSuffix} (sets base)`}
        value={trace.set.value.toFixed(2)}
      />,
    );
  }
  for (const [i, c] of trace.mulAdd.entries()) {
    const key = `${keyPrefix}-mul-${c.source.edid}-${c.source.rank ?? 0}-${i}`;
    rows.push(
      <Row
        key={key}
        indent
        label={`${c.source.name}${labelSuffix}`}
        value={`${signed(c.value * 100, 0)}%`}
      />,
    );
    const cadence = cadenceSubRow(c, key, 'mulAdd');
    if (cadence) rows.push(cadence);
  }
  for (const [i, c] of trace.add.entries()) {
    const key = `${keyPrefix}-add-${c.source.edid}-${c.source.rank ?? 0}-${i}`;
    rows.push(
      <Row key={key} indent label={`${c.source.name}${labelSuffix}`} value={signed(c.value)} />,
    );
    const cadence = cadenceSubRow(c, key, 'add');
    if (cadence) rows.push(cadence);
  }
  return rows;
}

/**
 * `apRegenFlat` sources (Company Tea) are ADD-op but already percentage-points
 * on the race base's own "% of max/s" scale — shown against the `Σ N% of
 * max/s` base-rate row they add into, so they need a % suffix rather than
 * `contributionRows`'s raw-decimal convention.
 */
export function flatPercentRows(trace: BucketTrace, keyPrefix: string) {
  return trace.add.map((c, i) => (
    <Row
      key={`${keyPrefix}-${c.source.edid}-${c.source.rank ?? 0}-${i}`}
      indent
      label={c.source.name}
      value={`${signed(c.value, 1)}%`}
    />
  ));
}

export function wholeDamageRows(contributions: TraceContribution[]) {
  return contributions.map((c, i) => (
    <Row
      key={`wd-${c.source.edid}-${i}`}
      indent
      label={c.source.name}
      value={`×${(1 + c.value).toFixed(2)}`}
    />
  ));
}
