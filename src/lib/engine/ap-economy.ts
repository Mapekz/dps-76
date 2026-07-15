import type { SustainResult } from './sustain';

/**
 * Steady-state VATS AP economy (docs/assumptions.md "VATS AP economy &
 * manual-aim hit rate").
 *
 * Every VATS shot costs AP (WEAP "Action Point Cost" — Weapon.apCost); AP
 * regenerates over time and VATS crits can restore extra AP (Conductor's).
 * When the drain rate exceeds the gain rate, the player cannot sustain
 * continuous VATS fire forever — `uptime` is the steady-state duty cycle
 * (fraction of time spent actively firing before the pool runs dry and
 * regen must catch back up), and `apLimitedDps` is the sustained VATS DPS
 * scaled by that duty cycle.
 *
 * ESM sources (20260710 dump, recorded in the same assumptions.md section):
 * - GMSTs `fAVDActionPointsBase` = 60, `fAVDActionPointsMult` = 10 →
 *   MaxAP = 60 + 10×AGI.
 * - RACE `Properties` rows set the base of AV `ActionPointsRate`
 *   (0x000002D8): HumanRace 6.0, PowerArmorRace 3.0 (the player's race
 *   swaps in power armor — regen is HALVED in PA).
 *
 * Regen model (rate semantics user-confirmed 2026-07-15, not record-typed):
 * the race value is a PERCENT OF MAX AP regenerated per second, so
 * `regenPerSec = maxAp × (raceBase + Σ apRegenFlat)/100 × (1 + Σ apRegen)`.
 * Flat sources (Company Tea's +10) ADD onto the race base of the same AV;
 * percent sources (Action Boy/Girl/Ghoul, hydration, Lone Wanderer — AV
 * ActionPointsRateMult) stack additively into one multiplier on that base.
 * Notable consequence: bigger pools regenerate proportionally faster, so
 * `apMax` fortifies and AGI raise absolute regen too. (GMST
 * `fActionPointsRestoreRate` = 4.0 exists but is NOT the operative base —
 * engine use unknown; superseded by the race Properties row.) The
 * stopwatch goldens pin the absolute numbers — measuring at two different
 * AGI values would also distinguish %-of-max from flat if any doubt
 * remains.
 *
 * On-crit AP HoTs (Conductor's 20 AP/s over 5s half) are REFRESH-ONLY: a new
 * crit restarts the window instead of stacking (user-confirmed in-game
 * behavior, mirrors the dotDamage convention), so the steady-state term is
 * rate × min(1, durationSec × critsPerSec) — fast crits saturate at the raw
 * rate, slow crits (interval ≥ duration) recover the full rate × duration
 * per crit.
 *
 * Passive regen does NOT tick while VATS-firing continuously (user-confirmed
 * in-game 2026-07-15): the race-base %-of-max regen and every passive bonus
 * that feeds it (Company Tea's flat +10, Action Boy/Girl/Ghoul, hydration,
 * Lone Wanderer, Packin' Light, ...) is real for idle/out-of-combat regen
 * (still reported as `regenPerSec`) but does not tick during the mag dump.
 * It DOES tick during the reload (user-confirmed 2026-07-15), starting
 * AP_REGEN_DELAY_SEC after firing stops, so each magazine cycle recovers
 * regenPerSec × max(0, reloadSec − delay) — cycle-averaged into
 * `apGainPerSec` as `reloadRegenPerSec` alongside the crit-triggered
 * restores (Conductor's spike + HoT) and AP-cost modifiers (folded into
 * `apCost` upstream).
 *
 * Considered and NOT implemented (user decision 2026-07-15): crediting full
 * passive regen during the AP-forced pause when uptime < 1, i.e. the
 * duty-cycle form uptime = regen/(drain − gain + regen). That would change
 * apLimitedDps for every AP-constrained build, not just reload-heavy ones —
 * revisit against an in-game uptime measurement before adopting.
 *
 * On-kill AP restores (Grim Reaper's Sprint, Inertial) are OUT OF SCOPE
 * (need enemy TTK, phase 3) — not computed here.
 */

/** GMST fAVDActionPointsBase (20260702 ESM) — flat AP pool floor. */
export const AP_POOL_BASE = 60;
/** GMST fAVDActionPointsMult (20260702 ESM) — AP pool gained per point of AGI. */
export const AP_POOL_PER_AGILITY = 10;
/**
 * HumanRace `Properties` base of AV ActionPointsRate (0x000002D8, 20260710
 * dump) — percent of Max AP regenerated per second (semantics
 * user-confirmed; see the module comment).
 */
export const AP_REGEN_RATE_PCT = 6.0;
/** PowerArmorRace's base for the same AV — the player's race swaps in PA, halving regen. */
export const AP_REGEN_RATE_PCT_POWER_ARMOR = 3.0;
/**
 * Seconds after firing stops before passive AP regen starts ticking again.
 * GMST `fDamagedAVRegenDelay` (0x000DB2AA, 20260710 dump) = 1.0 — the generic
 * "damaged actor value regen delay"; its applicability to AP specifically is
 * an INFERENCE (matches the user-observed ~1s in-game delay), pinned by a
 * golden measurement (docs/assumptions.md "VATS AP economy").
 */
export const AP_REGEN_DELAY_SEC = 1.0;

export interface ApEconomyInput {
  /** Effective per-shot VATS AP cost (after the vatsApCost OMOD fold). */
  apCost: number;
  /** Steady-state shots/sec while actively firing (reload-inclusive — see `effectiveShotsPerSecond`). */
  shotsPerSec: number;
  agility: number;
  /** Σ of active `apRegen` modifiers (decimal, 0.45 = +45%). Feeds only the informational `regenPerSec` — passive regen is excluded from the uptime math (module doc). */
  apRegenBonus: number;
  /**
   * Σ of active `apRegenFlat` modifiers — ActionPointsRate AV points, i.e.
   * percent-of-max-AP per second added onto the race base (Company Tea +10).
   * Feeds only the informational `regenPerSec` — see `apRegenBonus`.
   */
  apRegenFlatBonus?: number;
  /** Swaps the race base rate to PowerArmorRace's 3.0 (half the human 6.0). Feeds only `regenPerSec`. */
  isInPowerArmor?: boolean;
  /** Σ of active `apMax` modifiers (flat AP pool — food/magazine fortifies, Scaly Skin's penalty). */
  apMaxBonus?: number;
  /** Σ of active `apPerCrit` modifiers (flat AP per VATS crit, e.g. Conductor's instant 10). */
  apPerCrit: number;
  /**
   * Active on-crit AP HoTs (Conductor's 20 AP/s over 5s), each refresh-only —
   * kept per-source because each carries its own duration window.
   */
  critHots?: Array<{ ratePerSec: number; durationSec: number }>;
  /** Shots per crit at steady state from the crit meter (Infinity when crits never fire). */
  shotsPerCrit: number;
  /**
   * Reload window of the magazine cycle (SustainResult.reloadSec — the same
   * cycle `shotsPerSec` averages over). Passive regen ticks during it after
   * AP_REGEN_DELAY_SEC. Omitted/0 (melee, no magazine) → no reload credit.
   */
  reloadSec?: number;
  /** Mag-dump half of the same cycle (SustainResult.magDumpSec) — the cycle-averaging denominator with reloadSec. */
  magDumpSec?: number;
}

export interface ApEconomyResult {
  maxAp: number;
  /** Passive regen rate (race base + flat/percent bonuses) — informational only; does NOT feed apGainPerSec/uptime (see module doc). */
  regenPerSec: number;
  /** AP/sec restored while cycling: crit spike + HoT + the reload-window regen credit. */
  apGainPerSec: number;
  /**
   * Passive regen credited during the reload window, cycle-averaged
   * (regenPerSec × max(0, reloadSec − AP_REGEN_DELAY_SEC) / cycleSec) —
   * already folded into apGainPerSec; broken out for display/trace.
   */
  reloadRegenPerSec: number;
  drainPerSec: number;
  /** Steady-state duty cycle, clamped 0–1. 1 when gain ≥ drain (AP is never the constraint). */
  uptime: number;
  /** Time to empty a full pool at the net drain rate — only meaningful when uptime < 1. */
  secondsToEmpty?: number;
}

export function computeApEconomy(input: ApEconomyInput): ApEconomyResult {
  const maxAp = Math.max(0, AP_POOL_BASE + AP_POOL_PER_AGILITY * input.agility + (input.apMaxBonus ?? 0));
  const baseRatePct = input.isInPowerArmor ? AP_REGEN_RATE_PCT_POWER_ARMOR : AP_REGEN_RATE_PCT;
  const regenPerSec = (maxAp * (baseRatePct + (input.apRegenFlatBonus ?? 0))) / 100 * (1 + input.apRegenBonus);

  const critsPerSec =
    Number.isFinite(input.shotsPerCrit) && input.shotsPerCrit > 0 ? input.shotsPerSec / input.shotsPerCrit : 0;
  // Refresh-only crit HoTs: active fraction = min(1, duration × crits/sec).
  const critHotPerSec = (input.critHots ?? []).reduce(
    (sum, hot) => sum + hot.ratePerSec * Math.min(1, Math.max(0, hot.durationSec) * critsPerSec),
    0
  );
  // Passive regen doesn't tick during the mag dump, but DOES tick during the
  // reload window after AP_REGEN_DELAY_SEC (module doc) — credit it averaged
  // over the same magazine cycle shotsPerSec uses.
  const cycleSec = Math.max(0, input.magDumpSec ?? 0) + Math.max(0, input.reloadSec ?? 0);
  const reloadRegenPerSec =
    cycleSec > 0 ? (regenPerSec * Math.max(0, (input.reloadSec ?? 0) - AP_REGEN_DELAY_SEC)) / cycleSec : 0;
  const apGainPerSec = input.apPerCrit * critsPerSec + critHotPerSec + reloadRegenPerSec;
  const drainPerSec = Math.max(0, input.apCost) * Math.max(0, input.shotsPerSec);

  if (drainPerSec <= apGainPerSec || drainPerSec <= 0) {
    return { maxAp, regenPerSec, apGainPerSec, reloadRegenPerSec, drainPerSec, uptime: 1 };
  }

  const uptime = Math.max(0, Math.min(1, apGainPerSec / drainPerSec));
  const secondsToEmpty = maxAp / (drainPerSec - apGainPerSec);
  return { maxAp, regenPerSec, apGainPerSec, reloadRegenPerSec, drainPerSec, uptime, secondsToEmpty };
}

/**
 * Effective steady-state shots/sec for the AP drain model: the SAME
 * reload-inclusive cadence that produces `SustainResult.sustainedDps`
 * (`shotsPerMag / (magDumpSec + reloadSec)`), not the raw burst fire rate —
 * AP keeps regenerating during reload downtime even though no shots are
 * draining it, so using the burst rate would understate uptime. Falls back
 * to the raw fire rate for weapons with no magazine cycle (sustain ==
 * burst): `sustain.ts`'s own degenerate-case rule.
 */
export function effectiveShotsPerSecond(sustain: SustainResult, fireRate: number): number {
  const cycleSec = sustain.magDumpSec + sustain.reloadSec;
  if (sustain.shotsPerMag <= 0 || cycleSec <= 0) return fireRate;
  return sustain.shotsPerMag / cycleSec;
}

/** Sustained VATS DPS scaled by the AP-limited duty cycle. */
export function apLimitedDps(sustainedDps: number, uptime: number): number {
  return sustainedDps * uptime;
}
