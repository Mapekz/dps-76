import { describe, it, expect } from 'bun:test';
import { ACTOR_VALUE_BUCKETS } from '../extract-omods';
import { FALLBACK_AVIF_ROUTES } from '../normalize/mgef';
import { BUCKET_REGISTRY, type BucketRegime } from '@/types/modifiers';

describe('routing table cross-table agreement', () => {
  it('ACTOR_VALUE_BUCKETS and FALLBACK_AVIF_ROUTES agree on every overlapping actor value', () => {
    const overlap = Object.keys(ACTOR_VALUE_BUCKETS).filter((av) => av in FALLBACK_AVIF_ROUTES);
    for (const av of overlap) {
      const omod = ACTOR_VALUE_BUCKETS[av];
      const fallback = FALLBACK_AVIF_ROUTES[av];
      expect({ bucket: omod.bucket, scale: omod.scale }, `disagreement on ${av}`).toEqual({
        bucket: fallback.bucket,
        scale: fallback.scale,
      });
    }
  });
});

describe('routing table regime compatibility', () => {
  /**
   * Regimes that AV routing tables (`FALLBACK_AVIF_ROUTES`, `ACTOR_VALUE_BUCKETS`)
   * produce today. Pinned deliberately — adding a route whose bucket sits in
   * `dot`, `sustainChance`, or `spellMagnitude` (or any other
   * regime not listed here) is a reviewed change, not an accidental table grow.
   *
   * `critEconomy` is included because STAT_VATSCritFillOnMiss now routes via
   * FALLBACK_AVIF_ROUTES (Four Leaf Clover, pile-1 2026-08-28). The other
   * excluded regimes (`dotDamage` from MGEF translation; sustain/spell-
   * magnitude buckets from other extraction paths) stay out of scope.
   */
  const ALLOWED_EXTRACTION_REGIMES: ReadonlySet<BucketRegime> = new Set([
    'damageFold',
    'weaponStat',
    'apEconomy',
    'playerStat',
    'bootstrap',
    'mitigation',
    'display',
    'unfolded',
    'critEconomy',
  ]);

  it('every bucket named by either AV routing table has an allowed extraction regime', () => {
    const buckets = new Set([
      ...Object.values(FALLBACK_AVIF_ROUTES).map((route) => route.bucket),
      ...Object.values(ACTOR_VALUE_BUCKETS).map((route) => route.bucket),
    ]);
    for (const bucket of buckets) {
      const regime = BUCKET_REGISTRY[bucket].regime;
      expect(
        ALLOWED_EXTRACTION_REGIMES.has(regime),
        `${bucket} has regime ${regime}, not in allowed extraction set`,
      ).toBe(true);
    }
  });
});

describe('FALLBACK_AVIF_ROUTES dbm scale split', () => {
  it('STAT_Dmg* uses scale 0.01 (percent points); STAT_DmgMult* uses scale 1 (stored fractions)', () => {
    for (const [av, route] of Object.entries(FALLBACK_AVIF_ROUTES)) {
      if (av.startsWith('STAT_DmgMult')) {
        expect(route.scale, `${av} should be scale 1`).toBe(1);
      } else if (av.startsWith('STAT_Dmg')) {
        expect(route.scale, `${av} should be scale 0.01`).toBe(0.01);
      }
    }
  });
});
