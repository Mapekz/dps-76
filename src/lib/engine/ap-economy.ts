import type { SustainResult } from './sustain';

/**
 * Steady-state VATS AP economy (docs/assumptions.md "VATS AP economy &
 * manual-aim hit rate").
 *
 * Every VATS shot costs AP (WEAP "Action Point Cost" — Weapon.apCost); AP
 * regenerates over time and VATS crits can restore extra AP (Conductor's).
 * When the drain rate exceeds the gain rate, the player cannot sustain
 * continuous VATS fire forever: the pool-cycle model below alternates a
 * firing burst with a forced regen pause, `uptime` is the steady-state
 * fraction of time spent in the burst, and `apLimitedDps` is the sustained
 * VATS DPS scaled by that duty cycle.
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
 * On-crit AP HoTs (Conductor's 20 AP/s over 5s) are REFRESH-ONLY: a new crit
 * dispels the prior instance and restarts the window instead of stacking.
 * ESM-proven (20260710 dump) on SPEL
 * `Legendary_Weapon_ConductorsPlayerRestoreSpell` (0x007ACB0D)'s HoT effect
 * entry, MGEF `Legendary_Weapon_ConductorsApplyRestorePlayerAPPerkEffect`
 * (0x007ACB09, magnitude 20 / duration 5, Archetype "Value Modifier" on AV
 * `ActionPoints` 0x000002D5): Magic Effect Data Flags = `0x100` = "Dispel
 * with Keywords", Keywords = [KYWD `ConductorsDispelPlayerEffectKeyword`
 * (0x007B71D3, Type "Dispel Effect")] whose Notes field reads verbatim
 * "used ... to prevent Owner & Recipients from stacking AP & Health Regen
 * effects" — confirms REFRESH (dispel-and-reapply), not a conditional-skip
 * gate. The parallel Health HoT MGEF
 * (`...ApplyRestorePlayerHealthPerkEffect`, 0x007ACB08) carries the same
 * flag/keyword pair. The spell's two instant effects (MGEF
 * `RestoreActionPoints` 0x00047668 magnitude 10, `RestoreHealthGeneric`
 * 0x00023735 magnitude 10, both duration 0) are plain one-shot Value
 * Modifiers with no stacking semantics to check. This matches the in-game
 * 2026-07-15 confirmation ("a new crit restarts the window") exactly — ESM
 * and observation agree, no indistinguishability caveat needed. Mirrors the
 * dotDamage convention. Steady-state term is rate × min(1, durationSec ×
 * critsPerSec) — fast crits saturate at the raw rate, slow crits (interval
 * ≥ duration) recover the full rate × duration per crit.
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
 * Pool-cycle uptime (ADOPTED 2026-07-29, user decision — supersedes the
 * 2026-07-15 gain/drain heuristic): an AP-constrained build alternates a
 * firing BURST — the pool drains to empty over `burstSec = maxAp /
 * (drainPerSec − apGainPerSec)` (the existing `secondsToEmpty`) — with a
 * forced PAUSE, `pauseSec = regenDelaySec + maxAp / regenPerSec`: exit VATS,
 * wait the post-drain delay, then refill the FULL pool at full passive
 * `regenPerSec` (a full refill is optimal play — it amortizes the fixed
 * delay over the largest possible next burst). Steady state
 * `uptime = burstSec / (burstSec + pauseSec)`. Conductor's HoT tail that
 * extends past the burst into the pause window is deliberately ignored
 * (conservative: slightly understates gain during the pause; small at
 * typical duration/pause lengths). Issue #71's golden pins this form once
 * measured. The pause window is no longer modeled as idle downtime — the
 * caller blends in a free-aim fallback rate via `apLimitedDps`.
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
 * Governed by GMST `fDamagedAPRegenDelay` = 1.0 — the AP-SPECIFIC delay
 * (USER-CONFIRMED 2026-07-30), not the generic `fDamagedAVRegenDelay`. It has
 * NO ESM record: the value is FO76 exe-baked, published in the "Fallout 76
 * game settings" `EXE Game Settings (2020)` table. Pinned by a golden
 * measurement (docs/assumptions.md "VATS AP economy").
 *
 * CAVEAT for extraction: because the governing GMST is exe-only,
 * `extract-constants.ts` reads `fDamagedAVRegenDelay` (0x000DB2AA, ESM = 1.0)
 * as a PROXY. Both read 1.0 today. If a future dump diverges them, the proxy
 * is WRONG and must be dropped in favour of this hardcoded 1.0 — do not
 * follow the AV record.
 */
export const AP_REGEN_DELAY_SEC = 1.0;

/**
 * ESM-extracted AP economy scalars — `getActionPointConstants` (`@/data`)
 * resolves the live value via `extract-constants.ts`; real callers
 * (`scenarios.ts`, threaded from `resolveLoadout`) pass it through
 * `ApEconomyInput.constants`. `DEFAULT_ACTION_POINT_CONSTANTS` is the fallback
 * for callers without a mode (tests) — mirrors `mitigation.ts`'s
 * `DEFAULT_MITIGATION_CONSTANTS`.
 */
export interface ActionPointConstants {
  poolBase: number;
  poolPerAgility: number;
  regenDelaySec: number;
  regenRatePct: number;
  regenRatePctPowerArmor: number;
}

/** Pre-extraction hardcodes — see the individual `AP_*` consts' own doc comments above. */
export const DEFAULT_ACTION_POINT_CONSTANTS: ActionPointConstants = {
  poolBase: AP_POOL_BASE,
  poolPerAgility: AP_POOL_PER_AGILITY,
  regenDelaySec: AP_REGEN_DELAY_SEC,
  regenRatePct: AP_REGEN_RATE_PCT,
  regenRatePctPowerArmor: AP_REGEN_RATE_PCT_POWER_ARMOR,
};

export interface ApEconomyInput {
  /** Effective per-shot VATS AP cost (after the vatsApCost OMOD fold). */
  apCost: number;
  /** Steady-state shots/sec while actively firing (reload-inclusive — see `effectiveShotsPerSecond`). */
  shotsPerSec: number;
  agility: number;
  /** Σ of active `apRegen` modifiers (decimal, 0.45 = +45%). Feeds `regenPerSec`, which drives both the reload-window gain credit and the pool-cycle pause length (module doc). */
  apRegenBonus: number;
  /**
   * Σ of active `apRegenFlat` modifiers — ActionPointsRate AV points, i.e.
   * percent-of-max-AP per second added onto the race base (Company Tea +10).
   * Feeds `regenPerSec` — see `apRegenBonus`.
   */
  apRegenFlatBonus?: number;
  /** Swaps the race base rate to PowerArmorRace's 3.0 (half the human 6.0). Feeds `regenPerSec`. */
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
  /** ESM-extracted AP economy scalars — defaults to `DEFAULT_ACTION_POINT_CONSTANTS` (tests, no-mode callers); see that const's doc comment. */
  constants?: ActionPointConstants;
}

export interface ApEconomyResult {
  maxAp: number;
  /**
   * Passive regen rate (race base + flat/percent bonuses). Does NOT tick
   * during the mag dump (`apGainPerSec` excludes it there — module doc), but
   * feeds both `reloadRegenPerSec` and the pool-cycle `pauseSec`/`uptime`
   * terms.
   */
  regenPerSec: number;
  /** AP/sec restored while cycling: crit spike + HoT + the reload-window regen credit. */
  apGainPerSec: number;
  /**
   * Instant `apPerCrit` restore, steady-state (apPerCrit × crits/sec) —
   * already folded into apGainPerSec; broken out for display.
   */
  critSpikePerSec: number;
  /**
   * Refresh-only on-crit AP HoT rate, steady-state (module doc's saturating
   * min(1, duration × crits/sec) term) — already folded into apGainPerSec;
   * broken out for display.
   */
  critHotPerSec: number;
  /**
   * Passive regen credited during the reload window, cycle-averaged
   * (regenPerSec × max(0, reloadSec − AP_REGEN_DELAY_SEC) / cycleSec) —
   * already folded into apGainPerSec; broken out for display/trace.
   */
  reloadRegenPerSec: number;
  drainPerSec: number;
  /** Steady-state duty cycle, clamped 0–1. 1 when gain ≥ drain (AP is never the constraint). */
  uptime: number;
  /** Burst length: time to empty a full pool at the net drain rate — only present when uptime < 1. */
  secondsToEmpty?: number;
  /**
   * Forced pause length after the pool empties: `regenDelaySec + maxAp /
   * regenPerSec` (exit VATS, wait the delay, refill the full pool at full
   * passive regen — module doc "Pool-cycle uptime"). Only present when
   * uptime < 1; absent (not just 0) in the `regenPerSec <= 0` fallback,
   * where no pause is credited (see `computeApEconomy`).
   */
  pauseSec?: number;
}

export function computeApEconomy(input: ApEconomyInput): ApEconomyResult {
  const constants = input.constants ?? DEFAULT_ACTION_POINT_CONSTANTS;
  const maxAp = Math.max(
    0,
    constants.poolBase + constants.poolPerAgility * input.agility + (input.apMaxBonus ?? 0),
  );
  const baseRatePct = input.isInPowerArmor
    ? constants.regenRatePctPowerArmor
    : constants.regenRatePct;
  const regenPerSec =
    ((maxAp * (baseRatePct + (input.apRegenFlatBonus ?? 0))) / 100) * (1 + input.apRegenBonus);

  const critsPerSec =
    Number.isFinite(input.shotsPerCrit) && input.shotsPerCrit > 0
      ? input.shotsPerSec / input.shotsPerCrit
      : 0;
  // Refresh-only crit HoTs: active fraction = min(1, duration × crits/sec).
  const critHotPerSec = (input.critHots ?? []).reduce(
    (sum, hot) => sum + hot.ratePerSec * Math.min(1, Math.max(0, hot.durationSec) * critsPerSec),
    0,
  );
  // Passive regen doesn't tick during the mag dump, but DOES tick during the
  // reload window after AP_REGEN_DELAY_SEC (module doc) — credit it averaged
  // over the same magazine cycle shotsPerSec uses.
  const cycleSec = Math.max(0, input.magDumpSec ?? 0) + Math.max(0, input.reloadSec ?? 0);
  const reloadRegenPerSec =
    cycleSec > 0
      ? (regenPerSec * Math.max(0, (input.reloadSec ?? 0) - constants.regenDelaySec)) / cycleSec
      : 0;
  const critSpikePerSec = input.apPerCrit * critsPerSec;
  const apGainPerSec = critSpikePerSec + critHotPerSec + reloadRegenPerSec;
  const drainPerSec = Math.max(0, input.apCost) * Math.max(0, input.shotsPerSec);

  if (drainPerSec <= apGainPerSec || drainPerSec <= 0) {
    return {
      maxAp,
      regenPerSec,
      apGainPerSec,
      critSpikePerSec,
      critHotPerSec,
      reloadRegenPerSec,
      drainPerSec,
      uptime: 1,
    };
  }

  // Pool-cycle model (module doc "Pool-cycle uptime"): burst drains the pool
  // to empty, then a forced pause (post-drain delay + full-pool refill at
  // regenPerSec) before the next burst starts.
  const burstSec = maxAp / (drainPerSec - apGainPerSec);
  if (regenPerSec <= 0) {
    // Can't happen in practice (every race base % > 0) — guards the
    // division below. Falls back to the old gain/drain clamp with no pause
    // credited rather than dividing by zero.
    const uptime = Math.max(0, Math.min(1, apGainPerSec / drainPerSec));
    return {
      maxAp,
      regenPerSec,
      apGainPerSec,
      critSpikePerSec,
      critHotPerSec,
      reloadRegenPerSec,
      drainPerSec,
      uptime,
      secondsToEmpty: burstSec,
    };
  }
  const pauseSec = constants.regenDelaySec + maxAp / regenPerSec;
  const uptime = burstSec / (burstSec + pauseSec);
  return {
    maxAp,
    regenPerSec,
    apGainPerSec,
    critSpikePerSec,
    critHotPerSec,
    reloadRegenPerSec,
    drainPerSec,
    uptime,
    secondsToEmpty: burstSec,
    pauseSec,
  };
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

/**
 * AP-duty-cycle DPS blend (docs/assumptions.md "VATS canonical DPS"): fraction
 * `uptime` of wall-clock time nets VATS sustained DPS, fraction `1 − uptime`
 * nets the free-aim fallback rate (the player free-aims while the pool refills).
 */
export function apLimitedDps(
  sustainedDps: number,
  uptime: number,
  downtimeFallbackDps = 0,
): number {
  return sustainedDps * uptime + downtimeFallbackDps * (1 - uptime);
}
