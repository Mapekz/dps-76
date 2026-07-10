import type { EsmClient } from '../esm-client';
import { parseMagicEffects } from '../normalize/mgef';

/**
 * Standing gate for a known esm-CLI bug: on Mutation_AdrenalReaction, the
 * curve tables (Mutation_Adrenal_Normal/_Super, input AV 0x00000399) are
 * mis-associated to effects #0/#1 instead of the two abPerkFortifyDmgAll
 * effects (MGEF formid 0x004F6AB0). Until the CLI is fixed, the correct
 * values are hand-carried in src/data/overrides/buff-overrides.ts — see that
 * file's comment for the retirement plan.
 */
const ADRENAL_FORTIFY_MGEF_FORMID = '0x004F6AB0';

/** True once both abPerkFortifyDmgAll effects on the record carry their curve. */
export async function checkAdrenalCurve(client: EsmClient): Promise<boolean> {
  const record = await client.get('Mutation_AdrenalReaction');
  const fortifyEffects = parseMagicEffects(record).filter(
    e => e.mgefFormId.toLowerCase() === ADRENAL_FORTIFY_MGEF_FORMID.toLowerCase()
  );
  return fortifyEffects.length === 2 && fortifyEffects.every(e => e.curvePoints !== null);
}
