import type { BuildState } from '@/state/build-reducer';
import {
  createDefaultEnemyConfig,
  createDefaultPlayerConfig,
  createDefaultPlayerInput,
  type GameMode,
  type PerkLoadout,
  type WeaponConfig,
} from '@/types';
import { PerkId } from '@/data/perk-ids';
import { getWeapons, maxEligibleLevel } from '@/data';

/**
 * Preset benchmark builds (issue #1) — a "Preset" picker at the top of the
 * Player column that loads one of 3 archetypes without pasting a Nukes &
 * Dragons URL. `git log --all --oneline -- '*popular-builds*'` recovered the
 * migrated `dps-todos/popular-builds.md` (deleted in 52a6957); at every
 * revision it only ever restated the same 3-scenario description that's now
 * in the issue body — no concrete perk/weapon list was ever authored. So the
 * actual perk/weapon/SPECIAL choices below are AGENT-AUTHORED from the live
 * dataset (`src/data/live/perks.ts`'s registry, `getWeapons('live')`), not
 * recovered from history — every pick is a judgment call pending user
 * review, same as any `overrides/*` entry that lacks a verified-in-ESM
 * source comment would be flagged for. Swap perks/mods/SPECIAL freely; nothing
 * here is asserted as "correct," only "a reasonable, budget-legal starting
 * point for the named playstyle."
 *
 * All 3 share the same weapon (The Fixer, `CombatRifle_Fixer`) on purpose —
 * it's the single most iconic FO76 all-rounder rifle (good base damage,
 * reasonable VATS AP cost, real in-game god-roll culture), so the DPS delta
 * between presets reads as pure playstyle/perk difference rather than a
 * weapon-choice confound. Every perk id, SPECIAL allocation, and OMOD id is
 * checked against the live dataset by
 * `src/data/__tests__/presets.test.ts` (fails loudly on drift after a future
 * `bun run extract`, same guard shape as the weapon-vetting roster test).
 */

const FIXER_WEAPON_ID = 'CombatRifle_Fixer';

/** Regular (SPECIAL-slotted) perks shared by all 3 archetypes: generic ranged DPS. */
function sharedCorePerks(centerMasochistRank: number, concentratedFireRank: number): PerkLoadout[] {
  return [
    // Center Masochist (Perception): flat +% ranged damage to the torso —
    // the single highest-value SPECIAL-agnostic ranged DPS card in the
    // registry, so every archetype takes it.
    { perkId: PerkId.CenterMasochist, rank: centerMasochistRank },
    // Concentrated Fire (Perception): +%accuracy/damage per shot while
    // focusing the same target — free DPS for any build that stays on
    // target, which every one of these 3 archetypes does.
    { perkId: PerkId.ConcentratedFire, rank: concentratedFireRank },
    // Awareness (Perception, single-rank): VATS accuracy from PER — cheap,
    // and every archetype uses VATS at least "when convenient."
    { perkId: PerkId.Awareness, rank: 1 },
  ];
}

function fixerWeaponConfig(
  mods: Record<string, string | null>,
  legendaryEffects: (string | null)[],
): WeaponConfig {
  return { weaponId: FIXER_WEAPON_ID, mods, legendaryEffects };
}

/**
 * Same "select the best obtainable level" convention as `weapon/select` in
 * build-reducer.ts, computed live so a future re-extraction that shifts the
 * Fixer's eligible levels can't silently desync the preset.
 */
function fixerItemLevel(mode: GameMode): number {
  return maxEligibleLevel(getWeapons(mode)[FIXER_WEAPON_ID]);
}

export interface BuildPreset {
  id: string;
  name: string;
  /** One-line description shown under the preset's picker option. */
  description: string;
  build: (mode: GameMode) => BuildState;
}

/**
 * 1. Comfort / Sustained — a well-rounded day-to-day build: manual aim, VATS
 * "when convenient" (not optimized around it), moderate crit rate. Modeled
 * as realistic-but-competent play rather than frame-perfect execution: hit
 * rates are set below 100% (90% free-aim, 85% VATS, 70% weakpoint) instead
 * of the app's optimistic default, and only 2 of the Fixer's 4 legendary
 * star slots are filled (Anti-Armor + Vital) — a solid, attainable loadout,
 * not a fully min-maxed 4-star god roll. LCK 15 + Legendary Luck (effective
 * 20) + Critical Savvy 3, with NO Limit-Breaking armor (unlike #2/#3 — this
 * build isn't otherwise gearing around VATS), lands almost exactly on the
 * issue's own "~33% crit" target under `crit-meter.ts`'s real formula
 * (spot-checked by hand, not pinned by a test).
 */
function buildComfortSustained(mode: GameMode): BuildState {
  const player = createDefaultPlayerConfig();
  player.weapon = fixerWeaponConfig(
    {
      ap_gun_Receiver: 'mod_CombatRifle_Receiver_Damage-Auto', // Powerful Automatic Receiver — solid all-purpose fire rate + damage
      ap_gun_Barrel: 'mod_CombatRifle_barrel_long_Base',
      ap_gun_Grip: 'mod_CombatRifle_grip_Base',
      ap_gun_Mag: 'mod_CombatRifle_Magazine_Ammo', // bigger mag = fewer reloads, "sustained" flavor
      ap_gun_Muzzle: 'mod_CombatRifle_muzzle_Brake_Base', // recoil control for manual aim
      ap_gun_Scope: 'mod_CombatRifle_SCOPE_Reflex_Base',
    },
    ['mod_Legendary_Weapon1_AntiArmor', 'mod_Legendary_Weapon2_DmgCrits', null, null],
  );
  player.itemLevel = fixerItemLevel(mode);
  player.perks = [
    ...sharedCorePerks(2, 2),
    // Better Criticals (Luck): crit damage still matters even at a moderate
    // crit rate — cheap rank 2 investment.
    { perkId: PerkId.BetterCriticals, rank: 2 },
    // Critical Savvy (Luck, max rank 3): crit-meter efficiency — see the
    // function doc comment for how this lands the ~33% crit target.
    { perkId: PerkId.CriticalSavvy, rank: 3 },
    // Adrenaline (Agility, single-rank): +damage per kill in a sustained
    // fight — fits "day-to-day" combat better than a burst-only pick.
    { perkId: PerkId.Adrenaline, rank: 1 },
    // Action Boy/Girl (Agility): moderate AP regen for the occasional VATS
    // dip, not maxed since this build isn't VATS-spam-oriented.
    { perkId: PerkId.ActionBoyGirl, rank: 2 },
  ];
  player.legendaryPerks = [
    // Ammo Factory: ammo economy — "sustained" play runs out of ammo more
    // than it runs out of DPS ideas.
    { perkId: PerkId.AmmoFactory, rank: 2 },
    // Legendary Luck (max rank 4): pushes effective LCK to 20 — see the
    // function doc comment for the ~33% crit-rate reasoning.
    { perkId: PerkId.LegendaryLuck, rank: 4 },
  ];
  player.conditions = {
    ...createDefaultPlayerInput(),
    // SPECIAL: well-rounded rather than glass-cannon — 48 of the 56-point
    // pool spent, survivability (END) and carry weight (STR) both get real
    // investment instead of being dumped to 1. LCK is the one stat pushed
    // to the 15 cap (see the function doc comment's crit-rate reasoning).
    strength: 6,
    perception: 8,
    endurance: 9,
    charisma: 2,
    intelligence: 2,
    agility: 6,
    luck: 15,
    isSneaking: false,
    isAimingAtWeakpoint: false,
    // Realistic-play hit rates, not the optimistic 100% default — this is
    // the "typical player," not frame-perfect execution.
    hitRatePct: 90,
    vatsHitRatePct: 85,
    bodyPartHitRatePct: 70,
    killStreak: 3,
  };
  return {
    player,
    enemy: createDefaultEnemyConfig(),
    buildName: 'Comfort / Sustained',
    view: { emphasized: null, breakdownOpen: false },
  };
}

/**
 * 2. Min-maxed VATS — maximised VATS crit, weakpoints targeted 100% of the
 * time, max fire rate. PER and LCK are both maxed to 15 (VATS
 * accuracy/weakpoint theme + the crit-meter's LCK-keyed fill curve,
 * `crit-meter.ts`), STR/END/CHA/INT are dumped to 1 (glass cannon), and hit
 * rates are set to 100% (frame-perfect optimal-play assumption, matching
 * "weakpoints 100% of the time"). To land the issue's own "~50% crit" target
 * (verified against `crit-meter.ts`'s real fill/consumption formula — LCK
 * alone tops out around 33% even at 15, since the LCK→fill curve caps at 45
 * by LCK 100, well under Critical Savvy 3's 55%-of-meter cost), this also
 * takes the Legendary Luck SPECIAL card (effective LCK 15+5=20, raising the
 * crit-fill curve) and a full 5-piece Limit-Breaking armor stack (−50%
 * crit-meter cost) — the classic in-game "every-hit-crits" VATS combo. 20
 * LCK + Critical Savvy 3 + 5x Limit-Breaking computes to exactly a 0.5
 * steady-state crit rate under the current formula (spot-checked by hand,
 * not pinned by a test — a future formula tweak changing this is fine, not
 * a regression).
 */
function buildMinMaxedVats(mode: GameMode): BuildState {
  const player = createDefaultPlayerConfig();
  player.weapon = fixerWeaponConfig(
    {
      ap_gun_Receiver: 'mod_CombatRifle_Receiver_Damage-Auto', // max fire rate + damage
      ap_gun_Barrel: 'mod_CombatRifle_Barrel_Long_Recoil', // recoil control to keep landing shots at full-auto
      ap_gun_Grip: 'mod_CombatRifle_Grip_Recoil',
      ap_gun_Mag: 'mod_CombatRifle_Magazine_ArmorPen', // pure damage, no reload-comfort tradeoff
      ap_gun_Muzzle: 'mod_CombatRifle_muzzle_Compensator_Base', // VATS accuracy/recoil
      ap_gun_Scope: 'mod_CombatRifle_SCOPE_Reflex_Base',
    },
    [
      'mod_Legendary_Weapon1_AntiArmor', // Anti-Armor
      'mod_Legendary_Weapon2_DmgCrits', // Vital
      'mod_Legendary_Weapon3_VATSCostAP', // V.A.T.S. Optimized — sustains VATS spam
      null,
    ],
  );
  player.itemLevel = fixerItemLevel(mode);
  player.perks = [
    ...sharedCorePerks(3, 3),
    // Critical Savvy (Luck, max rank 3): crits only consume 55% of the
    // meter — core to hitting a high steady-state VATS crit rate
    // (`crit-meter.ts`'s consumption/fill economy).
    { perkId: PerkId.CriticalSavvy, rank: 3 },
    // Better Criticals (Luck, max rank 3): +100% VATS crit damage.
    { perkId: PerkId.BetterCriticals, rank: 3 },
    // Grim Reaper's Sprint (Luck, single-rank): AP restore on a VATS kill —
    // sustains the "max fire rate" VATS loop.
    { perkId: PerkId.GrimReapersSprint, rank: 1 },
    { perkId: PerkId.Adrenaline, rank: 1 },
    // Action Boy/Girl (Agility, max rank 3): max AP regen for sustained VATS.
    { perkId: PerkId.ActionBoyGirl, rank: 3 },
    // Gun Fu (Agility, max rank 3): VATS kill → target swap with a stacking
    // damage bonus — a core "min-maxed VATS" DPS card.
    { perkId: PerkId.GunFu, rank: 3 },
  ];
  player.legendaryPerks = [
    // Legendary Luck (max rank 4, +5 stat/perk-points on top of base): the
    // other half of the ~50% crit-rate combo — see the function doc comment.
    { perkId: PerkId.LegendaryLuck, rank: 4 },
  ];
  // Full 5-piece Limit-Breaking armor stack (−50% crit-meter cost) — see the
  // function doc comment for why this is needed to reach ~50% crit.
  player.armorEffects = { mod_Legendary_Armor4_LimitBreak: 5 };
  player.conditions = {
    ...createDefaultPlayerInput(),
    // Glass cannon: PER and LCK maxed (VATS accuracy/weakpoint + crit-meter
    // fill), everything else dumped to the 1-point floor. 46 of the
    // 56-point pool spent.
    strength: 1,
    perception: 15,
    endurance: 1,
    charisma: 1,
    intelligence: 1,
    agility: 12,
    luck: 15,
    isSneaking: false,
    isAimingAtWeakpoint: true,
    hitRatePct: 100,
    vatsHitRatePct: 100,
    bodyPartHitRatePct: 100,
    // Max Adrenaline stacks (10) — steady-state optimal-play assumption for
    // a benchmark build, same convention as the engine's other steady-state
    // stack defaults (bulletStormStacks/onslaughtStacks = -1 "auto").
    killStreak: 10,
  };
  return {
    player,
    enemy: createDefaultEnemyConfig(),
    buildName: 'Min-maxed VATS',
    view: { emphasized: null, breakdownOpen: false },
  };
}

/**
 * 3. Min-maxed VATS + Sneak — same core VATS engine as #2, but sneaking:
 * `isSneaking: true` triggers the game's own base sneak-attack multiplier
 * on the weapon (`weapon.sneakAttackMult`, 2.75x for the Fixer — the "+100%
 * base sneak bonus" the issue describes is this intrinsic mechanic, not a
 * perk), stacked with a suppressed muzzle + the sneak-damage perk trio
 * (Sneak, Covert Operative, Mister Sandman). Action Boy/Girl is dropped
 * from #2's loadout to make Agility-budget room for the sneak perks
 * (13-point cost, still under the 15-point per-stat cap). Carries the same
 * Legendary Luck + 5-piece Limit-Breaking combo as #2, for the same ~50%
 * crit-rate reason (see that function's doc comment).
 */
function buildMinMaxedVatsSneak(mode: GameMode): BuildState {
  const player = createDefaultPlayerConfig();
  player.weapon = fixerWeaponConfig(
    {
      ap_gun_Receiver: 'mod_CombatRifle_Receiver_Damage-Auto',
      ap_gun_Barrel: 'mod_CombatRifle_Barrel_Long_Recoil',
      ap_gun_Grip: 'mod_CombatRifle_Grip_Recoil',
      ap_gun_Mag: 'mod_CombatRifle_Magazine_ArmorPen',
      ap_gun_Muzzle: 'mod_CombatRifle_muzzle_Suppressor_Base', // stays undetected + pairs with Mister Sandman
      ap_gun_Scope: 'mod_CombatRifle_SCOPE_Reflex_Base',
    },
    [
      'mod_Legendary_Weapon1_DamageFirstBlood', // Instigating — 2x damage vs a full-health target, classic sneak-opener pairing
      'mod_Legendary_Weapon2_DmgCrits', // Vital
      'mod_Legendary_Weapon3_VATSCostAP', // V.A.T.S. Optimized
      null,
    ],
  );
  player.itemLevel = fixerItemLevel(mode);
  player.perks = [
    ...sharedCorePerks(3, 3),
    { perkId: PerkId.CriticalSavvy, rank: 3 },
    { perkId: PerkId.BetterCriticals, rank: 3 },
    { perkId: PerkId.GrimReapersSprint, rank: 1 },
    { perkId: PerkId.Adrenaline, rank: 1 },
    { perkId: PerkId.GunFu, rank: 3 },
    // Sneak (Agility, max rank 3): 75% harder to detect while sneaking —
    // stay undetected for the sneak-attack bonus to keep applying.
    { perkId: PerkId.Sneak, rank: 3 },
    // Covert Operative (Agility, max rank 3): +50% ranged sneak attack
    // damage — the single highest-value sneak DPS card.
    { perkId: PerkId.CovertOperative, rank: 3 },
    // Mister Sandman (Agility, max rank 2): +100% sneak damage with
    // silenced weapons — pairs with the Suppressor muzzle above.
    { perkId: PerkId.MisterSandman, rank: 2 },
  ];
  player.legendaryPerks = [
    // Follow Through (max rank 4): a ranged sneak hit buffs damage to that
    // target by 40% for 10s — rewards the sneak-opener → follow-up-shots
    // pattern this archetype plays around.
    { perkId: PerkId.FollowThrough, rank: 4 },
    // Legendary Luck (max rank 4): see buildMinMaxedVats's doc comment.
    { perkId: PerkId.LegendaryLuck, rank: 4 },
  ];
  player.armorEffects = { mod_Legendary_Armor4_LimitBreak: 5 };
  player.conditions = {
    ...createDefaultPlayerInput(),
    strength: 1,
    perception: 12,
    endurance: 1,
    charisma: 1,
    intelligence: 1,
    agility: 15,
    luck: 15,
    isSneaking: true,
    isAimingAtWeakpoint: true,
    hitRatePct: 100,
    vatsHitRatePct: 100,
    bodyPartHitRatePct: 100,
    // Lower than #2's 10: a sneak-opener playstyle resets to an undetected
    // state more often than it holds one long kill streak.
    killStreak: 5,
  };
  return {
    player,
    enemy: createDefaultEnemyConfig(),
    buildName: 'Min-maxed VATS + Sneak',
    view: { emphasized: null, breakdownOpen: false },
  };
}

export const BUILD_PRESETS: readonly BuildPreset[] = [
  {
    id: 'comfort-sustained',
    name: 'Comfort / Sustained',
    description: 'Well-rounded day-to-day build — manual aim, VATS when convenient, ~33% crit.',
    build: buildComfortSustained,
  },
  {
    id: 'vats-minmax',
    name: 'Min-maxed VATS',
    description: 'Maximised VATS crit, 100% weakpoints, max fire rate.',
    build: buildMinMaxedVats,
  },
  {
    id: 'vats-minmax-sneak',
    name: 'Min-maxed VATS + Sneak',
    description: 'Min-maxed VATS, sneaking — full base sneak bonus on undetected hits.',
    build: buildMinMaxedVatsSneak,
  },
];
