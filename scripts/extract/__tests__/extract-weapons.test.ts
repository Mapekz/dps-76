import { describe, it, expect } from 'vitest';
import type { EsmClient, EsmRecord } from '../esm-client';
import { chaseExplosion, isExcludedWeaponEdid, toGeneratedWeapon } from '../extract-weapons';
import { isExcludedOmodEdid } from '../extract-omods';
import fixer from './fixtures/weap-fixer.json';
import gatlingPlasma from './fixtures/weap-gatling-plasma.json';
import mg42 from './fixtures/weap-mg42.json';
import shishkebab from './fixtures/weap-shishkebab.json';
import weapFatman from './fixtures/weap-fatman.json';
import ammoFatmanMiniNuke from './fixtures/ammo-fatman-mininuke.json';
import projFatman from './fixtures/proj-fatman.json';
import explFatman from './fixtures/expl-fatman.json';
import weapGammaGun from './fixtures/weap-gammagun.json';
import ammoGammaCell from './fixtures/ammo-gammacell.json';
import projGammaGun from './fixtures/proj-gammagun.json';
import explGammaGun from './fixtures/expl-gammagun.json';
import ammoPlasmaCartridge from './fixtures/ammo-plasma-cartridge.json';
import projPlasmaLarge from './fixtures/proj-plasma-large.json';
import ammo2mmEc from './fixtures/ammo-2mmec.json';
import projGaussRifle from './fixtures/proj-gauss-rifle.json';
import explGaussImpact from './fixtures/expl-gauss-impact.json';

// Fixtures are verbatim `esm -p get <formid> --json` output (20260702 ESM;
// explosion-chain fixtures from the 20260710 dump).
// These tests pin the WEAP → GeneratedWeapon normalization semantics.

const KNOWN_EDIDS: Record<string, string> = {
  '0x00060A81': 'dtEnergy',
  '0x00060A82': 'dtFire',
  '0x00060A85': 'dtRadiationExposure',
  '0x0004A0A1': 'WeaponTypeRifle',
  '0x0004A0A5': 'WeaponTypeHeavyGun',
};

const CHAIN_RECORDS: Record<string, unknown> = {
  '0x000E6B2E': ammoFatmanMiniNuke,
  '0x000E6B2F': projFatman,
  '0x001A7FF2': explFatman,
  '0x000DF279': ammoGammaCell,
  '0x000F0DDC': projGammaGun,
  '0x000F17EC': explGammaGun,
  '0x0001DBB7': ammoPlasmaCartridge,
  '0x00125C9B': projPlasmaLarge,
  '0x0018ABDF': ammo2mmEc,
  '0x001CC149': projGaussRifle,
  '0x0022E05D': explGaussImpact,
};

const stubClient = {
  async resolveEdid(formId: string): Promise<string> {
    return KNOWN_EDIDS[formId] ?? `kw_${formId}`;
  },
  async get(formId: string): Promise<EsmRecord> {
    const record = CHAIN_RECORDS[formId];
    if (!record) throw new Error(`stub: no record for ${formId}`);
    return record as EsmRecord;
  },
} as unknown as EsmClient;

describe('toGeneratedWeapon', () => {
  it('Fixer: single ballistic component from the main curve, crit/sneak/fire-rate fields', async () => {
    const w = await toGeneratedWeapon(stubClient, fixer as unknown as EsmRecord, []);
    expect(w.id).toBe('CombatRifle_Fixer');
    expect(w.name).toBe('The Fixer');
    expect(w.components).toHaveLength(1);
    expect(w.components[0]).toMatchObject({ damageType: 'ballistic', tier: 24, amount: 33 });
    expect(w.components[0].curve?.at(-1)).toEqual({ x: 50, y: 103 });
    expect(w.critDamageMult).toBe(2.0);
    expect(w.sneakAttackMult).toBe(2.75);
    expect(w.attackDelaySec).toBeCloseTo(0.28, 5);
    expect(w.projectileCount).toBe(1);
    expect(w.templateModFormIds.length).toBeGreaterThan(0);
    // Sole-combination fallback: the Fixer's one combo is named "Default" but
    // flagged False (unique weapons don't bother setting it) — it's still the
    // authoritative standard-parts list.
    expect(w.defaultModFormIds).toEqual(w.templateModFormIds);
    // Magazine/reload fields (sustained DPS)
    expect(w.capacity).toBe(20);
    expect(w.ammoPerShot).toBe(1);
    expect(w.reloadSpeed).toBeCloseTo(1.1765, 4);
    expect(w.animationReloadSec).toBeCloseTo(3.2, 3);
  });

  it('Gatling Plasma: main curve present → phys + energy (all plasma weapons deal both)', async () => {
    const w = await toGeneratedWeapon(stubClient, gatlingPlasma as unknown as EsmRecord, []);
    expect(w.components.map(c => c.damageType)).toEqual(['ballistic', 'energy']);
    expect(w.components[0].tier).toBe(12);
    expect(w.components[1].tier).toBe(12);
    // Default=True combination only — the unnamed "None" combo swaps in
    // 0x0019A7F5/0x0017E6C9, which must NOT leak into the standard parts.
    expect(w.defaultModFormIds).toEqual(['0x0001EC4E', '0x0001EC53', '0x0001EC63', '0x0001EC60', '0x00485581']);
    expect(w.defaultModFormIds).not.toContain('0x0019A7F5');
    expect(w.defaultModFormIds).not.toContain('0x0017E6C9');
  });

  it('MG42: Base Damage 0 with no typed entries → physical from the main curve', async () => {
    const w = await toGeneratedWeapon(stubClient, mg42 as unknown as EsmRecord, []);
    expect(w.components).toHaveLength(1);
    expect(w.components[0].damageType).toBe('ballistic');
    expect(w.components[0].tier).toBe(16);
    expect(w.animationReloadSec).toBeCloseTo(3.6667, 3);
    // Flagged-Default path with 6 combos: the 5-part Default set, not the
    // 10-part "None" combo's union.
    expect(w.defaultModFormIds).toEqual(['0x0007C200', '0x0007C20C', '0x0007C793', '0x0007BE00', '0x0084CCA1']);
    expect(w.defaultModFormIds).not.toContain('0x0007AD6E');
  });

  it('Shishkebab: Base Damage > 0 plus typed fire entry → two components sharing the tier-20 curve', async () => {
    const w = await toGeneratedWeapon(stubClient, shishkebab as unknown as EsmRecord, []);
    expect(w.components.map(c => c.damageType)).toEqual(['ballistic', 'fire']);
    expect(w.components[0].tier).toBe(20);
    expect(w.components[1].tier).toBe(20);
  });

  it('flags unrecognized damage types as unresolved instead of dropping them', async () => {
    const record = JSON.parse(JSON.stringify(shishkebab)) as EsmRecord;
    (record.fields['Damage Types'] as Array<{ Type: string }>)[0].Type = '0x0BADF00D';
    const unresolved: string[] = [];
    const w = await toGeneratedWeapon(stubClient, record, unresolved);
    expect(w.components[1].damageType).toBe('unknown');
    expect(unresolved.some(u => u.includes('0x0BADF00D'))).toBe(true);
  });
});

describe('chaseExplosion', () => {
  it('Fat Man: ammo → PROJ → EXPL main curve becomes an explosive fromExplosion component', async () => {
    const record = weapFatman as unknown as EsmRecord;
    const unresolved: string[] = [];
    const result = await chaseExplosion(stubClient, record.fields, 'Fatman', unresolved);
    expect(result.components).toHaveLength(1);
    expect(result.components[0]).toMatchObject({
      damageType: 'explosive',
      damageTypeEdid: null,
      tier: 89,
      fromExplosion: true,
    });
    expect(result.components[0].curve?.at(-1)).toEqual({ x: 50, y: 1565 });
    expect(result.baseWeaponDamageMult).toBe(0);
    expect(unresolved).toEqual([]);
  });

  it('Gamma Gun: typed EXPL entries become radiation + energy fromExplosion components (noDamage rescue)', async () => {
    const record = weapGammaGun as unknown as EsmRecord;
    const result = await chaseExplosion(stubClient, record.fields, 'GammaGun', []);
    // No main curve (Damage 0) — two typed entries, both tier-18 curves.
    expect(result.components).toHaveLength(2);
    expect(result.components[0]).toMatchObject({
      damageType: 'radiation',
      damageTypeEdid: 'dtRadiationExposure',
      tier: 18,
      fromExplosion: true,
    });
    expect(result.components[1]).toMatchObject({ damageType: 'energy', tier: 18, fromExplosion: true });
  });

  it('Plasma Gun: PROJ without the Explosion flag is inert even though it carries an EXPL formid', async () => {
    // ProjectilePlasmaLarge points at the missile-shell EXPL (tier 72, 968 dmg
    // at 50) but lacks Data.Flags "Explosion" — chasing it anyway would give
    // every plasma weapon phantom missile damage.
    const fields = { Data: { Ammo: '0x0001DBB7' }, RGW3: {} };
    const result = await chaseExplosion(stubClient, fields, 'PlasmaGun', []);
    expect(result.components).toEqual([]);
    expect(result.baseWeaponDamageMult).toBe(0);
  });

  it('Gauss Rifle: EXPL with only Base Weapon Damage Mult yields the intrinsic payload fraction', async () => {
    const fields = { Data: { Ammo: '0x0018ABDF' }, RGW3: { 'Override Projectile': '0x001CC149' } };
    const result = await chaseExplosion(stubClient, fields, 'GaussRifle', []);
    expect(result.components).toEqual([]);
    expect(result.baseWeaponDamageMult).toBeCloseTo(0.15, 5);
  });

  it('missing chain records surface as unresolved notes, not crashes', async () => {
    const fields = { Data: { Ammo: '0xDEADBEEF' }, RGW3: {} };
    const unresolved: string[] = [];
    const result = await chaseExplosion(stubClient, fields, 'BrokenWeapon', unresolved);
    expect(result.components).toEqual([]);
    expect(unresolved.some(u => u.includes('BrokenWeapon'))).toBe(true);
  });
});

describe('isExcludedWeaponEdid', () => {
  it('excludes zzz/debug/test/deleted/creature-attack edids', () => {
    expect(isExcludedWeaponEdid('ZZZ_crWarGlaive_Copy01')).toBe(true);
    expect(isExcludedWeaponEdid('debug_balance_AssaultRifle')).toBe(true);
    expect(isExcludedWeaponEdid('zzz_TestAssaultRifle')).toBe(true);
    expect(isExcludedWeaponEdid('DEL_foo')).toBe(true);
    expect(isExcludedWeaponEdid('crMothmanAttack1')).toBe(true);
  });

  it('does not exclude legitimate weapon edids, including the crossbow "cr" trap', () => {
    expect(isExcludedWeaponEdid('crossbow')).toBe(false);
    expect(isExcludedWeaponEdid('CombatRifle_Fixer')).toBe(false);
    expect(isExcludedWeaponEdid('TeslaRifle')).toBe(false);
  });
});

describe('isExcludedOmodEdid', () => {
  it('excludes debug/deleted/cut/test/player-tier junk edids', () => {
    expect(isExcludedOmodEdid('DEBUG_ATX_mod_melee_Sledgehammer')).toBe(true);
    expect(isExcludedOmodEdid('DEL_E08A_mod_x')).toBe(true);
    expect(isExcludedOmodEdid('CUT_AAA_mod')).toBe(true);
    expect(isExcludedOmodEdid('ZZZ_mod_Legendary_Weapon4_Crafting')).toBe(true);
  });

  it('does not exclude legitimate omod edids — ATX is deliberately NOT junk-filtered for omods', () => {
    expect(isExcludedOmodEdid('mod_Legendary_Weapon1_DamageAddiction')).toBe(false);
    expect(isExcludedOmodEdid('ATX_mod_StarletRifle')).toBe(false);
    expect(isExcludedOmodEdid('dlc01_mod_melee_assaultronblade_Standard')).toBe(false);
  });

  it('does not exclude p62_ — a real content prefix (The Drifter boss drops + a real legendary family), not junk (2026-07-12, found chasing Splinter)', () => {
    expect(isExcludedOmodEdid('P62_Mod_Custom_Splinter_SpecialEffect')).toBe(false);
    expect(isExcludedOmodEdid('P62_mod_Legendary_Weapon4_Satiated')).toBe(false);
  });
});
