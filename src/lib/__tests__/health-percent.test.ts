import { describe, it, expect } from 'bun:test';
import {
  PLAYER_HEALTH_PERCENT_STOPS,
  ENEMY_HEALTH_PERCENT_STOPS,
  snapHealthPercent,
  healthPercentIndex,
} from '@/lib/health-percent';

describe('snapHealthPercent', () => {
  it('leaves exact stops untouched', () => {
    for (const stop of PLAYER_HEALTH_PERCENT_STOPS) {
      expect(snapHealthPercent(stop, PLAYER_HEALTH_PERCENT_STOPS)).toBe(stop);
    }
  });

  it('rounds to the nearest player stop', () => {
    expect(snapHealthPercent(37, PLAYER_HEALTH_PERCENT_STOPS)).toBe(40);
    expect(snapHealthPercent(1, PLAYER_HEALTH_PERCENT_STOPS)).toBe(5);
    expect(snapHealthPercent(8, PLAYER_HEALTH_PERCENT_STOPS)).toBe(10);
    expect(snapHealthPercent(12.5, PLAYER_HEALTH_PERCENT_STOPS)).toBe(15); // exact tie rounds up
  });

  it('rounds to the nearest enemy stop', () => {
    expect(snapHealthPercent(1, ENEMY_HEALTH_PERCENT_STOPS)).toBe(20);
    expect(snapHealthPercent(30, ENEMY_HEALTH_PERCENT_STOPS)).toBe(40); // exact tie rounds up
    expect(snapHealthPercent(39, ENEMY_HEALTH_PERCENT_STOPS)).toBe(40);
  });

  it('clamps out-of-range values to the nearest end', () => {
    expect(snapHealthPercent(0, PLAYER_HEALTH_PERCENT_STOPS)).toBe(5);
    expect(snapHealthPercent(1000, PLAYER_HEALTH_PERCENT_STOPS)).toBe(100);
    expect(snapHealthPercent(-50, ENEMY_HEALTH_PERCENT_STOPS)).toBe(20);
  });
});

describe('healthPercentIndex', () => {
  it('round-trips every stop to its own index', () => {
    PLAYER_HEALTH_PERCENT_STOPS.forEach((stop, i) => {
      expect(healthPercentIndex(stop, PLAYER_HEALTH_PERCENT_STOPS)).toBe(i);
    });
  });

  it('snaps off-grid values before indexing', () => {
    expect(healthPercentIndex(37, PLAYER_HEALTH_PERCENT_STOPS)).toBe(
      PLAYER_HEALTH_PERCENT_STOPS.indexOf(40),
    );
  });
});
