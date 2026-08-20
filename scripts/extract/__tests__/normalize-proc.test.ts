import { describe, it, expect } from 'bun:test';
import type { EsmRecord } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';
import { decodeProcComponentsFromExpl, decodeInstantDamageComponent } from '../normalize/proc';
import type { MgefInfo, SpellEffect } from '../normalize/mgef';

// Pins `normalize/proc.ts`'s decode primitives (issue #42 — PROC_DAMAGE_PLAN.md)
// against real-formid-shaped stubs mirroring the 20260814 ESM dump — synthetic
// minimal records keyed by their real hex formids (same style as
// normalize-explosion.test.ts), not full fixture JSON dumps.

function mgef(overrides: Partial<MgefInfo> = {}): MgefInfo {
  return {
    edid: 'TestMgef',
    name: 'Test',
    archetype: 'Damage',
    actorValue: null,
    resistValue: null,
    perkToApply: null,
    explosion: null,
    keywords: [],
    dispelWithKeywords: false,
    detrimental: false,
    conditionRows: [],
    ...overrides,
  };
}

function effect(overrides: Partial<SpellEffect> = {}): SpellEffect {
  return {
    mgefFormId: '0xM',
    magnitude: 0,
    duration: 0,
    conditionRows: [],
    curvePoints: null,
    curveInputAv: null,
    magnitudeGlobal: null,
    cooldownDurationSec: null,
    area: null,
    ...overrides,
  };
}

describe('decodeProcComponentsFromExpl', () => {
  // Electrician's — EXPL 0x00799382 LegendaryEffect_Electricians_Explosion:
  // flat Damage 0.01 (below-threshold residual, same shared-decode artifact
  // every EXPL chase carries) plus a typed energy Damage Types entry, curve
  // 11→25 (CT_Legendary_Weapon_Electricians_EnergyDmg).
  const ELECTRICIANS_EXPL = '0x00799382';
  const ENERGY_RESIST_AV = '0x00060A81';

  const electriciansClient = createInMemoryEsmSource({
    records: {
      [ELECTRICIANS_EXPL]: {
        header: { signature: 'EXPL', form_id: ELECTRICIANS_EXPL },
        editor_id: 'LegendaryEffect_Electricians_Explosion',
        fields: {
          Data: { Damage: 0.01, 'Base Weapon Damage Mult': 0 },
          'Damage Types': [
            {
              Type: ENERGY_RESIST_AV,
              Amount: 0,
              'Curve Table': {
                curve_path: 'LegendaryMods\\Weapon_ElectriciansEnergyDMG.json',
                curve: [
                  { x: 1, y: 11 },
                  { x: 50, y: 25 },
                ],
              },
            },
          ],
        },
      } as unknown as EsmRecord,
    },
    resolveEdidMap: { [ENERGY_RESIST_AV]: 'dtEnergy' },
  });

  it("decodes Electrician's EXPL into a residual explosive component plus the typed energy component", async () => {
    const unresolved: string[] = [];
    const components = await decodeProcComponentsFromExpl(
      electriciansClient,
      ELECTRICIANS_EXPL,
      unresolved,
    );
    expect(components).toEqual([
      { damageType: 'explosive', damageTypeEdid: null, amount: 0.01, tier: null, curve: null },
      {
        damageType: 'energy',
        damageTypeEdid: 'dtEnergy',
        amount: 0,
        tier: null,
        curve: [
          { x: 1, y: 11 },
          { x: 50, y: 25 },
        ],
      },
    ]);
    expect(unresolved).toEqual([]);
  });

  // Circuit Breaker's VFX-only cast — EXPL 0x006E20EB: no curve, no flat
  // Damage, no typed entries. `decodeProcComponentsFromExpl` must materialize
  // nothing (matches the plan's "VFX only" grounding note).
  const VFX_ONLY_EXPL = '0x006E20EB';
  const vfxClient = createInMemoryEsmSource({
    records: {
      [VFX_ONLY_EXPL]: {
        header: { signature: 'EXPL', form_id: VFX_ONLY_EXPL },
        editor_id: 'expl_circuitbreaker_vfx',
        fields: { Data: { Damage: 0, 'Base Weapon Damage Mult': 0 } },
      } as unknown as EsmRecord,
    },
  });

  it('returns an empty array for a VFX-only explosion with no direct damage', async () => {
    const unresolved: string[] = [];
    const components = await decodeProcComponentsFromExpl(vfxClient, VFX_ONLY_EXPL, unresolved);
    expect(components).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it('returns an empty array (with a note) when the EXPL is not found', async () => {
    const unresolved: string[] = [];
    const components = await decodeProcComponentsFromExpl(vfxClient, '0xMISSING', unresolved);
    expect(components).toEqual([]);
    expect(unresolved).toEqual(['Explosion 0xMISSING not found']);
  });
});

describe('decodeInstantDamageComponent (Circuit Breaker shape)', () => {
  const ENERGY_RESIST_FORMID = '0x000002EB';
  const edidByFormId = new Map<string, string>([[ENERGY_RESIST_FORMID, 'EnergyResist']]);

  it('decodes CircuitBreaker_DamageHealthContact (0x007452C3): curve 31→103, no area → isAoe false', () => {
    const m = mgef({
      edid: 'CircuitBreaker_DamageHealthContact',
      archetype: 'Damage',
      resistValue: ENERGY_RESIST_FORMID,
    });
    const e = effect({
      mgefFormId: '0x007452C3',
      magnitude: 31,
      area: 0,
      duration: 0,
      curvePoints: [
        { x: 1, y: 31 },
        { x: 50, y: 103 },
      ],
    });
    expect(decodeInstantDamageComponent(m, e, edidByFormId)).toEqual({
      damageType: 'energy',
      damageTypeEdid: 'EnergyResist',
      amount: 31,
      tier: null,
      curve: [
        { x: 1, y: 31 },
        { x: 50, y: 103 },
      ],
      isAoe: false,
    });
  });

  it('decodes 0x006EBCD1: curve 6→20, Area 50 → isAoe true', () => {
    const m = mgef({
      edid: 'CircuitBreakerContactEffect',
      archetype: 'Damage',
      resistValue: ENERGY_RESIST_FORMID,
    });
    const e = effect({
      mgefFormId: '0x006EBCD1',
      magnitude: 6,
      area: 50,
      duration: 0,
      curvePoints: [
        { x: 1, y: 6 },
        { x: 50, y: 20 },
      ],
    });
    const component = decodeInstantDamageComponent(m, e, edidByFormId);
    expect(component?.isAoe).toBe(true);
    expect(component?.damageType).toBe('energy');
  });

  it("flags `unresisted: true` (damageType 'unknown') instead of dropping the component when the MGEF carries no Resist Value at all (user-decided 2026-08-20: mechanically unresisted, docs/assumptions.md 'DoT/proc resist provenance' — pre-2026-08-20 this silently returned null)", () => {
    const m = mgef({ archetype: 'Damage', resistValue: null });
    const e = effect({ magnitude: 10 });
    expect(decodeInstantDamageComponent(m, e, edidByFormId)).toEqual({
      damageType: 'unknown',
      damageTypeEdid: null,
      amount: 10,
      tier: null,
      curve: null,
      isAoe: false,
      unresisted: true,
    });
  });

  it('returns null when the Resist Value edid has no RESIST_AV_DAMAGE_TYPES mapping', () => {
    const m = mgef({ archetype: 'Damage', resistValue: '0xUNMAPPED' });
    const e = effect({ magnitude: 10 });
    const unmappedEdids = new Map([['0xUNMAPPED', 'SomeUnknownResist']]);
    expect(decodeInstantDamageComponent(m, e, unmappedEdids)).toBeNull();
  });

  it('returns null when there is neither a curve nor positive flat magnitude', () => {
    const m = mgef({ archetype: 'Damage', resistValue: ENERGY_RESIST_FORMID });
    const e = effect({ magnitude: 0, curvePoints: null });
    expect(decodeInstantDamageComponent(m, e, edidByFormId)).toBeNull();
  });
});
