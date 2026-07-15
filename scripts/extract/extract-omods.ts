import type { ExcludedRecordDetail, GeneratedOmod } from '../../src/types/generated';
import type { Bucket, Modifier } from '../../src/types/modifiers';
import { EsmClient, mapPool, type EsmRecord } from './esm-client';
import {
  FALLBACK_AVIF_ROUTES,
  buildAvifRoutes,
  translateEnchantment,
  translateGrantedPerk,
  type AvifRoute,
  type MgefTranslationDeps,
} from './normalize/mgef';
import { translateConditions } from './normalize/conditions';
import { DAMAGE_TYPE_EDID_MAP, decodeExplosionDamage, projectileExplosionFormId } from './normalize/explosion';
import { ObtainabilityClassifier } from './obtainability';
import { CobjIndex, emptyCobjIndex, isNonGrantingCobj } from './cobj-index';

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
 * ActorValues OMOD property → bucket (resolved AV edid → mapping). Anti-Armor
 * carries `ActorValues ADD ArmorPenetration 50.0` — the value lives on the
 * OMOD property, NOT its enchantment. Unmapped AVs are reported so the map
 * grows deliberately.
 *
 * Unique-mod rework AVs resolved but deliberately left OUT of this map
 * (2026-07-13 — they fall through to the "ActorValues on X — unmapped" note
 * below instead):
 * - Final Word's 0x00924DB9 → `EnableAmmoSpenderOnKill`, an AVIF flagged
 *   "Boolean" (a plain enable flag), not a stack counter — doesn't fit
 *   `bulletStorm`'s StackCounter semantics.
 * - Old Guard's 0x007ACE76 → `STAT_DeflectChance` ("Deflect Chance") — a
 *   defensive/dodge stat; no formula bucket models deflect chance.
 * - The Fixer's 0x00183312 / 0x00245BEB → `ArmorShadowHide` ("Stealth in
 *   Shadows") / `Mod_StealthMove_AV` ("Sneaking Speed") — sneak-detection
 *   stats, non-damage.
 */
const ACTOR_VALUE_BUCKETS: Record<string, { bucket: Bucket; scale: number }> = {
  ArmorPenetration: { bucket: 'armorPen', scale: 0.01 }, // 50.0 ⇒ 0.5 (inert until enemy DR lands)
  // All Rise (unique-mod rework, 2026-07-13): flat Health ADD +50. Same
  // bucket/scale as mgef.ts's HealthBonus route (Lifegiver's) — the OMOD
  // carries the value directly on this property instead of an MGEF Peak
  // Value Modifier, but the semantics (flat max-HP points) are identical.
  Health: { bucket: 'maxHealth', scale: 1 },
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
};

/** Property names that never affect the damage formula — skipped without reporting. */
const PROPERTY_IGNORED = new Set([
  'Weight', 'Value', 'Health', 'Ammo', 'Reach', 'MinRange', 'MaxRange',
  'AimModelBaseStability', 'AimModelRecoilMaxDegPerShot',
  // NOTE: 'AttackDamage' and 'DamageTypeValues' are handled explicitly below
  // (they scale component base damage), not ignored.
  'AimModelRecoilMinDegPerShot', 'AimModelRecoilArcDeg', 'AimModelRecoilArcRotateDeg',
  'AimModelConeIronSightsMultiplier', 'AimModelMinConeDegrees', 'AimModelMaxConeDegrees',
  'AimModelConeSneakMultiplier', 'AimModelConeIncreasePerShot', 'AimModelConeDecreasePerSec',
  'ZoomDataFOVMult', 'ZoomDataOverlay', 'ZoomDataIsModFormID', 'HitBehavior', 'Rank',
  'ColorRemappingIndex', 'MaterialSwaps', 'ModelSection', 'SoundLevel', 'NPCsUseAmmo',
  'AttackDelaySec', 'OutOfRangeDamageMult', 'ActionPointCost', 'FullPowerSeconds',
  'MinPowerPerShot', 'Stagger', 'SightedTransitionSeconds', 'AccuracyBonus',
  'HasScope', 'BoltAction', 'BashImpactDataSet', 'BlockMaterial', 'EnableMarts',
  'VerticalRecoilMult', 'HorizontalRecoilMult', 'ConditionDamageScale', 'DisableSighted',
  'AimAssistModel', 'AimModel', 'AimModelConeDecreaseDelayMs',
  'AimModelRecoilDiminishSightsMult', 'AimModelRecoilDiminishSpringForce', 'AimModelRecoilHipMult',
  'AimModelRecoilShotsForRunaway', 'AmmoConsumption', 'AttackSound', 'CritEffect', 'Durability',
  'EquipSlot', 'EquipSound', 'FastEquipSound', 'HasAlternateRumble', 'HasRepeatableSingleFire',
  'HitBehaviour', 'HoldInputToPower', 'IdleSound', 'ImpactDataSet', 'MinWeaponDrawTime',
  'ModelSwap', 'NPCAmmoList', 'OverheatRateDown', 'OverheatRateUp',
  // NOTE: 'OverrideProjectile' is handled explicitly below (Lobber Barrel /
  // Polar Lobber launcher-hazard chase), not ignored.
  'SecondaryDamage', 'SoundTagSet', 'UnEquipSound', 'Unknown', 'UnsightedTransitionSeconds',
  'WeightMult', 'ZoomData', 'ZoomDataCameraOffsetX', 'ZoomDataCameraOffsetY', 'ZoomDataCameraOffsetZ',
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
// chasing Splinter's Onslaught contribution (dps-todos/onslaught.md).
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

export type OmodRecordExclusion = 'notWeaponMod' | 'authoringTemplate' | 'junkEdid' | 'unnamed';

/**
 * Structural exclusion classifier shared by the omods pass (`named` filter
 * below) and the attach-point grant index (ap-grant-index.ts) — ONE list so
 * shape/prefix rules can't drift between consumers (the p62_/sdow_ incidents
 * above are exactly that failure mode).
 * - 'notWeaponMod': Form Type ≠ Weapon (armor/power-armor mods).
 * - 'authoringTemplate': _PARENT_ records / "TEMPLATE:"-named — carry the
 *   stats real mods include via their Includes chain; never equippable.
 * - 'junkEdid': dev/dead-record prefixes (checked BEFORE 'unnamed' so a
 *   nameless zzz_/cut_ record classifies as junk, never as merely unnamed).
 * - 'unnamed': no display Name. Not emitted as a picker mod, but a weapon
 *   template may legitimately include one, so the grant index keeps these
 *   as seed-only entries.
 */
export function classifyOmodRecordExclusion(record: EsmRecord): OmodRecordExclusion | null {
  const data = omodData(record);
  const formType = ((data['Form Type'] as Record<string, unknown>)?.['name'] as string) ?? '';
  if (formType !== 'Weapon') return 'notWeaponMod';
  if (record.editor_id.startsWith('_PARENT_')) return 'authoringTemplate';
  if (isExcludedOmodEdid(record.editor_id)) return 'junkEdid';
  if (!record.fields['Name']) return 'unnamed';
  if ((record.fields['Name'] as string).startsWith('TEMPLATE')) return 'authoringTemplate';
  return null;
}

interface RawProperty {
  functionType: 'SET' | 'MUL_ADD' | 'ADD' | string;
  property: string;
  value1: unknown;
  value2: unknown;
  /** When a property carries a curve table, the curve OVERRIDES the hardcoded value (user-confirmed). */
  hasCurveTable: boolean;
  /** Inline curve points (Y by item level) when the curve table parses — feeds itemLevel-input curve modifiers. */
  curvePoints: Array<{ x: number; y: number }> | null;
}

/**
 * Property values that arrive as a bare number instead of the usual
 * `{value,name}` join (verified 2026-07-13 on mod_Custom_UnstoppableMonster /
 * WhistleInTheDark / SoleSurvivor): 116 = "attach this PERK to the wielder"
 * (Value 1 = PERK formid, Value 2 = 1, ADD — the unique-mod rework's
 * mechanism for granting a perk from gear, decoded below as 'AttachedPerk').
 * Other raw numbers are unmapped today.
 */
const RAW_NUMERIC_PROPERTIES: Record<number, string> = {
  116: 'AttachedPerk',
};

/**
 * Exposed for tests: resolve a raw `Property` field to its name. Named
 * properties (`{value,name}`) pass through unchanged; unmapped raw numbers
 * become `Property#<n>` so they surface in `unknownProperties` instead of
 * collapsing into the 'Unknown' bucket (which used to also catch genuinely
 * nameless properties — see PROPERTY_IGNORED).
 */
export function propertyName(raw: unknown): string {
  if (typeof raw === 'number') return RAW_NUMERIC_PROPERTIES[raw] ?? `Property#${raw}`;
  const named = (raw as Record<string, unknown> | null | undefined)?.['name'];
  return typeof named === 'string' ? named : 'Unknown';
}

function parseProperties(data: Record<string, unknown>): RawProperty[] {
  const props = data['Properties'];
  if (!Array.isArray(props)) return [];
  return (props as Array<Record<string, unknown>>).map(p => {
    const curveNode = p['Curve Table'] as { curve?: Array<{ x: number; y: number }> } | null | undefined;
    return {
      functionType: (((p['Function Type'] as Record<string, unknown>)?.['name'] as string) ?? 'SET').replace('MUL+ADD', 'MUL_ADD'),
      property: propertyName(p['Property']),
      value1: p['Value 1'],
      value2: p['Value 2'],
      hasCurveTable: p['Curve Table'] != null,
      curvePoints: Array.isArray(curveNode?.curve) && curveNode.curve.length > 0 ? curveNode.curve : null,
    };
  });
}

function omodData(record: EsmRecord): Record<string, unknown> {
  return (record.fields['Data'] ?? {}) as Record<string, unknown>;
}

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

function includeFormIds(data: Record<string, unknown>): string[] {
  const includes = data['Includes'];
  if (!Array.isArray(includes)) return [];
  return (includes as Array<Record<string, unknown>>)
    .map(i => i['Mod'])
    .filter((m): m is string => typeof m === 'string');
}

/** Obtainability signals that PROVE access (vs informational ones like
 *  npcOnly/noGrantCobj/cobjScrapUnproven) — see obtainability.ts classifyOne. */
const PROVING_SIGNAL_RE = /^(cobj|cobjBook|cobjScrap|gmrw|lgdi|qust|cont|misc|flst|reso|lvli|alch|weap|omod):/;
/** The inherited subset of proofs: the record rides along on its weapon (or a
 *  mod collection) without any recipe/drop/reward of its own. */
const INHERITED_SIGNAL_RE = /^(weap|omod):/;

function isWeakEvidence(signals: string[]): boolean {
  const proofs = signals.filter(s => PROVING_SIGNAL_RE.test(s));
  return proofs.length > 0 && proofs.every(s => INHERITED_SIGNAL_RE.test(s));
}

/** Slots whose mods legitimately have no recipe or drop of their own
 *  (identity/paint/legendary parts, granted with the weapon) — inherited-only
 *  evidence is normal there, so they stay out of the weak-evidence queue. */
const NON_CRAFT_SLOT_RE = /appearance|paint|skin|customname|item_description|material|legendary/i;

/**
 * Legendary-crafting mods (target keyword ma_legendarycrafting_weapon /
 * _weaponranged / _weaponmelee / ma_Misc_Legendarycrafting_Weapon_*4) are
 * obtained by crafting/learning a real recipe — a bare weapon-template ride is
 * NOT a grant path for them. `hasGrantingCobj` is the exact positive signal:
 * every shipped legendary mod's co_mod_* COBJ has the OMOD as its Created
 * Object; the unfinished "Locked" (mod_Legendary_Weapon4_Guns_Locked) instead
 * has a shell COBJ that produces nothing and stays obtainable only by riding
 * HuntingRifle's template. Gated in the verdict loop below (2026-07-15);
 * the generic classifier's WEAP-ride rule stays correct for non-legendary mods.
 */
const LEGENDARY_CRAFT_KEYWORD_RE = /legendarycrafting_weapon/i;

export interface ExtractOmodsResult {
  omods: GeneratedOmod[];
  excluded: Record<string, string[]>;
  excludedDetailed: Record<string, ExcludedRecordDetail[]>;
  /** Kept-but-weakly-evidenced records (see GeneratedMeta.reviewFlagged). */
  reviewFlagged: Record<string, ExcludedRecordDetail[]>;
  unknownProperties: string[];
  notes: string[];
}

export async function extractOmods(
  client: EsmClient,
  /** Formids of obtainable weapons (from the weapons pass) — an OMOD referenced by one rides along. */
  obtainableWeaponFormIds: ReadonlySet<string>,
  /** See ExtractWeaponsResult.explosiveFamilyKeywords (extract-weapons.ts) — gates the OverrideProjectile chase. */
  explosiveFamilyKeywords: ReadonlySet<string> = new Set(),
  /** Forward COBJ index (buildCobjIndex) — learn-method-aware obtainability + hasGrantingCobj. */
  cobjIndex: CobjIndex = emptyCobjIndex(),
  /** Union of every weapon's defaultModFormIds — a default part is never flagged weak-evidence. */
  defaultModFormIds: ReadonlySet<string> = new Set(),
  /** Union of every weapon's templateModFormIds — rescues unnamed effect mods a template ships (Holy Fire). */
  templateModFormIds: ReadonlySet<string> = new Set()
): Promise<ExtractOmodsResult> {
  const rows = await client.list('OMOD');
  const records = await mapPool(rows, 8, r => client.get(r.form_id));
  const byFormId = new Map(records.map(r => [r.header.form_id, r]));

  const unknownProperties = new Set<string>();
  const notes = new Set<string>();

  // Legendary effects carry their stats via ADD Enchantments → ENCH → MGEF.
  const routePool = new Set<string>();
  const avifRoutes: Map<string, AvifRoute[]> = await buildAvifRoutes(client, routePool);
  const edidByFormId = new Map<string, string>();
  for (const id of routePool) edidByFormId.set(id, await client.resolveEdid(id));

  const mgefDeps: MgefTranslationDeps = { client, routes: avifRoutes, edidByFormId, timedIsActive: true, noteUnroutedAvs: true };

  async function enchantmentModifiers(
    enchFormId: string,
    source: Modifier['source'],
    into: Modifier[],
    modNotes: Set<string>
  ): Promise<void> {
    const { modifiers, notes } = await translateEnchantment(mgefDeps, enchFormId);
    notes.forEach(n => modNotes.add(n));
    for (const fragment of modifiers) {
      into.push({ id: `${source.formId}:ench:${into.length}`, source, ...fragment });
    }
  }

  /**
   * OMOD `OverrideProjectile` chase (Lobber Barrel / Polar Lobber): PROJ
   * (require the Explosion flag — the same gate `chaseExplosion`,
   * extract-weapons.ts, uses) → EXPL's own direct damage (typed "Damage
   * Types" — a launcher-style payload the barrel itself deals; the Lobber's
   * own EXPL carries none, a dead end) PLUS the new hop this OMOD chase adds:
   * EXPL "Placed Object" → HAZD → HAZD.Effect (SPEL) → Damage-archetype MGEF
   * magnitude/curve/damage-type, landed as `dotDamage` (docs/assumptions.md
   * "OMOD-chased launcher payloads" — the HAZD's Target Interval/tick
   * semantics are folded into the engine's existing refresh-only DoT
   * convention, not separately modeled). `durationSec` is overridden with the
   * HAZD's own Lifetime (how long the lingering field persists) rather than
   * the SPEL's own per-tick Effect Item Data duration — inert metadata either
   * way (Modifier.durationSec is not read by the engine today), but Lifetime
   * is the more honest "how long this dot-like field lasts" reading.
   *
   * The overwhelming majority of the 154 weapon OMODs carrying
   * OverrideProjectile are cosmetic (suppressors, focusers) whose PROJ/EXPL
   * carry no damage — this chase must materialize nothing for those, with at
   * most one note when a chased PROJ has the Explosion flag but no decodable
   * damage.
   */
  async function overrideProjectileModifiers(
    projFormId: string,
    source: Modifier['source'],
    into: Modifier[],
    modNotes: Set<string>,
    targetsExplosiveFamily: boolean
  ): Promise<void> {
    const unresolved: string[] = [];
    let explFormId: string | null;
    try {
      explFormId = await projectileExplosionFormId(client, projFormId);
    } catch (err) {
      modNotes.add(`OverrideProjectile ${projFormId}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (!explFormId) return; // no Explosion flag / no Explosion formid — cosmetic mod, nothing to chase.

    let expl: EsmRecord;
    try {
      expl = await client.get(explFormId);
    } catch {
      modNotes.add(`OverrideProjectile explosion ${explFormId} not found`);
      return;
    }
    const decoded = await decodeExplosionDamage(client, expl, unresolved);
    unresolved.forEach(u => modNotes.add(u));

    const explData = (expl.fields['Data'] ?? {}) as Record<string, unknown>;
    const hazdFormId = explData['Placed Object'] as string | null;
    const hasHazard = !!hazdFormId && hazdFormId !== '0x00000000';
    const hasDirectDamage =
      decoded.main != null || decoded.typed.some(t => t.damageType !== 'unknown' && (t.curve || t.amount > 0));

    if (targetsExplosiveFamily) {
      // This OMOD targets a weapon family that already carries its own
      // fromExplosion component (the Hellstorm Missile Launcher's
      // Napalm/Cryo/Plasma tube barrels, verified 2026-07-14): swapping the
      // projectile here doesn't replace that baseline (chaseExplosion is a
      // WEAP-level, barrel-agnostic fact — a documented, pre-existing gap,
      // "OMOD projectile overrides swapping the explosion... not modeled" in
      // chaseExplosion's own doc comment) — materializing this OMOD's own
      // damage would ADD to the stale baseline rather than replace it. Stays
      // note-only, same as the no-hazard cosmetic case, regardless of
      // whether a hazard exists (docs/assumptions.md "OMOD-chased launcher
      // payloads").
      if (hasDirectDamage || hasHazard) {
        modNotes.add(
          `EXPL ${expl.editor_id} targets a weapon that already has its own launcher explosion — not modeled (docs/assumptions.md "OMOD-chased launcher payloads")`
        );
      }
      return;
    }

    // A "Placed Object" (HAZD) hop is the signal that this is a genuine
    // payload CONVERSION (Lobber-family: the barrel replaces the weapon's
    // firing mode with a lobbed explosive that leaves a lingering hazard),
    // not a coincidental OverrideProjectile use — verified 2026-07-14:
    // Cremator's flame-color Receiver mods (Chemical_BlueFire/GreenFire/
    // PinkFire) EACH carry their own re-skinned fireball-impact EXPL with the
    // SAME tier-13 typed fire damage as the base RedFire/default color (whose
    // own EXPL carries none), no Placed Object on any of them — a purely
    // cosmetic VFX re-skin (Cremator's chemical colors are cosmetic in-game)
    // that would otherwise silently double the Cremator's fire damage for 3
    // of its 4 color choices. Direct EXPL damage is therefore only
    // materialized when a hazard ALSO exists; without one it's noted (when
    // non-zero) rather than silently dropped or guessed at, and the hazard
    // chase below is naturally skipped too since there is none.
    if (!hasHazard) {
      if (hasDirectDamage) {
        modNotes.add(
          `EXPL ${expl.editor_id} carries direct damage with no Placed Object hazard — not modeled (docs/assumptions.md "OMOD-chased launcher payloads")`
        );
      }
      return;
    }

    // EXPL's own direct typed damage (Polar Lobber's cryo impact) — an
    // instant, dbm-scaled hit, same shape as DamageTypeValues/AttackDamage.
    for (const entry of decoded.typed) {
      if (entry.damageType === 'unknown' || !(entry.curve || entry.amount > 0)) continue;
      into.push({
        id: `${source.formId}:${into.length}`,
        source,
        bucket: 'baseDamage',
        op: 'ADD',
        curve: { input: 'itemLevel', points: entry.curve ?? [{ x: 1, y: entry.amount }] },
        curveScale: 1,
        conditions: [{ kind: 'damageTypeScope', types: [entry.damageType] }],
      });
    }
    if (decoded.baseWeaponDamageMult > 0) {
      // No OMOD-level route exists for "Base Weapon Damage Mult" (the
      // existing `explosivePayload` mechanic is a WEAPON-field base, not an
      // OMOD modifier target) — extracted but deliberately not modeled;
      // flagged for a follow-up decision rather than silently dropped or
      // guessed at (docs/assumptions.md "OMOD-chased launcher payloads").
      modNotes.add(
        `EXPL ${expl.editor_id} Base Weapon Damage Mult ${decoded.baseWeaponDamageMult} — not modeled`
      );
    }

    // NEW hop: the lingering hazard field's own tick damage.
    let hazd: EsmRecord;
    try {
      hazd = await client.get(hazdFormId!);
    } catch {
      modNotes.add(`OverrideProjectile hazard ${hazdFormId} not found`);
      return;
    }
    const hazdData = (hazd.fields['Data'] ?? {}) as Record<string, unknown>;
    const lifetime = typeof hazdData['Lifetime'] === 'number' ? (hazdData['Lifetime'] as number) : undefined;
    const spelFormId = hazdData['Effect'] as string | null;
    if (!spelFormId || spelFormId === '0x00000000') return;

    const { modifiers: hazardFragments, notes: hazardNotes } = await translateEnchantment(mgefDeps, spelFormId);
    hazardNotes.forEach(n => modNotes.add(n));
    for (const fragment of hazardFragments) {
      into.push({
        id: `${source.formId}:${into.length}`,
        source,
        ...fragment,
        ...(fragment.bucket === 'dotDamage' && lifetime !== undefined ? { durationSec: lifetime } : {}),
      });
    }
  }

  /** Recursively collect properties from an OMOD and its include chain. */
  function collectProperties(formId: string, seen: Set<string>): RawProperty[] {
    if (seen.has(formId)) return [];
    seen.add(formId);
    const record = byFormId.get(formId);
    if (!record) return [];
    const data = omodData(record);
    const own = parseProperties(data);
    const inherited = includeFormIds(data).flatMap(id => collectProperties(id, seen));
    // Parents first: a child's SET should win over an included parent's.
    return [...inherited, ...own];
  }

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
  const IDENTITY_ATTACH_POINTS = new Set([
    '0x0047A264', // ap_customName
    '0x00521926', // ap_Item_Description
  ]);
  const unnamedTemplateMembers: ExcludedRecordDetail[] = [];
  const named = records.filter(r => {
    const exclusion = classifyOmodRecordExclusion(r);
    if (exclusion === 'junkEdid') excluded.omodJunkEdid.push(r.editor_id);
    if (exclusion === 'unnamed') {
      const data = omodData(r);
      const props = data['Properties'];
      if (!templateModFormIds.has(r.header.form_id) || !Array.isArray(props) || props.length === 0) return false;
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

  const omods: GeneratedOmod[] = [];
  for (const record of named) {
    const data = omodData(record);
    const attachPoint = (data['Attach Point'] as string) ?? null;
    if (!attachPoint) continue;

    const targetKeywords = await Promise.all(
      (Array.isArray(record.fields['Target OMOD Keywords']) ? (record.fields['Target OMOD Keywords'] as string[]) : []).map(
        k => client.resolveEdid(k)
      )
    );
    // Targets a weapon family that already carries its own fromExplosion
    // component (a launcher — see ExtractWeaponsResult.explosiveFamilyKeywords'
    // doc comment): the OverrideProjectile chase must stay note-only for these,
    // since it would materialize damage ALONGSIDE the weapon's now-stale
    // baseline explosion rather than replacing it.
    const targetsExplosiveFamily = targetKeywords.some(k => explosiveFamilyKeywords.has(k));

    const properties = collectProperties(record.header.form_id, new Set());
    const modifiers: Modifier[] = [];
    const addedKeywords: string[] = [];
    const modNotes = new Set<string>();
    let hasEnchantments = false;
    const source: Modifier['source'] = {
      kind: 'omod',
      formId: record.header.form_id,
      edid: record.editor_id,
      name: omodDisplayName(record),
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
            await enchantmentModifiers(prop.value1, source, modifiers, modNotes);
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
            await overrideProjectileModifiers(prop.value1, source, modifiers, modNotes, targetsExplosiveFamily);
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
          const result = await translateGrantedPerk(
            { client, routes: avifRoutes, edidByFormId, timedIsActive: true, noteUnroutedAvs: true },
            record.editor_id,
            prop.value1
          );
          result.notes.forEach(n => modNotes.add(n));
          for (const fragment of result.modifiers) {
            modifiers.push({ id: `${record.header.form_id}:perk:${modifiers.length}`, source, ...fragment });
          }
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
          const op = prop.functionType === 'MUL_ADD' ? ('MUL_ADD' as const) : ('ADD' as const);
          const pushAv = (bucket: Bucket, scale: number, conditions: Modifier['conditions']) => {
            modifiers.push(
              curvePoints
                ? {
                    id: `${record.header.form_id}:${modifiers.length}`, source, bucket, op,
                    curve: { input: 'itemLevel', points: curvePoints }, curveScale: scale, conditions,
                  }
                : {
                    id: `${record.header.form_id}:${modifiers.length}`, source, bucket, op,
                    value: flatValue * scale, conditions,
                  }
            );
          };
          // 1) Plumbing-perk routes (STAT_DamageVsPerk & co.) — bucket, scale,
          //    AND conditions (enemy-type gates) are data-driven, same as the
          //    MGEF path. This is how the DmgVs* legendary family feeds dbm.
          const plumbed = avifRoutes.get(prop.value1);
          const fallback = FALLBACK_AVIF_ROUTES[avEdid];
          const avMapping = ACTOR_VALUE_BUCKETS[avEdid];
          if (plumbed) {
            for (const route of plumbed) {
              const { conditions, unresolved } = translateConditions(route.rawConditions, { edidByFormId });
              if (conditions === null) continue;
              unresolved.forEach(u => modNotes.add(`route(${avEdid}): ${u}`));
              pushAv(route.bucket, route.scale, conditions);
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
          const conditions: Modifier['conditions'] = [{ kind: 'damageTypeScope', types: ['ballistic'] }];
          modifiers.push(
            curved
              ? {
                  id: `${record.header.form_id}:${modifiers.length}`, source, bucket: 'baseDamage', op,
                  curve: { input: 'itemLevel', points: prop.curvePoints! }, curveScale: 1, conditions,
                }
              : {
                  id: `${record.header.form_id}:${modifiers.length}`, source, bucket: 'baseDamage', op,
                  value: prop.value1 as number, conditions,
                }
          );
        } else if (prop.hasCurveTable && !curved) {
          modNotes.add(`AttackDamage carries an unparsed curve table — not modeled`);
        } else {
          modNotes.add(`AttackDamage ${prop.functionType} with value ${JSON.stringify(prop.value1)} — unhandled`);
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
          if (damageType && damageType !== 'unknown' && (curved || typeof prop.value2 === 'number')) {
            const op =
              prop.functionType === 'SET' ? ('SET' as const) :
              prop.functionType === 'MUL_ADD' ? ('MUL_ADD' as const) :
              ('ADD' as const);
            const conditions: Modifier['conditions'] = [{ kind: 'damageTypeScope', types: [damageType] }];
            modifiers.push(
              curved
                ? {
                    id: `${record.header.form_id}:${modifiers.length}`, source, bucket: 'baseDamage', op,
                    curve: { input: 'itemLevel', points: prop.curvePoints! }, curveScale: 1, conditions,
                  }
                : {
                    id: `${record.header.form_id}:${modifiers.length}`, source, bucket: 'baseDamage', op,
                    value: prop.value2 as number, conditions,
                  }
            );
          } else {
            modNotes.add(`DamageTypeValues ${prop.functionType} on unmapped type ${dtEdid}`);
          }
        } else {
          modNotes.add(`DamageTypeValues ${prop.functionType} with non-formid value1 ${JSON.stringify(prop.value1)} — unhandled`);
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
        const op = prop.functionType === 'SET' ? 'SET' : prop.functionType === 'MUL_ADD' ? 'MUL_ADD' : 'ADD';
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
      } else if (prop.value1 && typeof prop.value1 === 'object' && 'value' in (prop.value1 as object)) {
        value = ((prop.value1 as Record<string, unknown>)['value'] as number) ?? 0;
      } else {
        notes.add(`${record.editor_id}: ${prop.property} has non-numeric value`);
        continue;
      }

      const op = prop.functionType === 'SET' ? 'SET' : prop.functionType === 'MUL_ADD' ? 'MUL_ADD' : 'ADD';
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
      c => !isNonGrantingCobj(c, c.edid)
    );
    omods.push({
      id: record.editor_id,
      formId: record.header.form_id,
      name: omodDisplayName(record),
      description: (record.fields['Description'] as string) ?? '',
      attachPointFormId: attachPoint,
      attachPointEdid: await client.resolveEdid(attachPoint),
      targetKeywords,
      modifiers,
      addedKeywords,
      hasEnchantments,
      ...(hasGrantingCobj ? { hasGrantingCobj } : {}),
      notes: [...modNotes].sort(),
    });
  }

  // Obtainability derivation (see extract-weapons.ts for the flag semantics:
  // failures stay in the data as obtainable:false for app-side hiding/rescue).
  const classifier = new ObtainabilityClassifier(client, obtainableWeaponFormIds, cobjIndex);
  const verdicts = await classifier.classify(omods.map(o => ({ formId: o.formId, edid: o.id })));
  const excludedDetailed: Record<string, ExcludedRecordDetail[]> = { omodUnobtainable: [] };
  const reviewFlagged: Record<string, ExcludedRecordDetail[]> = {
    omodWeakEvidence: [],
    omodUnnamedTemplateMember: unnamedTemplateMembers,
  };
  for (const omod of omods) {
    const verdict = verdicts.get(omod.formId);
    let obtainable = verdict?.obtainable ?? false;
    let signals = verdict?.signals;
    // Legendary-crafting mods need a real granting recipe (see
    // LEGENDARY_CRAFT_KEYWORD_RE) — template/FLST rides alone don't count.
    if (obtainable && !omod.hasGrantingCobj && omod.targetKeywords.some(k => LEGENDARY_CRAFT_KEYWORD_RE.test(k))) {
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
      reviewFlagged.omodWeakEvidence.push({ id: omod.id, name: omod.name, signals: verdict?.signals });
    }
  }

  omods.sort((a, b) => a.id.localeCompare(b.id));
  return { omods, excluded, excludedDetailed, reviewFlagged, unknownProperties: [...unknownProperties].sort(), notes: [...notes] };
}
