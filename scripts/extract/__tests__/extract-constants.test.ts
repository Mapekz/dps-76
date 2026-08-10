import { describe, it, expect } from 'bun:test';
import type { EsmListRow, EsmRecord } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';
import { extractConstants } from '../extract-constants';
import avifStrength from './fixtures/avif-strength.json';
import gmstResistExponent from './fixtures/gmst-resist-exponent.json';
import gmstVatsCritBase from './fixtures/gmst-vats-critical-charge-base.json';
import gmstAmmoPerStack from './fixtures/gmst-ammo-spender-ammo-use-per-stack.json';
import gmstCloseDistance from './fixtures/gmst-distance-for-close-damage.json';
import raceHuman from './fixtures/race-human.json';
import racePowerArmor from './fixtures/race-powerarmor.json';

// avif-strength.json is verbatim `esm get 0x000002C2 --json` output
// (20260717 ESM) — pins the real field names ("Minimum Value"/"Maximum
// Value") this extractor reads. The other 6 SPECIAL AVIFs are lightweight
// inline stubs (same shape as edidOnly() helpers elsewhere in this suite —
// AVIF records carry no other field this extractor touches).
const SPECIAL_FORM_IDS = [
  '0x000002C2',
  '0x000002C3',
  '0x000002C4',
  '0x000002C5',
  '0x000002C6',
  '0x000002C7',
  '0x000002C8',
];

// Mirrors extract-constants.ts's own GMST family FormID lists (duplicated
// here rather than exported — same convention as SPECIAL_FORM_IDS above).
const RESIST_EXPONENT_FORM_IDS = [
  '0x0017D8A9',
  '0x0017D8A6',
  '0x0017D8AB',
  '0x0017D8A7',
  '0x0017D8A8',
  '0x0017D8AA',
  '0x0017D8AC',
];
const DAMAGE_FACTOR_FORM_IDS = [
  '0x000769CB',
  '0x000769C8',
  '0x000769CD',
  '0x000769C9',
  '0x000769CA',
  '0x000769CC',
  '0x000769CE',
];
const MIN_DAMAGE_REDUCTION_FORM_IDS = [
  '0x00066DC7',
  '0x0006461D',
  '0x0006461C',
  '0x00064620',
  '0x00064623',
];
const MAX_DAMAGE_REDUCTION_FORM_IDS = [
  '0x00066DC6',
  '0x0006461E',
  '0x000559A3',
  '0x0006461B',
  '0x0006461F',
  '0x003C295D',
  '0x00064624',
];

function avifStub(formId: string, editorId: string, min: number, max: number): EsmRecord {
  return {
    header: { signature: 'AVIF', form_id: formId },
    editor_id: editorId,
    fields: { 'Minimum Value': min, 'Maximum Value': max },
  };
}

function gmstStub(formId: string, editorId: string, value: number): EsmRecord {
  return {
    header: { signature: 'GMST', form_id: formId },
    editor_id: editorId,
    fields: { Float: value },
  };
}

/** A full set of valid mitigation GMST records (uniform, real values) — merged into SPECIAL-focused fixtures so they don't spuriously flag mitigation as unresolved. */
function uniformMitigationRecords(): Record<string, EsmRecord> {
  const records: Record<string, EsmRecord> = {};
  for (const formId of RESIST_EXPONENT_FORM_IDS) records[formId] = gmstStub(formId, 'stub', 0.365);
  for (const formId of DAMAGE_FACTOR_FORM_IDS) records[formId] = gmstStub(formId, 'stub', 0.15);
  for (const formId of MIN_DAMAGE_REDUCTION_FORM_IDS)
    records[formId] = gmstStub(formId, 'stub', 0.01);
  for (const formId of MAX_DAMAGE_REDUCTION_FORM_IDS)
    records[formId] = gmstStub(formId, 'stub', 0.99);
  return records;
}

/** Mirrors extract-constants.ts's own vatsCrit/actionPoints/bulletStorm FormIDs (duplicated, same convention as the lists above). */
const VATS_CRIT_CHARGE_BASE_FORM_ID = '0x00249662';
const AP_POOL_BASE_FORM_ID = '0x0004D878';
const AP_POOL_PER_AGILITY_FORM_ID = '0x0004D879';
/**
 * `fDamagedAPRegenDelay` has NO ESM record (exe-baked), so the default
 * fixtures deliberately omit it — extraction must fall back to 1.0 silently.
 * This FormID is invented, used only by the "future dump adds it" test.
 */
const AP_REGEN_DELAY_EDID = 'fDamagedAPRegenDelay';
const AP_REGEN_DELAY_HYPOTHETICAL_FORM_ID = '0x00BADA55';
const BULLET_STORM_AMMO_PER_STACK_FORM_ID = '0x0083C3D0';
const HUMAN_RACE_FORM_ID = '0x00013746';
const POWER_ARMOR_RACE_FORM_ID = '0x0001D31E';
const CLOSE_THRESHOLD_FORM_ID = '0x007D2391';

function gmstUIntStub(formId: string, editorId: string, value: number): EsmRecord {
  return {
    header: { signature: 'GMST', form_id: formId },
    editor_id: editorId,
    fields: { UInt: value },
  };
}

/** A full set of valid vatsCrit/actionPoints/bulletStorm records (uniform, real values) — merged into SPECIAL/mitigation-focused fixtures so they don't spuriously flag these new families as unresolved. */
function uniformNewConstantsRecords(): Record<string, EsmRecord> {
  return {
    [VATS_CRIT_CHARGE_BASE_FORM_ID]: gmstVatsCritBase as unknown as EsmRecord,
    [AP_POOL_BASE_FORM_ID]: gmstStub(AP_POOL_BASE_FORM_ID, 'fAVDActionPointsBase', 60),
    [AP_POOL_PER_AGILITY_FORM_ID]: gmstStub(
      AP_POOL_PER_AGILITY_FORM_ID,
      'fAVDActionPointsMult',
      10,
    ),
    [BULLET_STORM_AMMO_PER_STACK_FORM_ID]: gmstAmmoPerStack as unknown as EsmRecord,
    [HUMAN_RACE_FORM_ID]: raceHuman as unknown as EsmRecord,
    [POWER_ARMOR_RACE_FORM_ID]: racePowerArmor as unknown as EsmRecord,
    [CLOSE_THRESHOLD_FORM_ID]: gmstCloseDistance as unknown as EsmRecord,
  };
}

function clientFrom(records: Record<string, EsmRecord>) {
  const rows: EsmListRow[] = Object.entries(records).map(([formId, r]) => ({
    form_id: formId,
    record_type: r.header.signature,
    editor_id: r.editor_id,
    name: null,
  }));
  return createInMemoryEsmSource({ records, rows });
}

describe('extractConstants — SPECIAL clamp', () => {
  it('reads the SPECIAL clamp as [1, 100] when all 7 AVIFs agree (real Strength fixture + 6 matching stubs)', async () => {
    const records: Record<string, EsmRecord> = {
      '0x000002C2': avifStrength as unknown as EsmRecord,
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    for (const formId of SPECIAL_FORM_IDS.slice(1)) {
      records[formId] = avifStub(formId, 'stub', 1, 100);
    }
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.special).toEqual({ min: 1, max: 100 });
    expect(unresolved).toHaveLength(0);
  });

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

/** A full set of valid SPECIAL AVIF records — merged into mitigation-focused fixtures below for the same reason as uniformMitigationRecords(). */
function uniformSpecialRecords(): Record<string, EsmRecord> {
  const records: Record<string, EsmRecord> = {};
  for (const formId of SPECIAL_FORM_IDS) records[formId] = avifStub(formId, 'stub', 1, 100);
  return records;
}

describe('extractConstants — mitigation GMST families', () => {
  it('reads all 4 families as [0.365, 0.15, 0.01, 0.99] when every GMST agrees (real exponent fixture + matching stubs)', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    records['0x0017D8A9'] = gmstResistExponent as unknown as EsmRecord;
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.mitigation).toEqual({
      resistExponent: 0.365,
      damageFactor: 0.15,
      minReduction: 0.01,
      maxReduction: 0.99,
    });
    expect(unresolved).toHaveLength(0);
  });

  it('MinDamageReduction resolves from only its 5 real members (Rads/Poison have no dedicated GMST) without flagging that as unresolved', async () => {
    // uniformMitigationRecords() already only stubs MIN_DAMAGE_REDUCTION_FORM_IDS's 5 entries —
    // this test just makes that "5, not 7" shape explicit and asserts it resolves cleanly.
    expect(MIN_DAMAGE_REDUCTION_FORM_IDS).toHaveLength(5);
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.mitigation.minReduction).toBe(0.01);
    expect(unresolved).toHaveLength(0);
  });

  it('flags divergence within a family instead of silently picking one member, but still emits the first-resolved value', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    records[DAMAGE_FACTOR_FORM_IDS[3]] = gmstStub(DAMAGE_FACTOR_FORM_IDS[3], 'Rogue', 0.2);
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.mitigation.damageFactor).toBe(0.15); // first-resolved member wins
    expect(unresolved.some((u) => u.includes('DamageFactor') && u.includes('0.2'))).toBe(true);
  });

  it('falls back to the pre-extraction default for a family that fails to resolve entirely, independent of the other families', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
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
  it('reads fVATSCriticalChargeBase as 5.0 (real fixture)', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.vatsCrit).toEqual({ chargeBase: 5.0 });
    expect(unresolved).toHaveLength(0);
  });

  it('falls back to 5.0 and notes it when the GMST fails to resolve', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
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
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    // The generic AV delay IS present in the real ESM — assert it is not
    // mistaken for the AP-specific one even when sitting right there.
    records['0x000DB2AA'] = gmstStub('0x000DB2AA', 'fDamagedAVRegenDelay', 0.25);
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.actionPoints.regenDelaySec).toBe(1.0);
    expect(unresolved.some((u) => u.includes('RegenDelay'))).toBe(false);
  });

  it('prefers the ESM value over the exe default if a future dump ever adds the record', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
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
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
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

  it('reads pool/regen-delay GMSTs and both race regen rates when everything resolves', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.actionPoints).toEqual({
      poolBase: 60,
      poolPerAgility: 10,
      regenDelaySec: 1.0,
      regenRatePct: 6.0,
      regenRatePctPowerArmor: 3.0,
    });
    expect(unresolved).toHaveLength(0);
  });

  it('falls back independently per scalar when one GMST fails to resolve, without affecting the others', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    delete records[AP_POOL_BASE_FORM_ID];
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.actionPoints.poolBase).toBe(60); // fallback
    expect(constants.actionPoints.poolPerAgility).toBe(10); // unaffected
    expect(unresolved.some((u) => u.includes('ActionPointsBase'))).toBe(true);
  });

  it('falls back to the human regen rate default when HumanRace fails to resolve (get throws)', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    delete records[HUMAN_RACE_FORM_ID];
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.actionPoints.regenRatePct).toBe(6.0);
    expect(constants.actionPoints.regenRatePctPowerArmor).toBe(3.0); // unaffected
    expect(unresolved.some((u) => u.includes('HumanRace ActionPointsRate'))).toBe(true);
  });

  it('falls back when a race record has no Properties row for the ActionPointsRate AV', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
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
  it('reads uAmmoSpenderAmmoUsePerStack as 30 via its UInt field (real fixture)', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.bulletStorm).toEqual({ ammoPerStack: 30 });
    expect(unresolved).toHaveLength(0);
  });

  it('reads an arbitrary UInt value (not hardcoded to 30)', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    records[BULLET_STORM_AMMO_PER_STACK_FORM_ID] = gmstUIntStub(
      BULLET_STORM_AMMO_PER_STACK_FORM_ID,
      'uAmmoSpenderAmmoUsePerStack',
      45,
    );
    const { constants } = await extractConstants(clientFrom(records));
    expect(constants.bulletStorm.ammoPerStack).toBe(45);
  });

  it('falls back to 30 and notes it when the GMST has no numeric UInt field', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
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
  it('reads fDistanceForCloseDamage as 850 (real fixture)', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.distance).toEqual({ closeThresholdUnits: 850 });
    expect(unresolved).toHaveLength(0);
  });

  it('falls back to 850 and notes it when the GMST fails to resolve', async () => {
    const records: Record<string, EsmRecord> = {
      ...uniformSpecialRecords(),
      ...uniformMitigationRecords(),
      ...uniformNewConstantsRecords(),
    };
    delete records[CLOSE_THRESHOLD_FORM_ID];
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.distance).toEqual({ closeThresholdUnits: 850 });
    expect(unresolved.some((u) => u.includes('DistanceForCloseDamage'))).toBe(true);
  });
});
