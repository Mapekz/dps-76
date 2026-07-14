import { describe, it, expect } from 'vitest';
import { getUnresolvedOverrideKeys } from '@/data/dataset';

/**
 * Overlay reviewer: every hand-maintained override table (src/data/overrides/*)
 * must still target a real generated id. A failure here means a `pnpm extract`
 * renamed/removed something an override keys off of — the override is now
 * silently inert. Fix by updating or removing the stale entry (see the
 * overlay's own file for its source-comment convention).
 */
describe('getUnresolvedOverrideKeys', () => {
  it('has no stale overlay keys on live', () => {
    expect(getUnresolvedOverrideKeys('live')).toEqual([]);
  });

  it('has no stale overlay keys on pts', () => {
    expect(getUnresolvedOverrideKeys('pts')).toEqual([]);
  });
});
