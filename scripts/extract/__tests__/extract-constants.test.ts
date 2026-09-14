import { describe, it, expect } from 'bun:test';
import type { EsmRecord } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';
import { extractConstants } from '../extract-constants';
import { listRows } from './esm-stubs';
import {
  AP_POOL_BASE_FORM_ID,
  BULLET_STORM_AMMO_PER_STACK_FORM_ID,
  CLOSE_THRESHOLD_FORM_ID,
  DAMAGE_FACTOR_FORM_IDS,
  HUMAN_RACE_FORM_ID,
  MAX_DAMAGE_REDUCTION_FORM_IDS,
  MIN_DAMAGE_REDUCTION_FORM_IDS,
  POWER_ARMOR_RACE_FORM_ID,
  SPECIAL_FORM_IDS,
  VATS_CRIT_CHARGE_BASE_FORM_ID,
  avifStub,
  gmstStub,
  gmstUIntStub,
  uniformMitigationRecords,
  uniformNewConstantsRecords,
  validConstantsRecords,
} from './extract-fixtures';
import avifStrength from './fixtures/avif-strength.json';
import gmstResistExponent from './fixtures/gmst-resist-exponent.json';

// avif-strength.json is verbatim `esm get 0x000002C2 --json` output
// (20260717 ESM) — pins the real field names ("Minimum Value"/"Maximum
// Value") this extractor reads. The other 6 SPECIAL AVIFs are lightweight
// `avifStub`s (AVIF records carry no other field this extractor touches).

/**
 * `fDamagedAPRegenDelay` has NO ESM record (exe-baked), so the default
 * fixtures deliberately omit it — extraction must fall back to 1.0 silently.
 * This FormID is invented, used only by the "future dump adds it" test.
 */
const AP_REGEN_DELAY_EDID = 'fDamagedAPRegenDelay';
const AP_REGEN_DELAY_HYPOTHETICAL_FORM_ID = '0x00BADA55';

function clientFrom(records: Record<string, EsmRecord>) {
  return createInMemoryEsmSource({ records, rows: listRows(Object.values(records)) });
}

describe('extractConstants — every family resolved', () => {
  it('reads SPECIAL [1, 100], mitigation [0.365, 0.15, 0.01, 0.99], VATS 5.0, AP pool/regen, Bullet Storm 30 (UInt) and Close 850 with nothing unresolved (real Strength/ResistExponent/VATS/AmmoPerStack/CloseDistance/race fixtures + matching stubs)', async () => {
    // MinDamageReduction has only 5 real members (Rads/Poison have no
    // dedicated GMST) — "5, not 7" must resolve without flagging.
    expect(MIN_DAMAGE_REDUCTION_FORM_IDS).toHaveLength(5);
    const records: Record<string, EsmRecord> = {
      ...validConstantsRecords(),
      '0x000002C2': avifStrength as unknown as EsmRecord,
      '0x0017D8A9': gmstResistExponent as unknown as EsmRecord,
    };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants).toEqual({
      special: { min: 1, max: 100 },
      mitigation: {
        resistExponent: 0.365,
        damageFactor: 0.15,
        minReduction: 0.01,
        maxReduction: 0.99,
      },
      vatsCrit: { chargeBase: 5.0 },
      actionPoints: {
        poolBase: 60,
        poolPerAgility: 10,
        regenDelaySec: 1.0,
        regenRatePct: 6.0,
        regenRatePctPowerArmor: 3.0,
      },
      bulletStorm: { ammoPerStack: 30 },
      distance: { closeThresholdUnits: 850 },
    });
    expect(unresolved).toHaveLength(0);
  });
});

describe('extractConstants — SPECIAL clamp', () => {
  it('flags divergence instead of silently picking one AVIF, but still emits the first-resolved bound', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    for (const [i, formId] of SPECIAL_FORM_IDS.entries()) {
      records[formId] = avifStub(formId, i === 6 ? 'Luck' : 'stub', 1, i === 6 ? 120 : 100);
    }
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.special).toEqual({ min: 1, max: 100 });
    expect(unresolved.some((u) => u.includes('Luck') && u.includes('120'))).toBe(true);
  });

  it('drops a record with a non-numeric Minimum/Maximum Value and notes it, but still resolves from the rest', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    for (const formId of SPECIAL_FORM_IDS) records[formId] = avifStub(formId, 'stub', 1, 100);
    records['0x000002C2'] = {
      header: { signature: 'AVIF', form_id: '0x000002C2' },
      editor_id: 'Strength',
      fields: {},
    };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.special).toEqual({ min: 1, max: 100 });
    expect(unresolved.some((u) => u.includes('Strength') && u.includes('missing numeric'))).toBe(
      true,
    );
  });

  it('falls back to [1, 100] and notes it when every SPECIAL AVIF fails to resolve', async () => {
    const { constants, unresolved } = await extractConstants(
      clientFrom({ ...uniformMitigationRecords(), ...uniformNewConstantsRecords() }),
    );
    expect(constants.special).toEqual({ min: 1, max: 100 });
    expect(unresolved.some((u) => u.includes('no SPECIAL AVIF resolved'))).toBe(true);
  });
});

describe('extractConstants — mitigation GMST families', () => {
  it('flags divergence within a family instead of silently picking one member, but still emits the first-resolved value', async () => {
    const records = validConstantsRecords();
    records[DAMAGE_FACTOR_FORM_IDS[3]] = gmstStub(DAMAGE_FACTOR_FORM_IDS[3], 'Rogue', 0.2);
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.mitigation.damageFactor).toBe(0.15); // first-resolved member wins
    expect(unresolved.some((u) => u.includes('DamageFactor') && u.includes('0.2'))).toBe(true);
  });

  it('falls back to the pre-extraction default for a family that fails to resolve entirely, independent of the other families', async () => {
    const records = validConstantsRecords();
    for (const formId of MAX_DAMAGE_REDUCTION_FORM_IDS) delete records[formId];
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.mitigation).toEqual({
      resistExponent: 0.365,
      damageFactor: 0.15,
      minReduction: 0.01,
      maxReduction: 0.99,
    });
    expect(unresolved.some((u) => u.includes('no MaxDamageReduction GMST resolved'))).toBe(true);
  });
});

describe('extractConstants — VATS crit-meter base', () => {
  it('falls back to 5.0 and notes it when the GMST fails to resolve', async () => {
    const records = validConstantsRecords();
    delete records[VATS_CRIT_CHARGE_BASE_FORM_ID];
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.vatsCrit).toEqual({ chargeBase: 5.0 });
    expect(unresolved.some((u) => u.includes('VATSCriticalChargeBase'))).toBe(true);
  });
});

describe('extractConstants — action points', () => {
  // fDamagedAPRegenDelay is exe-baked in FO76 with no ESM record. Absence is
  // the NORMAL path, so it must not read as an extraction gap — and it must
  // not quietly borrow the generic fDamagedAVRegenDelay's value either.
  it('falls back to the exe-baked 1.0 when the ESM has no fDamagedAPRegenDelay record, silently', async () => {
    const records = validConstantsRecords();
    // The generic AV delay IS present in the real ESM — assert it is not
    // mistaken for the AP-specific one even when sitting right there.
    records['0x000DB2AA'] = gmstStub('0x000DB2AA', 'fDamagedAVRegenDelay', 0.25);
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.actionPoints.regenDelaySec).toBe(1.0);
    expect(unresolved.some((u) => u.includes('RegenDelay'))).toBe(false);
  });

  it('prefers the ESM value over the exe default if a future dump ever adds the record', async () => {
    const records: Record<string, EsmRecord> = {
      ...validConstantsRecords(),
      [AP_REGEN_DELAY_HYPOTHETICAL_FORM_ID]: gmstStub(
        AP_REGEN_DELAY_HYPOTHETICAL_FORM_ID,
        AP_REGEN_DELAY_EDID,
        0.5,
      ),
    };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.actionPoints.regenDelaySec).toBe(0.5);
    expect(unresolved).toHaveLength(0);
  });

  it('flags a present-but-malformed fDamagedAPRegenDelay instead of silently defaulting', async () => {
    const records: Record<string, EsmRecord> = {
      ...validConstantsRecords(),
      [AP_REGEN_DELAY_HYPOTHETICAL_FORM_ID]: {
        header: { signature: 'GMST', form_id: AP_REGEN_DELAY_HYPOTHETICAL_FORM_ID },
        editor_id: AP_REGEN_DELAY_EDID,
        fields: {},
      },
    };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.actionPoints.regenDelaySec).toBe(1.0); // still usable
    expect(unresolved.some((u) => u.includes('DamagedAPRegenDelay'))).toBe(true);
  });

  it('falls back independently per scalar when one GMST fails to resolve, without affecting the others', async () => {
    const records = validConstantsRecords();
    delete records[AP_POOL_BASE_FORM_ID];
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.actionPoints.poolBase).toBe(60); // fallback
    expect(constants.actionPoints.poolPerAgility).toBe(10); // unaffected
    expect(unresolved.some((u) => u.includes('ActionPointsBase'))).toBe(true);
  });

  it('falls back to the human regen rate default when HumanRace fails to resolve (get throws)', async () => {
    const records = validConstantsRecords();
    delete records[HUMAN_RACE_FORM_ID];
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.actionPoints.regenRatePct).toBe(6.0);
    expect(constants.actionPoints.regenRatePctPowerArmor).toBe(3.0); // unaffected
    expect(unresolved.some((u) => u.includes('HumanRace ActionPointsRate'))).toBe(true);
  });

  it('falls back when a race record has no Properties row for the ActionPointsRate AV', async () => {
    const records = validConstantsRecords();
    records[POWER_ARMOR_RACE_FORM_ID] = {
      header: { signature: 'RACE', form_id: POWER_ARMOR_RACE_FORM_ID },
      editor_id: 'PowerArmorRace',
      fields: { Properties: [{ 'Actor Value': '0x00000000', Value: 99, 'Curve Table': null }] },
    };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.actionPoints.regenRatePctPowerArmor).toBe(3.0); // fallback
    expect(
      unresolved.some(
        (u) =>
          u.includes('PowerArmorRace ActionPointsRate') && u.includes('no numeric Properties row'),
      ),
    ).toBe(true);
  });
});

describe('extractConstants — Bullet Storm ammo-per-stack', () => {
  it('reads an arbitrary UInt value (not hardcoded to 30)', async () => {
    const records = validConstantsRecords();
    records[BULLET_STORM_AMMO_PER_STACK_FORM_ID] = gmstUIntStub(
      BULLET_STORM_AMMO_PER_STACK_FORM_ID,
      'uAmmoSpenderAmmoUsePerStack',
      45,
    );
    const { constants } = await extractConstants(clientFrom(records));
    expect(constants.bulletStorm.ammoPerStack).toBe(45);
  });

  it('falls back to 30 and notes it when the GMST has no numeric UInt field', async () => {
    const records = validConstantsRecords();
    records[BULLET_STORM_AMMO_PER_STACK_FORM_ID] = {
      header: { signature: 'GMST', form_id: BULLET_STORM_AMMO_PER_STACK_FORM_ID },
      editor_id: 'uAmmoSpenderAmmoUsePerStack',
      fields: {},
    };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.bulletStorm).toEqual({ ammoPerStack: 30 });
    expect(
      unresolved.some(
        (u) => u.includes('AmmoSpenderAmmoUsePerStack') && u.includes('missing numeric UInt'),
      ),
    ).toBe(true);
  });
});

describe('extractConstants — distance (Close gate)', () => {
  it('falls back to 850 and notes it when the GMST fails to resolve', async () => {
    const records = validConstantsRecords();
    delete records[CLOSE_THRESHOLD_FORM_ID];
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.distance).toEqual({ closeThresholdUnits: 850 });
    expect(unresolved.some((u) => u.includes('DistanceForCloseDamage'))).toBe(true);
  });
});
