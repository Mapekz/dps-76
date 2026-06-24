import type { Weapon } from '@/types';

/**
 * MVP weapon set — 8 weapons, no mods.
 *
 * Base damage is derived from universal curve components at runtime via getBaseDamage().
 * Fire rate is derived by getFireRate() from the animation parameters below.
 *
 * Semi-auto animDelaySec values for Plasma Gun and Single Action Revolver are currently
 * stubbed at 0.5 s.  See todos/fire-rate.md for confirmed values needed.
 */
export const weapons: Record<string, Weapon> = {

  // ── Heavy Guns ─────────────────────────────────────────────────────────────

  gatling_plasma: {
    id: 'gatling_plasma',
    name: 'Gatling Plasma',
    weaponClass: 'heavy',
    damageType: 'energy',       // primary type for perk routing
    components: [
      { damageType: 'ballistic', tier: 12, levelCap: 50 },  // +28 @ lvl50
      { damageType: 'energy',    tier: 12, levelCap: 50 },  // +28 @ lvl50 → 56 total
    ],
    isAutomatic: true,
    isPhysical: false,          // energy weapon — no 0.8248× Speed mult
    // speed: 1.0               // default
    // animDurationSec: 0.11    // default auto; FR ≈ 1.0 / 0.11 ≈ 9.09/s
  },

  lmg: {
    id: 'lmg',
    name: 'Light Machine Gun',
    weaponClass: 'heavy',
    damageType: 'ballistic',
    components: [
      { damageType: 'ballistic', tier: 16, levelCap: 50 },  // 47 @ lvl50
    ],
    isAutomatic: true,
    isPhysical: true,           // ballistic — applies 0.8248× Speed; FR ≈ 0.8248/0.11 ≈ 7.5/s
    // animDurationSec: 0.11    // default auto
  },

  // ── Rifles ─────────────────────────────────────────────────────────────────

  the_fixer: {
    id: 'the_fixer',
    name: 'The Fixer',
    weaponClass: 'rifle',
    damageType: 'ballistic',
    components: [
      { damageType: 'ballistic', tier: 24, levelCap: 50 },  // 103 @ lvl50
    ],
    // TODO (todos/fire-rate.md): confirm auto vs semi at default receiver.
    // Stubbed as automatic (Handmade Rifle base — automatic receiver).
    isAutomatic: true,
    isPhysical: true,           // FR ≈ 0.8248/0.11 ≈ 7.5/s
    // animDurationSec: 0.11    // default auto
  },

  plasma_gun: {
    id: 'plasma_gun',
    name: 'Plasma Gun',
    weaponClass: 'rifle',
    damageType: 'energy',       // energy primary; phys component retained for DR/ER split later
    components: [
      { damageType: 'ballistic', tier: 16, levelCap: 45 },  // 42 @ lvl45 cap
      { damageType: 'energy',    tier: 16, levelCap: 45 },  // 42 @ lvl45 cap → 84 total
    ],
    // TODO (todos/fire-rate.md): confirm animDelaySec.  0.5 s is a placeholder.
    isAutomatic: false,
    isPhysical: false,          // energy weapon — no 0.8248× Speed mult; FR ≈ 1.0/0.5 = 2.0/s stub
    animDelaySec: 0.5,
  },

  // ── Pistols ────────────────────────────────────────────────────────────────

  single_action_revolver: {
    id: 'single_action_revolver',
    name: 'Single Action Revolver',
    weaponClass: 'pistol',
    damageType: 'ballistic',
    components: [
      { damageType: 'ballistic', tier: 35, levelCap: 50 },  // 218 @ lvl50
    ],
    // TODO (todos/fire-rate.md): confirm animDelaySec.  0.5 s is a placeholder.
    isAutomatic: false,
    isPhysical: true,           // FR ≈ 0.8248/0.5 ≈ 1.65/s stub
    animDelaySec: 0.5,
  },

  // ── Melee — Unarmed ────────────────────────────────────────────────────────

  deathclaw_gauntlet: {
    id: 'deathclaw_gauntlet',
    name: 'Deathclaw Gauntlet',
    weaponClass: 'unarmed',
    damageType: 'ballistic',
    components: [
      { damageType: 'ballistic', tier: 32, levelCap: 50 },  // 182 @ lvl50
    ],
    // TODO (todos/fire-rate.md): real animDelaySec; getFireRate stubs at 1.0/s for melee
    isAutomatic: false,
    isPhysical: true,
    animDelaySec: 1.0,          // placeholder — getFireRate overrides to 1.0 for unarmed
  },

  // ── Melee — 2H ─────────────────────────────────────────────────────────────

  super_sledge: {
    id: 'super_sledge',
    name: 'Super Sledge',
    weaponClass: 'melee',
    damageType: 'ballistic',
    components: [
      { damageType: 'ballistic', tier: 39, levelCap: 50 },  // 271 @ lvl50
    ],
    // TODO (todos/fire-rate.md): real animDelaySec; getFireRate stubs at 1.0/s for melee
    isAutomatic: false,
    isPhysical: true,
    animDelaySec: 1.0,          // placeholder — getFireRate overrides to 1.0 for melee
  },

  // ── Melee — 1H ─────────────────────────────────────────────────────────────

  pickaxe: {
    id: 'pickaxe',
    name: 'Pickaxe',
    weaponClass: 'melee',
    damageType: 'ballistic',
    components: [
      { damageType: 'ballistic', tier: 36, levelCap: 45 },  // 204 @ lvl45 cap
    ],
    // TODO (todos/fire-rate.md): real animDelaySec; getFireRate stubs at 1.0/s for melee
    isAutomatic: false,
    isPhysical: true,
    animDelaySec: 1.0,          // placeholder — getFireRate overrides to 1.0 for melee
  },
};
