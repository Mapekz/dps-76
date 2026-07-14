import type { GeneratedBuff } from '@/types/generated';

/**
 * Sort key for buff pickers. `numeric: true` sorts embedded issue numbers
 * correctly ("...9" before "...10"), not as plain strings (which would put
 * "...10" before "...2") — magazine issues in particular.
 */
export function byName(a: GeneratedBuff, b: GeneratedBuff): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}
