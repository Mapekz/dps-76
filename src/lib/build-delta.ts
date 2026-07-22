/**
 * Build Delta — the set of fields in a config object that differ from their
 * defaults. Shared by URL serialization (`src/lib/persist/codec.ts`) and the
 * "N active" badges in ConditionsSection and TargetSection.
 */

/** Fields in `value` that differ from `defaults` (strict `!==` per key). */
export function buildDelta<T extends object>(value: T, defaults: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    if (value[key] !== defaults[key]) out[key] = value[key];
  }
  return out;
}

/** Count of non-default fields — `Object.keys(buildDelta(value, defaults)).length`. */
export function buildDeltaCount<T extends object>(value: T, defaults: T): number {
  return Object.keys(buildDelta(value, defaults)).length;
}
