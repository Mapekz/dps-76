import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'bun:test';
import type { GeneratedOmod, GeneratedWeapon } from '../../../src/types/generated';
import { emptyCobjIndex, type CobjIndex, type CobjInfo } from '../cobj-index';
import type { EsmListRow, EsmRecord, EsmRefRow } from '../esm-client';

/** Minimal record in the `esm get --json` shape; fresh object per call. */
export function stubRecord(
  signature: string,
  formId: string,
  editorId: string,
  fields: Record<string, unknown> = {},
): EsmRecord {
  return { header: { signature, form_id: formId }, editor_id: editorId, fields };
}

/** Harmless KYWD for `getFallback` — resolves any unstocked formid to itself. */
export function kywdPlaceholder(formId: string): EsmRecord {
  return stubRecord('KYWD', formId, formId);
}

/** Harmless PERK for `getFallback` — `buildAvifRoutes` bulk-gets plumbing perks by editor_id. */
export function perkPlaceholder(target: string): EsmRecord {
  return stubRecord('PERK', target, target);
}

export function omodRecord(
  formId: string,
  editorId: string,
  data: Record<string, unknown>,
  extraFields: Record<string, unknown> = {},
): EsmRecord {
  return stubRecord('OMOD', formId, editorId, { Data: data, ...extraFields });
}

/** `list()`/`search()` rows mirroring `records`; `name` is the record's string `Name` or null. */
export function listRows(records: Iterable<EsmRecord>): EsmListRow[] {
  return [...records].map((r) => ({
    form_id: r.header.form_id,
    record_type: r.header.signature,
    editor_id: r.editor_id,
    name: typeof r.fields['Name'] === 'string' ? r.fields['Name'] : null,
  }));
}

export function refRow(recordType: string, formId: string, editorId: string): EsmRefRow {
  return { form_id: formId, record_type: recordType, editor_id: editorId, name: null, depth: 1 };
}

/** An effect's `Conditions` block gating on `GetIsPlayer == value` (0 = NPC branch, 1 = PVP-only branch). */
export function getIsPlayerConditions(value: 0 | 1): Record<string, unknown> {
  return {
    Conditions: [
      {
        Condition: {
          'Condition Data': {
            Function: 'GetIsPlayer',
            'Comparison Value': value,
            Operator: 'Equal To',
            'Run On': 'Subject',
          },
        },
      },
    ],
  };
}

export function cobjInfo(
  overrides: Partial<CobjInfo> & Pick<CobjInfo, 'formId' | 'edid'>,
): CobjInfo {
  return {
    createdObjectFormId: null,
    learnMethod: null,
    repairMethod: null,
    learnRecipeFrom: null,
    ...overrides,
  };
}

export function cobjIndexOf(...infos: CobjInfo[]): CobjIndex {
  const index = emptyCobjIndex();
  for (const info of infos) {
    index.byFormId.set(info.formId, info);
    if (info.createdObjectFormId) {
      const list = index.byCreatedObject.get(info.createdObjectFormId) ?? [];
      list.push(info);
      index.byCreatedObject.set(info.createdObjectFormId, list);
    }
  }
  return index;
}

export function minimalWeapon(
  overrides: Partial<GeneratedWeapon> & Pick<GeneratedWeapon, 'id' | 'formId'>,
): GeneratedWeapon {
  return {
    name: overrides.name ?? overrides.id,
    weaponTypeName: 'Gun',
    keywords: [],
    isAutomaticFlag: false,
    critDamageMult: 2,
    critChargeBonus: 0,
    sneakAttackMult: 2,
    speed: 1,
    attackDelaySec: 0.1,
    animationAttackSec: 0.1,
    animationFireSec: 0.1,
    reloadSpeed: 1,
    capacity: 10,
    ammoPerShot: 1,
    actionPointCost: 10,
    projectileCount: 1,
    reach: 0,
    secondaryDamage: 0,
    damageBonusMult: 1,
    components: [
      {
        damageType: 'ballistic',
        damageTypeEdid: null,
        amount: 10,
        tier: 1,
        curve: null,
      },
    ],
    defaultModFormIds: [],
    templateModFormIds: [],
    eligibleLevels: [],
    attachParentSlots: [],
    modifiers: [],
    ...overrides,
  };
}

/** An `ap_customName` identity-slot OMOD unless `overrides` says otherwise. */
export function minimalOmod(
  overrides: Partial<GeneratedOmod> & Pick<GeneratedOmod, 'id' | 'formId' | 'name'>,
): GeneratedOmod {
  return {
    description: '',
    attachPointFormId: '0x0047A264',
    attachPointEdid: 'ap_customName',
    targetKeywords: [],
    modifiers: [],
    addedKeywords: [],
    hasEnchantments: false,
    ...overrides,
  };
}

/** A fresh temp dir per test in the enclosing describe, removed after each. */
export function useTempDir(prefix: string): () => string {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), prefix));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  return () => dir;
}
