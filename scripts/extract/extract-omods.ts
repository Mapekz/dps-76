import type {
  ExcludedRecordDetail,
  GeneratedExplosionSwap,
  GeneratedOmod,
  GeneratedProc,
} from '../../src/types/generated';
import type { Bucket, Modifier } from '../../src/types/modifiers';
import { mapPool, type EsmRecord, type EsmSource } from './esm-client';
import {
  FALLBACK_AVIF_ROUTES,
  buildAvifRoutes,
  parseMagicEffects,
  translateGrantedPerk,
  translateMagicEffect,
  type AvifRoute,
  type MgefTranslationDeps,
} from './normalize/mgef';
import { translateConditions } from './normalize/conditions';
import { DAMAGE_TYPE_EDID_MAP } from './normalize/explosion';
import { ObtainabilityClassifier } from './obtainability';
import { emptyCobjIndex, isNonGrantingCobj, type CobjIndex } from './cobj-index';
import { collectProperties, omodData } from './omod-properties';
import {
  enchantmentModifiers,
  overrideProjectileModifiers,
  type ProjectileChaseDeps,
} from './omod-projectile-chase';

export { propertyName } from './omod-properties';

/**
 * OMOD extraction. A weapon mod's real stats usually live on _PARENT_ template
 * mods referenced through Data.Includes (recursively) — e.g. the Powerful
 * Automatic Receiver itself only ADDs keywords; its +25% DamageBonusMult and
 * SET Speed 0.8248 come from included parents. We flatten the include chain.
 *
 * Compatibility (matched app-side): omod.attachPoint ∈ weapon.attachParentSlots
 * (formids) AND omod.targetKeywords ⊆ weapon.keywords (edids).
 */

interface PropertyMapping {
  bucket: Bucket;
  /** Bucket when the operator is ADD (crit/sneak split base vs bonus). */
  addBucket?: Bucket;
}

/**
 * ActorValues OMOD property → bucket (resolved AV edid → mapping) for AVs
 * with no `FALLBACK_AVIF_ROUTES` entry (see the `fallback` branch in the
 * ActorValues handler below — it wins over this map). Anti-Armor's
 * `ActorValues ADD ArmorPenetration 50.0` and All Rise's flat `Health ADD`
 * route via the shared fallback, not here. Unmapped AVs are reported so the
 * map grows deliberately.
 *
 * Bullet Storm buckets landed 2026-07-16 (verified via `esm get`):
 * - Resolute Veteran's OMOD (mod_Custom_ResoluteVeteran 0x008F0DCE) carries
 *   `ActorValues ADD AmmoSpenderMinStacks 5.0` (AVIF 0x00919957, "Minimum
 *   Bullet Storm Stack Count", no percentage flag — scale 1).
 * - Final Word's OMOD (mod_Custom_FinalWord 0x008F1037) carries
 *   `ActorValues SET EnableAmmoSpenderOnKill 1.0` (AVIF 0x00924DB9, flagged
 *   "Boolean" — a plain enable flag, but `bulletStormOnKill` is a stored-inert
 *   bucket today, same shape as `bulletStormSpinUp`/`deflectChance`
 *   — docs/assumptions.md "Bullet Storm"). The SET must land as op:'SET', not
 *   'ADD' — see the pushAv three-way op mapping below (bug fix, 2026-07-16:
 *   every non-MUL_ADD function used to collapse to 'ADD', silently
 *   downgrading this SET).
 *
 * Old Guard's 0x007ACE76 → `STAT_DeflectChance` now routes via
 * mgef.ts's shared FALLBACK_AVIF_ROUTES fallback (no entry needed here —
 * see the `fallback` branch in the ActorValues handler below).
 *
 * Still deliberately OUT of this map (fall through to the "ActorValues on
 * X — unmapped" note below):
 * - The Fixer's 0x00183312 / 0x00245BEB → `ArmorShadowHide` ("Stealth in
 *   Shadows") / `Mod_StealthMove_AV` ("Sneaking Speed") — sneak-detection
 *   stats, non-damage.
 * - V63 Laser Rifle's 0x0092B20A → `RefractingProjectileChance` (new AVIF,
 *   20260717): chance for the beam to refract, consumed natively via
 *   RefractingProjectileChance_DO — no ESM-visible damage semantics, so the
 *   note drives the 'inert' badge and nothing else (user decision
 *   2026-07-21: badges + notes only, no expected-value modeling).
 */
export const ACTOR_VALUE_BUCKETS: Record<string, { bucket: Bucket; scale: number }> = {
  // Resolute Veteran: flat Bullet Storm floor ADD +5 (see doc comment above).
  AmmoSpenderMinStacks: { bucket: 'bulletStormMinStacks', scale: 1 },
  // Final Word: enable on-kill stack grant (SET 1.0 — Boolean AV, see doc
  // comment above). Stored-inert until a kill-aware model exists.
  EnableAmmoSpenderOnKill: { bucket: 'bulletStormOnKill', scale: 1 },
  // Bunker Buster (mod_Custom_BunkerBuster, OMOD 0x00471880): ActorValues ADD
  // 0x00919EE2 ConvertExplosiveRadiusToDamage = 1.0. AVIF is Boolean
  // (min 0/max 1/default 0), natively consumed via DFOB
  // 0x00919EE3 ConvertExplosiveRadiusToDamage_DO — no SPEL/PERK/ENCH reads
  // it in the ESM, so the ratio below is a modeling ASSUMPTION, not
  // ESM-proven (docs/assumptions.md). The OMOD's own ADD value (1.0 = 100%)
  // doubles as the conversion fraction; scale 1 passes it through unchanged.
  // Folded together with `explosionRadiusBonus` in effective-weapon.ts
  // buildEffectiveWeapon.
  ConvertExplosiveRadiusToDamage: { bucket: 'explosionRadiusToDamage', scale: 1 },
};

/**
 * AVs deliberately NOT mapped from ActorValues properties because the same
 * OMOD carries the value elsewhere — mapping both would double-count.
 */
const ACTOR_VALUE_SKIP: Record<string, string> = {
  // Executioner's: value + threshold live on the granted LegendaryExecutePerk
  // (dbm +0.5, target HP ≤ GLOB LGND_ExecuteHealthThreshold) via the ENCH chase.
  LGND_ExecuteDmg: 'carried by granted LegendaryExecutePerk',
};

/** OMOD Property name → formula bucket. Unknown damage-ish names are reported. */
const PROPERTY_BUCKETS: Record<string, PropertyMapping> = {
  DamageBonusMult: { bucket: 'dbm' },
  CriticalDamageMult: { bucket: 'critDmgBase', addBucket: 'critDmgBonus' },
  SneakAttackMult: { bucket: 'sneakBase', addBucket: 'sneakBonus' },
  Speed: { bucket: 'fireRateSpeed' },
  IsAutomatic: { bucket: 'isAutomatic' },
  NumProjectiles: { bucket: 'projectileCount' },
  CriticalChargeBonus: { bucket: 'critFill' },
  AmmoCapacity: { bucket: 'ammoCapacity' },
  ReloadSpeed: { bucket: 'reloadSpeed' },
  // V.A.T.S. Optimized: MUL_ADD −0.35 on the weapon's per-shot VATS AP cost
  // (mod_Legendary_Weapon3_VATSCostAP, 0x00524154 — verified in the
  // 2026-07-02 dump). Folded over Weapon.apCost in effective-weapon.ts, same
  // pattern as ammoCapacity/reloadSpeed; consumed by ap-economy.ts (Stage B).
  AttackActionPointCost: { bucket: 'vatsApCost' },
  // Charging-barrel OMODs (mod_GammaGun_SpecialMuzzle_Charger; tesla's
  // DLC01_mod_LightningGun_Barrel_ChargeHold/_ChargeShotgun — FullPowerSeconds
  // only; the laser/ultracite sniper-barrel parent templates — both). Plain
  // SET numerics, same shape as AmmoCapacity — folded over
  // weapon.fullPowerSeconds/fullPowerDamageMult in effective-weapon.ts.
  FullPowerSeconds: { bucket: 'chargeFullPowerSec' },
  FullPowerDamageMult: { bucket: 'chargeFullPowerDamageMult' },
  // Semi-auto attack-delay penalty/bonus (Salt of the Earth's July-10-patch
  // retune, +100%→+50% — 2026-07-15 audit). Was previously in
  // PROPERTY_IGNORED under a stale "never affects the formula" claim; it
  // directly scales fire-rate.ts's semi-auto divisor via weapon.animDelaySec.
  // Folded over Weapon.animDelaySec in effective-weapon.ts, same MUL_ADD
  // pattern as ReloadSpeed/AttackActionPointCost.
  AttackDelaySec: { bucket: 'animDelaySec' },
  // Range/falloff (Phase 1 extraction half, go-through-every-single-silly-
  // whistle.md): mostly barrels (_PARENT_mod_WEAPON_Barrel_Long_Range
  // 0x0027ABFA carries MaxRange/MinRange MUL_ADD 0.5) but also muzzles/
  // receivers with small +/- tweaks — 435 OMODs total in the 20260710 dump,
  // scopes carry none; OutOfRangeDamageMult is rare (one OMOD:
  // mod_PlasmaGun_barrel_Flamer_Abraxo SET 0.7). Verified live 2026-07-18.
  // Folded over weapon.minRange/maxRange/outOfRangeDamageMult the same way as
  // ammoCapacity/reloadSpeed once the falloff engine step lands
  // (effective-weapon.ts) — extraction-only for now, buckets are
  // `hasEngineEffect: false` (src/types/modifiers.ts).
  MinRange: { bucket: 'weaponMinRange' },
  MaxRange: { bucket: 'weaponMaxRange' },
  OutOfRangeDamageMult: { bucket: 'weaponOutOfRangeMult' },
};

/** Property names that never affect the damage formula — skipped without reporting. */
const PROPERTY_IGNORED = new Set([
  'Weight',
  'Value',
  'Health',
  'Ammo',
  'Reach',
  'AimModelBaseStability',
  'AimModelRecoilMaxDegPerShot',
  // NOTE: 'AttackDamage' and 'DamageTypeValues' are handled explicitly below
  // (they scale component base damage), not ignored.
  'AimModelRecoilMinDegPerShot',
  'AimModelRecoilArcDeg',
  'AimModelRecoilArcRotateDeg',
  'AimModelConeIronSightsMultiplier',
  'AimModelMinConeDegrees',
  'AimModelMaxConeDegrees',
  'AimModelConeSneakMultiplier',
  'AimModelConeIncreasePerShot',
  'AimModelConeDecreasePerSec',
  'ZoomDataFOVMult',
  'ZoomDataOverlay',
  'ZoomDataIsModFormID',
  'HitBehavior',
  'Rank',
  'ColorRemappingIndex',
  'MaterialSwaps',
  'ModelSection',
  'SoundLevel',
  'NPCsUseAmmo',
  'ActionPointCost',
  // 'MinPowerPerShot' — stale pre-rename field name: the esm CLI renamed this
  // Data property twice ("Min Power Per Shot" → "Max Power Per Shot" →
  // "Full Power Damage Mult", which IS mapped above), superseded.
  'MinPowerPerShot',
  'Stagger',
  'SightedTransitionSeconds',
  'AccuracyBonus',
  'HasScope',
  'BoltAction',
  'BashImpactDataSet',
  'BlockMaterial',
  'EnableMarts',
  'VerticalRecoilMult',
  'HorizontalRecoilMult',
  'ConditionDamageScale',
  'DisableSighted',
  'AimAssistModel',
  'AimModel',
  'AimModelConeDecreaseDelayMs',
  'AimModelRecoilDiminishSightsMult',
  'AimModelRecoilDiminishSpringForce',
  'AimModelRecoilHipMult',
  'AimModelRecoilShotsForRunaway',
  'AmmoConsumption',
  'AttackSound',
  'CritEffect',
  'Durability',
  'EquipSlot',
  'EquipSound',
  'FastEquipSound',
  'HasAlternateRumble',
  'HasRepeatableSingleFire',
  'HitBehaviour',
  // 'HoldInputToPower' — the app's charging gate is numeric (effective
  // FullPowerSeconds/FullPowerDamageMult > 0, see src/lib/charge.ts), not this
  // flag: laser sniper barrels set charge values WITHOUT carrying it.
  'HoldInputToPower',
  'IdleSound',
  'ImpactDataSet',
  'MinWeaponDrawTime',
  'ModelSwap',
  'NPCAmmoList',
  // 'OverheatRateDown'/'OverheatRateUp' — overheat is broken in-game (V63
  // carbine / gauss minigun), deliberately unmodeled. WEAP.Data carries
  // Overheat's own fields (MinOverheatIdle, etc.) alongside the charging
  // FPS/FPDM fields that extract-weapons.ts reads; the two mechanics are
  // structural neighbors despite only charging being modeled.
  'OverheatRateDown',
  'OverheatRateUp',
  // NOTE: 'OverrideProjectile' is handled explicitly below (Lobber Barrel /
  // Polar Lobber launcher-hazard chase), not ignored.
  'SecondaryDamage',
  'SoundTagSet',
  'UnEquipSound',
  'Unknown',
  'UnsightedTransitionSeconds',
  'WeightMult',
  'ZoomData',
  'ZoomDataCameraOffsetX',
  'ZoomDataCameraOffsetY',
  'ZoomDataCameraOffsetZ',
  // Armor-only cosmetic properties (Phase 3 armor pipeline, 2026-07-18 full-
  // extraction sweep — no weapon-side equivalent to alias, unlike the
  // PROPERTY_NAME_ALIASES set above): 'Addon Index' picks a material/size
  // model variant, 'Biped World Model' swaps the equipped model per body
  // slot, 'Body Part' scopes a paint/material SET to one biped part — all
  // three are cosmetic-only (paint sets, material swaps), never damage-
  // relevant.
  'Addon Index',
  'Biped World Model',
  'Body Part',
]);

// Dev/dead-record prefixes that never reach players (case-insensitive; the
// weapon extractor has its own copy tuned for WEAP naming). Cheap pre-filter
// only — obtainability derivation is the real gate.
//
// NOTE (2026-07-12): `p62_` was REMOVED from this list — it's a real content
// prefix (The Drifter boss encounter + its unique drops' legendary effects:
// Splinter/Chaos Engine/Tempest's SpecialEffect mods, PLUS a whole family of
// unrelated new legendaries — Rebounders, Crusaders, Metabolic, Brutalists,
// Satiated, SightSeers, Ruiners, OverLoaders, Voltaic, StaggerProof — all
// verified present in the 20260702 dump with real Names), not a dev/test
// prefix. It was silently dropping all of them pre-obtainability; found while
// chasing Splinter's Onslaught contribution (docs/assumptions.md "Onslaught").
//
// NOTE (2026-07-12): `sdow_` was REMOVED for the same reason as `p62_` — it's
// a real content prefix (the Severing 4★ legendary, fishing-rod mods, Slasher
// event gear), not dev/test. It was silently dropping the Severing OMOD
// entirely; found while wiring the target-is-bleeding condition.
const OMOD_JUNK_EDID_RE = /^(zzz|del_|deleted|debug|cut_|test|wip|post_|hto_|mtnm|xpd_)/i;

/** Exposed for tests: does the pre-filter drop this editor_id? */
export function isExcludedOmodEdid(edid: string): boolean {
  return OMOD_JUNK_EDID_RE.test(edid);
}

export type OmodRecordExclusion = 'wrongFormType' | 'authoringTemplate' | 'junkEdid' | 'unnamed';

/**
 * Structural exclusion classifier shared by the omods pass (`named` filter
 * below) and the attach-point grant index (ap-grant-index.ts) — ONE list so
 * shape/prefix rules can't drift between consumers (the p62_/sdow_ incidents
 * above are exactly that failure mode).
 * - 'wrongFormType': Form Type ∉ `allowedFormTypes`. Weapon and Armor mods
 *   both use this same OMOD record type, gated only by this field (verified
 *   2026-07-18: power-armor legendary/misc mods carry Form Type "Armor" too,
 *   NOT a distinct "PowerArmor" value — one `{'Armor'}` set covers both).
 *   `extractOmods` below classifies `named` against `OMOD_ALLOWED_FORM_TYPES`
 *   (`{'Weapon','Armor'}`) in one shared OMOD list+bulkGet, then buckets each
 *   surviving record by this same field into `omods` (weapon) / `armorOmods`.
 * - 'authoringTemplate': _PARENT_ records / "TEMPLATE:"-named — carry the
 *   stats real mods include via their Includes chain; never equippable.
 * - 'junkEdid': dev/dead-record prefixes (checked BEFORE 'unnamed' so a
 *   nameless zzz_/cut_ record classifies as junk, never as merely unnamed).
 * - 'unnamed': no display Name. Not emitted as a picker mod, but a weapon
 *   template may legitimately include one, so the grant index keeps these
 *   as seed-only entries.
 */
export function classifyOmodRecordExclusion(
  record: EsmRecord,
  allowedFormTypes: ReadonlySet<string>,
): OmodRecordExclusion | null {
  const data = omodData(record);
  const formType = ((data['Form Type'] as Record<string, unknown>)?.['name'] as string) ?? '';
  if (!allowedFormTypes.has(formType)) return 'wrongFormType';
  if (record.editor_id.startsWith('_PARENT_')) return 'authoringTemplate';
  if (isExcludedOmodEdid(record.editor_id)) return 'junkEdid';
  if (!record.fields['Name']) return 'unnamed';
  if ((record.fields['Name'] as string).startsWith('TEMPLATE')) return 'authoringTemplate';
  return null;
}

/** Form types the omods pass processes in its one shared OMOD list+get pass (see classifyOmodRecordExclusion). */
const OMOD_ALLOWED_FORM_TYPES = new Set(['Weapon', 'Armor']);

/**
 * Display name: the record's Name with the literal " Custom Mod" / " Custom
 * Name" authoring suffix stripped ("Boiling Point Custom Name" → "Boiling
 * Point" — the in-game rename these identity mods drive never shows the
 * suffix), falling back to the edid for rescued unnamed records (whose real
 * display name lives in corrections.ts `omodNameOverrides`).
 */
function omodDisplayName(record: EsmRecord): string {
  const raw = (record.fields['Name'] as string | undefined) ?? record.editor_id;
  return raw.replace(/\s+Custom (Mod|Name)$/i, '');
}

/** Identity attach points that host unique-weapon naming mods. */
const IDENTITY_ATTACH_POINTS = new Set([
  '0x0047A264', // ap_customName
  '0x00521926', // ap_Item_Description
]);

function includeDontUseAllFormIds(data: Record<string, unknown>): string[] {
  const includes = data['Includes'];
  if (!Array.isArray(includes)) return [];
  return (includes as Array<Record<string, unknown>>)
    .filter((i) => {
      const flag = i["Don't Use All"];
      if (typeof flag === 'object' && flag !== null && 'value' in flag) {
        return (flag as { value: number }).value === 1;
      }
      return flag === 1;
    })
    .map((i) => i['Mod'])
    .filter((m): m is string => typeof m === 'string');
}

/**
 * Variant container = zero own properties, ≥2 `Don't Use All` includes, on an
 * identity attach point. The game rolls exactly one variant at grant time;
 * flattening the container unions all variants (the Camden Whacker bug).
 */
export function isVariantContainer(record: EsmRecord): boolean {
  const data = omodData(record);
  if ((data['Property Count'] as number) !== 0) return false;
  const includes = data['Includes'];
  if (!Array.isArray(includes) || includes.length < 2) return false;
  const attachPoint = data['Attach Point'] as string;
  if (!IDENTITY_ATTACH_POINTS.has(attachPoint)) return false;
  return includeDontUseAllFormIds(data).length === includes.length;
}

export function resolveVariantDisplayName(
  containerEdid: string,
  containerName: string,
  variantEdid: string,
): string {
  let suffix = variantEdid;
  if (variantEdid.startsWith(`${containerEdid}_`)) {
    suffix = variantEdid.slice(containerEdid.length + 1);
  }
  const label = suffix
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) =>
      // An all-caps token (e.g. "RAD") has no lower→upper transition for the
      // split above to find — title-case it instead of leaving it shouting.
      // Every other word here is already exactly-one-capital PascalCase from
      // the split, so this only ever fires on a genuine acronym token.
      /^[A-Z]{2,}$/.test(word) ? word[0] + word.slice(1).toLowerCase() : word,
    )
    .join(' ');
  return `${containerName} (${label})`;
}

interface OmodEmitJob {
  record: EsmRecord;
  propertyRootFormId: string;
  variantOf?: string;
  nameOverride?: string;
}

/** Obtainability signals that PROVE access (vs informational ones like
 *  npcOnly/noGrantCobj/cobjScrapUnproven) — see obtainability.ts classifyOne.
 *  `armo` (2026-07-18, Phase 3 armor pipeline) is the ARMO-record parallel of
 *  `weap`. */
const PROVING_SIGNAL_RE =
  /^(cobj|cobjBook|cobjScrap|gmrw|lgdi|qust|cont|misc|flst|reso|lvli|alch|weap|armo|omod):/;
/** The inherited subset of proofs: the record rides along on its weapon/armor
 *  (or a mod collection) without any recipe/drop/reward of its own. */
const INHERITED_SIGNAL_RE = /^(weap|armo|omod):/;

function isWeakEvidence(signals: string[]): boolean {
  const proofs = signals.filter((s) => PROVING_SIGNAL_RE.test(s));
  return proofs.length > 0 && proofs.every((s) => INHERITED_SIGNAL_RE.test(s));
}

/** Slots whose mods legitimately have no recipe or drop of their own
 *  (identity/paint/legendary parts, granted with the weapon) — inherited-only
 *  evidence is normal there, so they stay out of the weak-evidence queue. */
const NON_CRAFT_SLOT_RE = /appearance|paint|skin|customname|item_description|material|legendary/i;

/**
 * Legendary-crafting mods (target keyword ma_legendarycrafting_weapon /
 * _weaponranged / _weaponmelee / ma_Misc_Legendarycrafting_Weapon_*4, or the
 * armor-side ma_legendarycrafting_armor / ma_Misc_Legendarycrafting_Armor*
 * — verified 2026-07-18 on Combat Armor Chest Piece's Keywords) are obtained
 * by crafting/learning a real recipe — a bare weapon/armor-template ride is
 * NOT a grant path for them. `hasGrantingCobj` is the exact positive signal:
 * every shipped legendary mod's co_mod_* COBJ has the OMOD as its Created
 * Object; the unfinished "Locked" (mod_Legendary_Weapon4_Guns_Locked) instead
 * has a shell COBJ that produces nothing and stays obtainable only by riding
 * HuntingRifle's template. Gated in the verdict loop below (2026-07-15);
 * the generic classifier's WEAP/ARMO-ride rule stays correct for non-legendary
 * mods.
 */
const LEGENDARY_CRAFT_KEYWORD_RE = /legendarycrafting_(weapon|armor)/i;

export interface ExtractOmodsResult {
  /** Weapon-attached OMODs (Form Type "Weapon") — byte-identical to the pre-armor-pipeline output. */
  omods: GeneratedOmod[];
  /** Armor/power-armor-attached OMODs (Form Type "Armor") — Phase 3 armor pipeline. */
  armorOmods: GeneratedOmod[];
  /** Emitted variant OMODs keyed by the container's formId (container itself is not emitted). */
  variantContainers: Record<string, GeneratedOmod[]>;
  excluded: Record<string, string[]>;
  excludedDetailed: Record<string, ExcludedRecordDetail[]>;
  /** Kept-but-weakly-evidenced records (see GeneratedMeta.reviewFlagged). */
  reviewFlagged: Record<string, ExcludedRecordDetail[]>;
  unknownProperties: string[];
  notes: string[];
}

/**
 * SPEL SURV_WellTunedSpell 0x0050CD15 — the 3600s instrument-play buff
 * (Player VMAD SURV_PlayerUseFurnitureScript / FurnitureTypeInstrument
 * 0x0050CD11). Effects[1] (FortifyDmgMeleeAll → STAT_DmgMelee mag 20) is
 * gated WornHasKeyword(CustomItemName_ToneDeath); that row is tautological
 * once attributed to the unique OMOD that ADDs the keyword, so the real
 * gate is `{kind:'wellTuned'}`. See docs/assumptions.md "Tone Death Well
 * Tuned melee buff".
 */
const WELL_TUNED_SPELL_EDID = 'SURV_WellTunedSpell';

async function attachWellTunedKeywordHooks(
  client: EsmSource,
  omods: GeneratedOmod[],
  mgefDeps: MgefTranslationDeps,
  notes: Set<string>,
): Promise<void> {
  let spell;
  try {
    spell = await client.get(WELL_TUNED_SPELL_EDID);
  } catch {
    return;
  }
  if (spell.header.signature !== 'SPEL') return;

  const byKeyword = new Map<string, GeneratedOmod[]>();
  for (const omod of omods) {
    for (const keyword of omod.addedKeywords) {
      const list = byKeyword.get(keyword);
      if (list) list.push(omod);
      else byKeyword.set(keyword, [omod]);
    }
  }

  for (const effect of parseMagicEffects(spell)) {
    const keywordFormIds = effect.conditionRows
      .filter((row) => row.Function === 'WornHasKeyword')
      .map((row) => row['Parameter 1'])
      .filter((p): p is string => typeof p === 'string');
    if (keywordFormIds.length === 0) continue;

    for (const formId of keywordFormIds) {
      const edid = await client.resolveEdid(formId);
      const targets = byKeyword.get(edid);
      if (!targets) continue;
      for (const omod of targets) {
        const result = await translateMagicEffect(mgefDeps, effect, {
          tautologicalKeywords: new Set([edid]),
        });
        for (const n of result.notes) {
          (omod.notes ??= []).push(n);
          notes.add(`${omod.id}: ${n}`);
        }
        const source: Modifier['source'] = {
          kind: 'omod',
          formId: omod.formId,
          edid: omod.id,
          name: omod.name,
        };
        for (const fragment of result.modifiers) {
          omod.modifiers.push({
            id: `${omod.formId}:wellTuned:${omod.modifiers.length}`,
            source,
            ...fragment,
            conditions: [{ kind: 'wellTuned', value: true }, ...fragment.conditions],
          });
        }
      }
    }
  }
}

export interface ExtractOmodsOptions {
  client: EsmSource;
  /** Formids of obtainable weapons (from the weapons pass) — an OMOD referenced by one rides along. */
  obtainableWeaponFormIds: ReadonlySet<string>;
  /** Forward COBJ index (buildCobjIndex) — learn-method-aware obtainability + hasGrantingCobj. */
  cobjIndex?: CobjIndex;
  /** Union of every weapon's defaultModFormIds — a default part is never flagged weak-evidence. */
  defaultModFormIds?: ReadonlySet<string>;
  /** Union of every weapon's templateModFormIds — rescues unnamed effect mods a template ships (Holy Fire). */
  templateModFormIds?: ReadonlySet<string>;
  /**
   * Perk formid → {family, rank} over all non-junk perk families
   * (buildCrossFamilyRankMap — run-all.ts builds it from the perks pass or
   * the checked-in perks.json). Resolves unique-mod HasPerk gates
   * (Mechanic's Best Friend on MakeshiftWarrior0N) into runtime
   * perkFamilyRank conditions instead of unresolved.
   */
  crossFamilyRank?: Map<string, { family: string; rank: number }>;
  /**
   * Formids of obtainable armor pieces (from the armor pass,
   * extract-armor.ts) — an armor OMOD referenced by one rides along, the
   * same WEAP-riding rule the weapon pass already gets. Armor-only; appended
   * last so every existing weapon-focused call site (tests included) stays
   * unchanged.
   */
  obtainableArmorFormIds?: ReadonlySet<string>;
}

export async function extractOmods(options: ExtractOmodsOptions): Promise<ExtractOmodsResult> {
  const {
    client,
    obtainableWeaponFormIds,
    cobjIndex = emptyCobjIndex(),
    defaultModFormIds = new Set(),
    templateModFormIds = new Set(),
    crossFamilyRank,
    obtainableArmorFormIds = new Set(),
  } = options;
  const rows = await client.list('OMOD');
  const records = await mapPool(rows, 8, (r) => client.get(r.form_id));
  const byFormId = new Map(records.map((r) => [r.header.form_id, r]));

  const unknownProperties = new Set<string>();
  const notes = new Set<string>();

  // Legendary effects carry their stats via ADD Enchantments → ENCH → MGEF.
  const routePool = new Set<string>();
  const avifRoutes: Map<string, AvifRoute[]> = await buildAvifRoutes(client, routePool);
  const edidByFormId = new Map<string, string>();
  for (const id of routePool) edidByFormId.set(id, await client.resolveEdid(id));

  const mgefDeps: MgefTranslationDeps = {
    client,
    routes: avifRoutes,
    edidByFormId,
    timedIsActive: true,
    noteUnroutedAvs: true,
    // Cross-family HasPerk gates on unique-mod chains (Mechanic's Best
    // Friend's granted perk on MakeshiftWarrior0N) resolve to runtime
    // perkFamilyRank conditions via every path sharing these deps.
    crossFamilyRank,
  };

  const projectileChaseDeps: ProjectileChaseDeps = { client, mgefDeps };

  const excluded: Record<string, string[]> = { omodJunkEdid: [] };
  // Unnamed IDENTITY records a weapon template ships with real properties
  // (Holy Fire's effect mod 0x006E06A3 on the Flamer, the Cultist Piercer /
  // Elder's Mark / Ogua Gauntlet effects, Voice of Set's description mod)
  // are real player effects the no-Name filter used to drop SILENTLY — kept,
  // emitted under their edid (display name fixed via corrections.ts
  // omodNameOverrides). Restricted to the two identity attach points: the
  // same sweep surfaced unnamed template members on regular slots too
  // (FakeSheepsquatch assaultron-head pseudo-slots, null muzzles) that are
  // authoring noise, not player choices. EVERY unnamed template member with
  // properties lands in _meta.json reviewFlagged.omodUnnamedTemplateMember
  // (rescued or skipped) so future gaps can't vanish silently again.
  // ESM authoring gap (2026-07-15 audit, uniques-effect sweep): the July-10
  // patch repurposed formID 0x00849316 — Editor ID/Name/Description/
  // Data.Properties all rewritten from a bounty-exclusive melee legendary
  // (zzz_BOUNTY_mod_Legendary_Weapon2_Melee_Pulsating) into the new
  // "Pyro-Technician's" weapon 2★ (+20% fire dbm, STAT_DmgMultFire — same
  // shape as sibling Cryologist's/Poisoner's). Attach Point was left null on
  // the old bounty record and never touched by the patch (confirmed via
  // diff.json field_changes — Attach Point absent from the changed-fields
  // list), so the record fails classifyOmodRecordExclusion's live checks yet
  // silently drops out at the `if (!attachPoint) continue` gate below.
  // User-confirmed (2026-07-15): this legendary is NOT actually craftable
  // in-game right now, despite a real, correctly-formed COBJ recipe existing
  // (co_mod_Legendary_Weapon2_Fire, 0x00849303, `Created Object` →
  // 0x00849316) and legendary crafting attaching via a scripted mechanism
  // (COBJ_Legendary_Attach_Scrip) that doesn't read Attach Point directly —
  // the null Attach Point evidently still breaks something in the live
  // crafting flow this ESM-only check can't see. So this rescue exists ONLY
  // to keep the record + its real modifiers in the generated dataset (for
  // reference/future re-evaluation, e.g. if Bethesda ever backfills the
  // field) — it's hidden from the player-facing picker via
  // `hiddenOmodIds` (src/data/overrides/corrections.ts).
  const ATTACH_POINT_OVERRIDES: Record<string, string> = {
    '0x00849316': '0x004E89A8', // mod_Legendary_Weapon2_Fire ("Pyro-Technician's") → ap_Legendary2
  };
  const unnamedTemplateMembers: ExcludedRecordDetail[] = [];
  const variantContainers: Record<string, GeneratedOmod[]> = {};
  const variantChildFormIds = new Set<string>();
  for (const record of records) {
    if (!isVariantContainer(record)) continue;
    for (const variantFormId of includeDontUseAllFormIds(omodData(record))) {
      variantChildFormIds.add(variantFormId);
    }
  }

  const named = records.filter((r) => {
    if (variantChildFormIds.has(r.header.form_id)) return false;
    if (isVariantContainer(r)) return false;
    const exclusion = classifyOmodRecordExclusion(r, OMOD_ALLOWED_FORM_TYPES);
    if (exclusion === 'junkEdid') excluded.omodJunkEdid.push(r.editor_id);
    if (exclusion === 'unnamed') {
      const data = omodData(r);
      const props = data['Properties'];
      if (!templateModFormIds.has(r.header.form_id) || !Array.isArray(props) || props.length === 0)
        return false;
      const rescued = IDENTITY_ATTACH_POINTS.has(data['Attach Point'] as string);
      unnamedTemplateMembers.push({
        id: r.editor_id,
        name: r.editor_id,
        signals: [rescued ? 'rescued' : 'skipped:nonIdentityAttachPoint'],
      });
      return rescued;
    }
    return exclusion === null;
  });

  const emitJobs: OmodEmitJob[] = named.map((record) => ({
    record,
    propertyRootFormId: record.header.form_id,
  }));
  for (const record of records) {
    if (!isVariantContainer(record)) continue;
    const containerName = omodDisplayName(record);
    for (const variantFormId of includeDontUseAllFormIds(omodData(record))) {
      const variantRecord = byFormId.get(variantFormId);
      if (!variantRecord) continue;
      emitJobs.push({
        record: variantRecord,
        propertyRootFormId: variantFormId,
        variantOf: record.editor_id,
        nameOverride: resolveVariantDisplayName(
          record.editor_id,
          containerName,
          variantRecord.editor_id,
        ),
      });
    }
  }

  const omods: GeneratedOmod[] = [];
  const armorOmods: GeneratedOmod[] = [];
  for (const job of emitJobs) {
    const record = job.record;
    const data = omodData(record);
    // Form Type buckets this record into the weapon or armor output array —
    // OMOD_ALLOWED_FORM_TYPES already restricted `named` to exactly these two
    // values (see classifyOmodRecordExclusion's doc comment).
    const formType = ((data['Form Type'] as Record<string, unknown>)?.['name'] as string) ?? '';
    const targetList = formType === 'Armor' ? armorOmods : omods;
    const attachPoint =
      (data['Attach Point'] as string) ?? ATTACH_POINT_OVERRIDES[record.header.form_id] ?? null;
    if (!attachPoint) continue;

    const targetKeywords = await Promise.all(
      (Array.isArray(record.fields['Target OMOD Keywords'])
        ? (record.fields['Target OMOD Keywords'] as string[])
        : []
      ).map((k) => client.resolveEdid(k)),
    );

    const properties = collectProperties(job.propertyRootFormId, byFormId);
    const modifiers: Modifier[] = [];
    const addedKeywords: string[] = [];
    const modNotes = new Set<string>();
    let hasEnchantments = false;
    let explosionChase: GeneratedExplosionSwap | undefined;
    let chainSuppressesExplosion = false;
    const procs: GeneratedProc[] = [];
    const source: Modifier['source'] = {
      kind: 'omod',
      formId: record.header.form_id,
      edid: record.editor_id,
      name: job.nameOverride ?? omodDisplayName(record),
    };

    for (const prop of properties) {
      if (prop.property === 'Keywords') {
        if (prop.functionType === 'ADD' && typeof prop.value1 === 'string') {
          addedKeywords.push(await client.resolveEdid(prop.value1));
        }
        continue;
      }
      if (prop.property === 'Enchantments') {
        hasEnchantments = true;
        if (typeof prop.value1 === 'string') {
          if (prop.functionType === 'REM') {
            // REM removes an ench the OMOD's own parent/base weapon carries
            // (Slow-Burner REMs Cremator's base fire-hit ench) — it must
            // never be WALKED as if it were still active (that was the bug:
            // the base weapon's PVP-only branch was silently kept while its
            // real NPC branch was dropped, see the GetIsPlayer fix above).
            // Note-only; no modifier.
            modNotes.add(`removes enchantment ${await client.resolveEdid(prop.value1)}`);
          } else {
            // ADD/SET: this OMOD grants the enchantment.
            const enchProcs = await enchantmentModifiers(
              prop.value1,
              source,
              modifiers,
              modNotes,
              projectileChaseDeps,
            );
            procs.push(...enchProcs);
          }
        }
        continue;
      }
      if (prop.property === 'OverrideProjectile') {
        // Lobber Barrel / Polar Lobber-style launcher-hazard chase — see
        // overrideProjectileModifiers's doc comment. Mirrors the Enchantments
        // REM/ADD fix above: mutually-exclusive projectile variants sharing
        // this one property (e.g. Cremator's flame-color Receiver mods each
        // REM the previously-included default/other-color projectile before
        // SETting their own) must have their REM skipped, never walked —
        // verified 2026-07-14 on Lithium (Pink)/(Blue)/(Green), which REM
        // ProjectileCremator (the shared default) while SETting their own
        // color variant.
        if (typeof prop.value1 === 'string') {
          if (prop.functionType === 'REM') {
            modNotes.add(`removes projectile override ${await client.resolveEdid(prop.value1)}`);
          } else {
            const result = await overrideProjectileModifiers(
              prop.value1,
              source,
              modifiers,
              modNotes,
              projectileChaseDeps,
            );
            if (result.chase) explosionChase = result.chase;
            if (result.chainSuppressesExplosion) chainSuppressesExplosion = true;
          }
        }
        continue;
      }
      if (prop.property === 'AttachedPerk') {
        // Property 116, decoded above by propertyName(): Value 1 = PERK
        // formid, Value 2 = 1 (ADD) — attach this perk to the wielder
        // (unique-mod rework). Decode it exactly like a legendary's
        // Script-archetype "Perk to Apply" chase (mgef.ts's
        // translateGrantedPerk): Entry Point effects with a formula bucket
        // become modifiers on THIS omod; effects with none (e.g. "Mod
        // Incoming Weapon Damage" — damage TAKEN, out of scope) become a
        // note, never a silent drop.
        if (typeof prop.value1 === 'string') {
          const result = await translateGrantedPerk(mgefDeps, record.editor_id, prop.value1);
          result.notes.forEach((n) => modNotes.add(n));
          for (const fragment of result.modifiers) {
            modifiers.push({
              id: `${record.header.form_id}:perk:${modifiers.length}`,
              source,
              ...fragment,
            });
          }
          if (result.procs) procs.push(...result.procs);
        }
        continue;
      }
      if (prop.property === 'ActorValues') {
        // Value 1 = AV formid, Value 2 = amount (Anti-Armor: ArmorPenetration
        // 50.0). A curve table OVERRIDES Value 2: Y by item level (the DmgVs
        // family carries flat (1,50)→(100,50) curves with Value 2 = 0).
        if (typeof prop.value1 === 'string' && typeof prop.value2 === 'number') {
          const avEdid = await client.resolveEdid(prop.value1);
          const flatValue = prop.value2;
          const curvePoints = prop.curvePoints;
          // Bug fix (2026-07-16): this used to collapse every non-MUL_ADD
          // function to 'ADD', silently downgrading SET (Final Word's
          // `ActorValues SET EnableAmmoSpenderOnKill 1.0` — see
          // ACTOR_VALUE_BUCKETS' doc comment). Same three-way mapping the
          // DamageTypeValues handler below already uses.
          const op =
            prop.functionType === 'SET'
              ? ('SET' as const)
              : prop.functionType === 'MUL_ADD'
                ? ('MUL_ADD' as const)
                : ('ADD' as const);
          const pushAv = (
            bucket: Bucket,
            scale: number,
            conditions: Modifier['conditions'],
            modOp: Modifier['op'] = op,
          ) => {
            modifiers.push(
              curvePoints
                ? {
                    id: `${record.header.form_id}:${modifiers.length}`,
                    source,
                    bucket,
                    op: modOp,
                    curve: { input: 'itemLevel', points: curvePoints },
                    curveScale: scale,
                    conditions,
                  }
                : {
                    id: `${record.header.form_id}:${modifiers.length}`,
                    source,
                    bucket,
                    op: modOp,
                    value: flatValue * scale,
                    conditions,
                  },
            );
          };
          // 1) Plumbing-perk routes (STAT_DamageVsPerk & co.) — bucket, scale,
          //    AND conditions (enemy-type gates) are data-driven, same as the
          //    MGEF path. This is how the DmgVs* legendary family feeds dbm.
          //    Mirrors mgef.ts's `translate()` route-consumption exactly
          //    (issue #48 double-stack fix): appends the entry point's
          //    `extraConditions` (manual gating with no ESM condition row,
          //    e.g. Concentrated Fire's `vatsOnly`/`stacks`) and honors its
          //    `op` override (e.g. Concentrated Fire's hit-chance half is
          //    MUL_ADD, not the OMOD property's own ADD function type) —
          //    falls back to this property's own `op` when the route
          //    specifies neither, so every other plumbed AV route (DmgVs*
          //    family, which sets neither map) is byte-for-byte unchanged.
          const plumbed = avifRoutes.get(prop.value1);
          const fallback = FALLBACK_AVIF_ROUTES[avEdid];
          const avMapping = ACTOR_VALUE_BUCKETS[avEdid];
          if (plumbed) {
            for (const route of plumbed) {
              const { conditions, unresolved } = translateConditions(route.rawConditions, {
                edidByFormId,
                crossFamilyRank,
              });
              if (conditions === null) continue;
              unresolved.forEach((u) => modNotes.add(`route(${avEdid}): ${u}`));
              pushAv(
                route.bucket,
                route.scale,
                [...conditions, ...(route.extraConditions ?? [])],
                route.op ?? op,
              );
            }
          } else if (fallback) {
            pushAv(fallback.bucket, fallback.scale, [...(fallback.conditions ?? [])]);
          } else if (avMapping) {
            pushAv(avMapping.bucket, avMapping.scale, []);
          } else if (!(avEdid in ACTOR_VALUE_SKIP)) {
            modNotes.add(`ActorValues on ${avEdid} — unmapped`);
          }
        }
        continue;
      }
      // Base-damage scaling (user-confirmed): MUL+ADDs on AttackDamage /
      // DamageTypeValues multiply the component's BASE damage before the dbm
      // parenthesis (automatic receivers: −30% on phys and every damage type).
      // A curve table OVERRIDES the flat value: Y at X = item level (heated
      // melee mods) — emitted as itemLevel-input curve modifiers.
      // Note: DamageTypeValues on dtPhysical ≡ AttackDamage (both phys-only).
      if (prop.property === 'AttackDamage') {
        const curved = prop.curvePoints != null;
        if ((curved || typeof prop.value1 === 'number') && prop.functionType !== 'SET') {
          const op = prop.functionType === 'MUL_ADD' ? ('MUL_ADD' as const) : ('ADD' as const);
          const conditions: Modifier['conditions'] = [
            { kind: 'damageTypeScope', types: ['ballistic'] },
          ];
          modifiers.push(
            curved
              ? {
                  id: `${record.header.form_id}:${modifiers.length}`,
                  source,
                  bucket: 'baseDamage',
                  op,
                  curve: { input: 'itemLevel', points: prop.curvePoints! },
                  curveScale: 1,
                  conditions,
                }
              : {
                  id: `${record.header.form_id}:${modifiers.length}`,
                  source,
                  bucket: 'baseDamage',
                  op,
                  value: prop.value1 as number,
                  conditions,
                },
          );
        } else if (prop.hasCurveTable && !curved) {
          modNotes.add(`AttackDamage carries an unparsed curve table — not modeled`);
        } else {
          modNotes.add(
            `AttackDamage ${prop.functionType} with value ${JSON.stringify(prop.value1)} — unhandled`,
          );
        }
        continue;
      }
      if (prop.property === 'DamageTypeValues') {
        // Value 1 = damage-type formid, Value 2 = amount — for all three
        // operators (SET/MUL_ADD/ADD, verified via raw `esm get`); a curve
        // table overrides Value 2. SET/ADD emit the matching op alongside
        // MUL_ADD — paper-damage.ts folds SET → ×Π(1+MUL_ADD) → +ΣADD per
        // damage-type-scoped component, so all three land the same way
        // AttackDamage's phys-only MUL/ADD does above.
        if (typeof prop.value1 === 'string') {
          const dtEdid = await client.resolveEdid(prop.value1);
          const damageType = DAMAGE_TYPE_EDID_MAP[dtEdid];
          const curved = prop.curvePoints != null;
          if (
            damageType &&
            damageType !== 'unknown' &&
            (curved || typeof prop.value2 === 'number')
          ) {
            const op =
              prop.functionType === 'SET'
                ? ('SET' as const)
                : prop.functionType === 'MUL_ADD'
                  ? ('MUL_ADD' as const)
                  : ('ADD' as const);
            const conditions: Modifier['conditions'] = [
              { kind: 'damageTypeScope', types: [damageType] },
            ];
            modifiers.push(
              curved
                ? {
                    id: `${record.header.form_id}:${modifiers.length}`,
                    source,
                    bucket: 'baseDamage',
                    op,
                    curve: { input: 'itemLevel', points: prop.curvePoints! },
                    curveScale: 1,
                    conditions,
                  }
                : {
                    id: `${record.header.form_id}:${modifiers.length}`,
                    source,
                    bucket: 'baseDamage',
                    op,
                    value: prop.value2 as number,
                    conditions,
                  },
            );
          } else {
            modNotes.add(`DamageTypeValues ${prop.functionType} on unmapped type ${dtEdid}`);
          }
        } else {
          modNotes.add(
            `DamageTypeValues ${prop.functionType} with non-formid value1 ${JSON.stringify(prop.value1)} — unhandled`,
          );
        }
        continue;
      }

      const mapping = PROPERTY_BUCKETS[prop.property];
      if (!mapping) {
        if (!PROPERTY_IGNORED.has(prop.property)) unknownProperties.add(prop.property);
        continue;
      }
      if (prop.curvePoints) {
        // A curve table overrides the hardcoded value: Y at X = item level.
        const op =
          prop.functionType === 'SET' ? 'SET' : prop.functionType === 'MUL_ADD' ? 'MUL_ADD' : 'ADD';
        const bucket = op === 'ADD' && mapping.addBucket ? mapping.addBucket : mapping.bucket;
        modifiers.push({
          id: `${record.header.form_id}:${modifiers.length}`,
          source,
          bucket,
          op,
          curve: { input: 'itemLevel', points: prop.curvePoints },
          curveScale: 1,
          conditions: [],
        });
        continue;
      }
      if (prop.hasCurveTable) {
        modNotes.add(`${prop.property} carries an unparsed curve table — not modeled`);
        continue;
      }

      let value: number;
      if (typeof prop.value1 === 'number') {
        value = prop.value1;
      } else if (typeof prop.value1 === 'boolean') {
        value = prop.value1 ? 1 : 0;
      } else if (
        prop.value1 &&
        typeof prop.value1 === 'object' &&
        'value' in (prop.value1 as object)
      ) {
        value = ((prop.value1 as Record<string, unknown>)['value'] as number) ?? 0;
      } else {
        notes.add(`${record.editor_id}: ${prop.property} has non-numeric value`);
        continue;
      }

      const op =
        prop.functionType === 'SET' ? 'SET' : prop.functionType === 'MUL_ADD' ? 'MUL_ADD' : 'ADD';
      const bucket = op === 'ADD' && mapping.addBucket ? mapping.addBucket : mapping.bucket;
      modifiers.push({
        id: `${record.header.form_id}:${modifiers.length}`,
        source,
        bucket,
        op,
        value,
        conditions: [],
      });
    }

    for (const note of modNotes) notes.add(`${record.editor_id}: ${note}`);
    const hasGrantingCobj = (cobjIndex.byCreatedObject.get(record.header.form_id) ?? []).some(
      (c) => !isNonGrantingCobj(c, c.edid),
    );
    const generated: GeneratedOmod = {
      id: record.editor_id,
      formId: record.header.form_id,
      name: job.nameOverride ?? omodDisplayName(record),
      description: (record.fields['Description'] as string) ?? '',
      attachPointFormId: attachPoint,
      attachPointEdid: await client.resolveEdid(attachPoint),
      targetKeywords,
      modifiers,
      addedKeywords,
      hasEnchantments,
      ...(hasGrantingCobj ? { hasGrantingCobj } : {}),
      ...(explosionChase ? { explosionChase } : {}),
      ...(chainSuppressesExplosion ? { chainSuppressesExplosion } : {}),
      ...(procs.length > 0 ? { procChase: procs } : {}),
      ...(job.variantOf ? { variantOf: job.variantOf } : {}),
      notes: [...modNotes].sort(),
    };
    targetList.push(generated);
    if (job.variantOf) {
      const containerFormId = records.find((r) => r.editor_id === job.variantOf)?.header.form_id;
      if (containerFormId) {
        (variantContainers[containerFormId] ??= []).push(generated);
      }
    }
  }

  await attachWellTunedKeywordHooks(client, omods, mgefDeps, notes);

  // Obtainability derivation (see extract-weapons.ts for the flag semantics:
  // failures stay in the data as obtainable:false for app-side hiding/rescue).
  // One classifier + one classify() call over BOTH weapon and armor OMODs
  // together (armor OMODs additionally ride on obtainableArmorFormIds via the
  // ARMO branch in obtainability.ts, parallel to the WEAP branch).
  const classifier = new ObtainabilityClassifier(
    client,
    obtainableWeaponFormIds,
    cobjIndex,
    obtainableArmorFormIds,
  );
  const allOmods = [...omods, ...armorOmods];
  const verdicts = await classifier.classify(
    allOmods.map((o) => ({ formId: o.formId, edid: o.id })),
  );
  const excludedDetailed: Record<string, ExcludedRecordDetail[]> = { omodUnobtainable: [] };
  const reviewFlagged: Record<string, ExcludedRecordDetail[]> = {
    omodWeakEvidence: [],
    omodUnnamedTemplateMember: unnamedTemplateMembers,
  };
  for (const omod of allOmods) {
    const verdict = verdicts.get(omod.formId);
    let obtainable = verdict?.obtainable ?? false;
    let signals = verdict?.signals;
    // Legendary-crafting mods need a real granting recipe (see
    // LEGENDARY_CRAFT_KEYWORD_RE) — template/FLST rides alone don't count.
    if (
      obtainable &&
      !omod.hasGrantingCobj &&
      omod.targetKeywords.some((k) => LEGENDARY_CRAFT_KEYWORD_RE.test(k))
    ) {
      obtainable = false;
      signals = [...(signals ?? []), 'legendaryNoGrantCobj'];
    }
    omod.obtainable = obtainable;
    if (!omod.obtainable) {
      (excluded.omodUnobtainable ??= []).push(omod.id);
      excludedDetailed.omodUnobtainable.push({ id: omod.id, name: omod.name, signals });
    } else if (
      isWeakEvidence(verdict?.signals ?? []) &&
      !defaultModFormIds.has(omod.formId) &&
      !NON_CRAFT_SLOT_RE.test(omod.attachPointEdid)
    ) {
      reviewFlagged.omodWeakEvidence.push({
        id: omod.id,
        name: omod.name,
        signals: verdict?.signals,
      });
    }
  }

  // Power-armor-exclusive armor OMODs (attach point prefix `ap_PowerArmor*`)
  // aren't gated in the ESM itself — PA-exclusivity is expressed structurally
  // via the attach point / Target OMOD Keywords, not a perk condition — so the
  // app supplies the gate here. General rule, not special-cased to any one
  // mod: verified 2026-08-03 that no visible armor-effect NAME GROUP mixes a
  // non-PA and a PA record (armor-modifiers.ts dedupes OMODs by display name
  // and picks one alphabetical representative per group — if a group ever
  // mixed variants, gating only the PA ones here could under- or over-gate the
  // group's representative; today it can't happen).
  for (const omod of armorOmods) {
    if (!omod.attachPointEdid.startsWith('ap_PowerArmor')) continue;
    for (const m of omod.modifiers) {
      m.conditions.push({ kind: 'inPowerArmor', value: true });
    }
  }

  omods.sort((a, b) => a.id.localeCompare(b.id));
  armorOmods.sort((a, b) => a.id.localeCompare(b.id));
  return {
    omods,
    armorOmods,
    variantContainers,
    excluded,
    excludedDetailed,
    reviewFlagged,
    unknownProperties: [...unknownProperties].sort(),
    notes: [...notes],
  };
}
