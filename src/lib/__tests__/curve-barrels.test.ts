import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Static imports of all 8 barrels
import creaturesHealthLive from '@/data/live/curvetables/creatures/health/index.generated';
import creaturesArmorLive from '@/data/live/curvetables/creatures/armor/index.generated';
import playerDamageLive from '@/data/live/curvetables/player/damage/index.generated';
import playerArmorLive from '@/data/live/curvetables/player/armor/index.generated';
import creaturesHealthPts from '@/data/pts/curvetables/creatures/health/index.generated';
import creaturesArmorPts from '@/data/pts/curvetables/creatures/armor/index.generated';
import playerDamagePts from '@/data/pts/curvetables/player/damage/index.generated';
import playerArmorPts from '@/data/pts/curvetables/player/armor/index.generated';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Curve-table barrels (index.generated.ts) must stay in sync with their
 * on-disk *.json files. This test catches renames/drops that could silently
 * reduce tier coverage (e.g. a zzz-prefixed rename in the game editor that
 * bypasses a naive prefix search).
 *
 * The 8 barrels cover 4 families (creatures health/armor, player damage/armor)
 * × 2 modes (live, pts).
 */

// All 8 barrel locations and their imported modules
const BARREL_TEST_CASES = [
  {
    path: 'src/data/live/curvetables/creatures/health',
    module: creaturesHealthLive,
  },
  {
    path: 'src/data/live/curvetables/creatures/armor',
    module: creaturesArmorLive,
  },
  {
    path: 'src/data/live/curvetables/player/damage',
    module: playerDamageLive,
  },
  {
    path: 'src/data/live/curvetables/player/armor',
    module: playerArmorLive,
  },
  {
    path: 'src/data/pts/curvetables/creatures/health',
    module: creaturesHealthPts,
  },
  {
    path: 'src/data/pts/curvetables/creatures/armor',
    module: creaturesArmorPts,
  },
  {
    path: 'src/data/pts/curvetables/player/damage',
    module: playerDamagePts,
  },
  {
    path: 'src/data/pts/curvetables/player/armor',
    module: playerArmorPts,
  },
];

describe.each(BARREL_TEST_CASES)('curve barrel sync: $path', ({ path, module }) => {
  it('disk *.json files match barrel index.generated.ts keys', () => {
    // Resolve path relative to the test file's directory:
    // __dirname is src/lib/__tests__, so we go up 3 levels to project root
    const projectRoot = resolve(__dirname, '..', '..', '..');
    const fullPath = resolve(projectRoot, path);

    // Extract tier numbers from all *.json files in the directory
    const diskFiles = readdirSync(fullPath);
    const tierRegex = /(\d+)\.json$/;
    const diskTiers = diskFiles
      .filter((f: string) => tierRegex.test(f))
      .map((f: string) => {
        const match = f.match(tierRegex);
        return match ? Number(match[1]) : null;
      })
      .filter((t: number | null): t is number => t !== null)
      .sort((a: number, b: number) => a - b);

    // Extract tier numbers from the barrel's export
    // The barrel exports a default object, so we access it directly
    const barrelModule = module as Record<string | number, unknown>;
    const barrelTiers = Object.keys(barrelModule)
      .map(Number)
      .sort((a: number, b: number) => a - b);

    // Assert equivalence both directions:
    // - No file on disk is missing from the barrel
    // - No barrel key is missing a corresponding file on disk
    expect(barrelTiers).toEqual(diskTiers);
  });
});
