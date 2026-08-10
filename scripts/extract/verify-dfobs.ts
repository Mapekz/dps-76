import type { EsmSource } from './esm-client';

/**
 * DFOB identity pinning (2026-07-21 DFOB sweep).
 *
 * DFOB ("Default Object") records are the game exe's indirection layer: the
 * exe reads a DFOB whose single `Object` field points at the ESM record that
 * drives a mechanic. Several extractor tables reference those same records by
 * hardcoded editor_id string — the STAT_* AV routing in `normalize/mgef.ts`,
 * the DMGT map in `normalize/explosion.ts`, and `scenarios.ts`'s Charged 4★
 * keyword. This step re-resolves each bridge every extraction and flags any
 * mismatch as an unresolved note, so a game-update rename/repoint surfaces
 * loudly instead of the consuming table silently going stale (the failure
 * mode that let `fVATSCriticalChargeMult` die unnoticed for years).
 *
 * Verification only — no generated output. The consuming tables key on edids
 * that also appear inside already-generated data (perks.json conditions,
 * omods.json keywords), so dynamically substituting a DFOB-resolved edid at
 * extraction time wouldn't make the app more correct; a loud note plus a
 * reviewed hand-fix is the right failure path. Curve singletons are the
 * exception (a formid chase with no string keying) and DO consume their DFOB
 * directly — `extract-curvetables.ts`'s `resolveSingletonRecord`.
 */
export interface DfobBridge {
  /** The DFOB record's formid. */
  dfobFormId: string;
  /** The DFOB record's editor_id (for readable notes). */
  dfobEditorId: string;
  /** The editor_id the consuming table hardcodes for the DFOB's target. */
  expectedTargetEdid: string;
  /** Where the hardcoded edid lives. */
  consumer: string;
}

export const DFOB_BRIDGES: ReadonlyArray<DfobBridge> = [
  // Charged 4★ melee gate keyword (scenarios.ts CHARGED_KEYWORD).
  {
    dfobFormId: '0x0089A83B',
    dfobEditorId: 'WeaponHasSecondaryChargeUpKeyword_DO',
    expectedTargetEdid: 'WeaponHasSecondaryCharging',
    consumer: 'src/lib/engine/scenarios.ts CHARGED_KEYWORD',
  },
  // DMGT damage-type identities (normalize/explosion.ts DAMAGE_TYPE_EDID_MAP keys).
  {
    dfobFormId: '0x00249220',
    dfobEditorId: 'DamageTypePhysical_DO',
    expectedTargetEdid: 'dtPhysical',
    consumer: 'normalize/explosion.ts DAMAGE_TYPE_EDID_MAP',
  },
  {
    dfobFormId: '0x006FB527',
    dfobEditorId: 'EnergyDamage_DO',
    expectedTargetEdid: 'dtEnergy',
    consumer: 'normalize/explosion.ts DAMAGE_TYPE_EDID_MAP',
  },
  {
    dfobFormId: '0x006FB529',
    dfobEditorId: 'CryoDamage_DO',
    expectedTargetEdid: 'dtCryo',
    consumer: 'normalize/explosion.ts DAMAGE_TYPE_EDID_MAP',
  },
  {
    dfobFormId: '0x006FB52B',
    dfobEditorId: 'FireDamage_DO',
    expectedTargetEdid: 'dtFire',
    consumer: 'normalize/explosion.ts DAMAGE_TYPE_EDID_MAP',
  },
  {
    dfobFormId: '0x006FB531',
    dfobEditorId: 'PoisonDamage_DO',
    expectedTargetEdid: 'dtPoison',
    consumer: 'normalize/explosion.ts DAMAGE_TYPE_EDID_MAP',
  },
  {
    dfobFormId: '0x0090E930',
    dfobEditorId: 'DamageTypeRadiation_DO',
    expectedTargetEdid: 'dtRadiationExposure',
    consumer: 'normalize/explosion.ts DAMAGE_TYPE_EDID_MAP',
  },
  // STAT_* AV identities routed by normalize/mgef.ts's AVIF table. Only the
  // DFOB-bridged AVs that table actually maps are pinned (STAT_DmgMeleeUnarmed
  // has a DFOB too but is unmapped/unmodeled — nothing to pin).
  {
    dfobFormId: '0x007C9096',
    dfobEditorId: 'DamageVsClose_DO',
    expectedTargetEdid: 'STAT_DmgVsClose',
    consumer: 'normalize/mgef.ts AVIF routing',
  },
  {
    dfobFormId: '0x00815EE7',
    dfobEditorId: 'DamageVsFar_DO',
    expectedTargetEdid: 'STAT_DmgVsFar',
    consumer: 'normalize/mgef.ts AVIF routing',
  },
  {
    dfobFormId: '0x00837DFB',
    dfobEditorId: 'PowerAttackDamage_DO',
    expectedTargetEdid: 'STAT_DmgPowerAttack',
    consumer: 'normalize/mgef.ts AVIF routing',
  },
  {
    dfobFormId: '0x00801245',
    dfobEditorId: 'DamageVsCrippled_DO',
    expectedTargetEdid: 'STAT_DmgVsCrippled',
    consumer: 'normalize/mgef.ts AVIF routing',
  },
  {
    dfobFormId: '0x0081A7D2',
    dfobEditorId: 'DamagePerCrippledLimb_DO',
    expectedTargetEdid: 'STAT_DmgPerCrippled',
    consumer: 'normalize/mgef.ts AVIF routing',
  },
  {
    dfobFormId: '0x00803E2B',
    dfobEditorId: 'DamageVsNonWeakpoint_DO',
    expectedTargetEdid: 'STAT_DmgVsTorso',
    consumer: 'normalize/mgef.ts AVIF routing',
  },
  {
    dfobFormId: '0x00837DFA',
    dfobEditorId: 'DamageVsBleeding_DO',
    expectedTargetEdid: 'STAT_DmgVsBleeding',
    consumer: 'normalize/mgef.ts AVIF routing',
  },
  {
    dfobFormId: '0x0083F35D',
    dfobEditorId: 'DamageVsBurning_DO',
    expectedTargetEdid: 'STAT_DmgVsBurning',
    consumer: 'normalize/mgef.ts AVIF routing',
  },
  {
    dfobFormId: '0x0083F35E',
    dfobEditorId: 'DamageVsPoisoned_DO',
    expectedTargetEdid: 'STAT_DmgVsPoisoned',
    consumer: 'normalize/mgef.ts AVIF routing',
  },
  {
    dfobFormId: '0x0085A2F2',
    dfobEditorId: 'DamageVsFreezing_DO',
    expectedTargetEdid: 'STAT_DmgVsFreezing',
    consumer: 'normalize/mgef.ts AVIF routing',
  },
  {
    dfobFormId: '0x00801CA0',
    dfobEditorId: 'APDamageBonus_DO',
    expectedTargetEdid: 'STAT_DmgAP',
    consumer: 'normalize/mgef.ts AVIF routing (Number Cruncher)',
  },
];

export interface VerifyDfobsResult {
  /** Bridges that resolved AND matched their expected target edid. */
  verified: number;
  unresolved: string[];
}

export async function verifyDfobs(client: EsmSource): Promise<VerifyDfobsResult> {
  const unresolved: string[] = [];
  let verified = 0;

  await Promise.all(
    DFOB_BRIDGES.map(async (bridge) => {
      try {
        const dfob = await client.get(bridge.dfobFormId);
        const target = dfob.fields['Object'];
        if (typeof target !== 'string') {
          unresolved.push(
            `dfobs: ${bridge.dfobEditorId} (${bridge.dfobFormId}) has no Object formid`,
          );
          return;
        }
        const record = await client.get(target);
        if (record.editor_id !== bridge.expectedTargetEdid) {
          unresolved.push(
            `dfobs: ${bridge.dfobEditorId} repointed — expected ${bridge.expectedTargetEdid}, got ${record.header.signature} ${record.editor_id} (${target}); review ${bridge.consumer}`,
          );
          return;
        }
        verified += 1;
      } catch (err) {
        unresolved.push(
          `dfobs: ${bridge.dfobEditorId} (${bridge.dfobFormId}) failed to resolve: ${(err as Error).message}`,
        );
      }
    }),
  );

  return { verified, unresolved };
}
