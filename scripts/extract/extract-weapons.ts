import type { ExcludedRecordDetail, GeneratedDamageComponent, GeneratedWeapon } from '../../src/types/generated';
import type { Modifier } from '../../src/types/modifiers';
import { isOmodEligibleForWeapon } from '../../src/data/omod-eligibility';
import { type ApGrantEntry, type ApGrantIndex, emptyApGrantIndex } from './ap-grant-index';
import { EsmClient, mapPool, type EsmRecord } from './esm-client';
import { asNumber, DAMAGE_TYPE_EDID_MAP, decodeExplosionDamage, parseCurve, projectileExplosionFormId } from './normalize/explosion';
import { buildAvifRoutes, translateEnchantment, type AvifRoute } from './normalize/mgef';
import { ObtainabilityClassifier } from './obtainability';

export { DAMAGE_TYPE_EDID_MAP };

// EDID patterns for records that are never player weapons (creature attacks,
// deleted/deprecated content, turrets, event-NPC gear...). This is only a
// cheap pre-filter — real gating is the obtainability derivation below.
// The creature prefix is 'cr' followed by an uppercase letter and must stay
// case-SENSITIVE: plain prefix matching would swallow 'crossbow'.
// Stragglers are handled per-edid in src/data/overrides/corrections.ts.
// atx_ (Atomic Shop) is deliberately NOT excluded: shop weapons players can
// own are real picker entries — obtainability derivation gates them
// per-record instead (user decision, 2026-07-10 review).
const EXCLUDED_EDID_PATTERNS = [
  /^zzz/i, /^del_/i, /^deleted/i, /^deprecated/i, /^cr[^a-z]/, /^hto_/i, /^xpd_/i,
  /^post_/i, /^test/i, /^debug/i, /^gastrap/i, /^workshopturret/i,
  /^trapturret/i, /^mtnm/i, /^survival_/i, /NONPLAYABLE/i,
];

/** Exposed for tests: does the pre-filter drop this editor_id? */
export function isExcludedWeaponEdid(edid: string): boolean {
  return EXCLUDED_EDID_PATTERNS.some(p => p.test(edid));
}

interface ExtractWeaponsResult {
  weapons: GeneratedWeapon[];
  excluded: Record<string, string[]>;
  excludedDetailed: Record<string, ExcludedRecordDetail[]>;
  unresolved: string[];
  /** Formids of obtainable weapons — feeds the OMOD obtainability pass. */
  obtainableFormIds: Set<string>;
  /**
   * Keywords of every weapon that already carries its OWN `fromExplosion`
   * component (chaseExplosion, weapon-level — launcher families: Missile
   * Launchers, Fat Man, Gamma Gun, ...). Feeds extract-omods.ts's
   * `OverrideProjectile` chase: a barrel/receiver OMOD targeting one of these
   * keywords swaps WHICH projectile such a weapon fires — its own EXPL/HAZD
   * chase would materialize damage ALONGSIDE the weapon's now-stale baseline
   * fromExplosion component instead of replacing it (a pre-existing,
   * documented gap — chaseExplosion's own doc comment: "OMOD projectile
   * overrides swapping the explosion... not modeled"), so that chase must
   * stay note-only for these weapon families (docs/assumptions.md
   * "OMOD-chased launcher payloads"). Verified 2026-07-14 on the Hellstorm
   * Missile Launcher's Napalm/Cryo/Plasma tube barrels — unlike Lobber/Polar
   * Lobber (Lightning Gun/Cryolator are pure beam weapons with NO
   * fromExplosion component to conflict with).
   */
  explosiveFamilyKeywords: Set<string>;
}

/** Shared by extractWeapons() and run-all.ts's `--only omods`-without-weapons fallback. */
export function explosiveFamilyKeywordsOf(weapons: Pick<GeneratedWeapon, 'keywords' | 'components'>[]): Set<string> {
  const keywords = new Set<string>();
  for (const w of weapons) {
    if (w.components.some(c => c.fromExplosion)) {
      for (const kw of w.keywords) keywords.add(kw);
    }
  }
  return keywords;
}

async function buildComponents(
  client: EsmClient,
  fields: Record<string, unknown>,
  unresolved: string[]
): Promise<GeneratedDamageComponent[]> {
  const components: GeneratedDamageComponent[] = [];
  const data = (fields['Data'] ?? {}) as Record<string, unknown>;
  const baseDamage = asNumber(data['Base Damage']);
  const damageTypes = fields['Damage Types'];
  const typedEntries = Array.isArray(damageTypes) ? (damageTypes as Array<Record<string, unknown>>) : [];

  // Physical component semantics (user-confirmed against Fixer/MG42/Shishkebab/
  // plasma vs laser records): each component's damage = its own curve evaluated
  // at item level, and a physical component exists IFF the weapon has a main
  // "Damage Curve" — regardless of the legacy "Base Damage" field.
  //   Fixer/MG42/pickaxe: main curve, no typed entries → pure physical.
  //   Shishkebab: main curve + dtFire → phys + fire.
  //   Gatling Plasma: main curve (Base Damage 0!) + dtEnergy → phys + energy
  //   (all plasma weapons deal both; the energy entry reuses the same curve table).
  //   Laser Gun / Gatling Laser / Flamer: NO main curve → typed damage only.
  const mainCurve = parseCurve(fields['Damage Curve']);
  if (mainCurve.curve) {
    components.push({ damageType: 'ballistic', damageTypeEdid: null, amount: baseDamage, ...mainCurve });
  } else if (typedEntries.length === 0 && baseDamage > 0) {
    // Legacy flat-damage record with neither curve nor typed entries.
    components.push({ damageType: 'ballistic', damageTypeEdid: null, amount: baseDamage, tier: null, curve: null });
  }

  // Typed components (energy/fire/...): each entry carries its own curve.
  for (const entry of typedEntries) {
    const typeFormId = entry['Type'] as string;
    const edid = await client.resolveEdid(typeFormId);
    const damageType = DAMAGE_TYPE_EDID_MAP[edid];
    if (!damageType) unresolved.push(`damage type ${edid} (${typeFormId})`);
    const { tier, curve } = parseCurve(entry['Curve Table']);
    components.push({
      damageType: damageType ?? 'unknown',
      damageTypeEdid: edid,
      amount: asNumber(entry['Amount']),
      tier,
      curve,
    });
  }

  return components;
}

/**
 * Launcher explosion damage (docs/assumptions.md "Launcher explosion
 * damage"): the real
 * payload of Fat Man / Missile Launcher / grenade launchers / Broadsider /
 * Gamma Gun rides the projectile's EXPL record, not the WEAP (whose "Base
 * Damage" is a token 3–5 impact value). Chain: WEAP RGW3."Override
 * Projectile" (M79, Cremator, Hellstorm) ?? AMMO(Data.Ammo).DNAM.Projectile
 * → PROJ Data.Explosion → EXPL Data.
 *
 * The PROJ Data.Flags "Explosion" bit is the gate — several projectiles
 * carry a stale Explosion formid that never detonates (ProjectilePlasmaLarge
 * points at the missile-shell EXPL but lacks the flag; blanket-chasing
 * without it would give the Plasma Gun +968 phantom damage).
 *
 * EXPL damage mirrors the WEAP shape: a main "Damage Curve Table" (physical
 * explosion → damageType 'explosive') plus a typed "Damage Types" array
 * (Cremator's fire ball, Gamma Gun's radiation burst) — both emitted as
 * components flagged `fromExplosion` so the engine can apply explosion-only
 * modifiers (Demolition Expert) regardless of element. "Base Weapon Damage
 * Mult" (Gauss family: 0.15) is a fraction of the weapon's own damage dealt
 * again as explosion — returned separately and folded through the existing
 * `explosivePayload` twin mechanic rather than as a component.
 */
export interface ExplosionChaseResult {
  components: GeneratedDamageComponent[];
  baseWeaponDamageMult: number;
}

export async function chaseExplosion(
  client: EsmClient,
  fields: Record<string, unknown>,
  edid: string,
  unresolved: string[]
): Promise<ExplosionChaseResult> {
  const none: ExplosionChaseResult = { components: [], baseWeaponDamageMult: 0 };
  const rgw3 = (fields['RGW3'] ?? {}) as Record<string, unknown>;
  const data = (fields['Data'] ?? {}) as Record<string, unknown>;

  try {
    let projFormId = rgw3['Override Projectile'] as string | null;
    if (!projFormId) {
      const ammoFormId = data['Ammo'] as string | null;
      if (!ammoFormId || ammoFormId === '0x00000000') return none;
      const ammo = await client.get(ammoFormId);
      projFormId = ((ammo.fields['DNAM'] ?? {}) as Record<string, unknown>)['Projectile'] as string | null;
    }
    if (!projFormId || projFormId === '0x00000000') return none;

    const explFormId = await projectileExplosionFormId(client, projFormId);
    if (!explFormId) return none;

    const expl = await client.get(explFormId);
    const decoded = await decodeExplosionDamage(client, expl, unresolved);
    const components: GeneratedDamageComponent[] = [];

    // Main physical explosion damage (same node shape as WEAP "Damage Curve").
    if (decoded.main) {
      components.push({
        damageType: 'explosive',
        damageTypeEdid: null,
        amount: decoded.main.amount,
        tier: decoded.main.tier,
        curve: decoded.main.curve,
        fromExplosion: true,
      });
    }

    // Typed entries (Cremator fire, Gamma Gun radiation) — WEAP-identical shape.
    for (const entry of decoded.typed) {
      components.push({
        damageType: entry.damageType,
        damageTypeEdid: entry.damageTypeEdid,
        amount: entry.amount,
        tier: entry.tier,
        curve: entry.curve,
        fromExplosion: true,
      });
    }

    return { components, baseWeaponDamageMult: decoded.baseWeaponDamageMult };
  } catch (err) {
    unresolved.push(`explosion chase failed for ${edid}: ${err instanceof Error ? err.message : String(err)}`);
    return none;
  }
}

/**
 * Weapon-intrinsic on-hit enchantment chase (Cremator's built-in fire DoT,
 * bladed melee weapons' innate bleed, Shishkebab's burn+bleed, HarpoonGun's
 * bleed, ...): the WEAP record's own `Enchantment` field (distinct from an
 * OMOD's `Enchantments` property — extract-omods.ts's `enchantmentModifiers`)
 * chased through the SAME MGEF translation OMOD enchantments use
 * (`translateEnchantment`, normalize/mgef.ts), gated to Contact-delivery
 * enchantments — every WEAP.Enchantment reference in the 20260710 dump is
 * Contact/Fire-and-Forget (on-hit procs); a Self-delivery weapon enchantment
 * would be a permanent stat buff and is deliberately out of scope here.
 * Materialized onto GeneratedWeapon.modifiers, sourced `kind: 'weapon'` so
 * paper-damage.ts's `computeDotDps` can fold it as the intrinsic BASE an
 * OMOD's own dotDamage modifiers stack onto (or, via a SET override, replace
 * — docs/assumptions.md "Weapon-intrinsic DoT & OMOD replacement").
 */
export async function chaseWeaponEnchantment(
  client: EsmClient,
  fields: Record<string, unknown>,
  formId: string,
  edid: string,
  name: string,
  avifRoutes: Map<string, AvifRoute[]>,
  edidByFormId: Map<string, string>,
  unresolved: string[]
): Promise<Modifier[]> {
  const enchFormId = fields['Enchantment'] as string | null;
  if (!enchFormId || enchFormId === '0x00000000') return [];

  const { modifiers, notes, targetType } = await translateEnchantment(
    { client, routes: avifRoutes, edidByFormId, timedIsActive: true, noteUnroutedAvs: true },
    enchFormId
  );
  notes.forEach(n => unresolved.push(`${edid}: weapon enchantment: ${n}`));
  if (targetType !== 'Contact') return []; // Self/other-delivery weapon enchantments: out of scope (see doc comment above).

  const source: Modifier['source'] = { kind: 'weapon', formId, edid, name };
  return modifiers.map((f, i) => ({ id: `${formId}:weaponEnch:${i}`, source, ...f }));
}

/** One Object Template combination with its display name and raw include mod formids. */
export interface WeaponCombinationWalk {
  name: string;
  modFormIds: string[];
}

/** Walk every combination on a WEAP, retaining per-combo grouping (unlike flattenIncludes). */
export function walkWeaponCombinations(fields: Record<string, unknown>): WeaponCombinationWalk[] {
  const template = fields['Object Template'] as Record<string, unknown> | undefined;
  const combinations = template?.['Combinations'];
  if (!Array.isArray(combinations)) return [];
  const result: WeaponCombinationWalk[] = [];
  for (const combo of combinations as Array<Record<string, unknown>>) {
    const combination = combo['Combination'] as Record<string, unknown> | undefined;
    const item = combination?.['Object Mod Template Item'] as Record<string, unknown> | undefined;
    if (!item) continue;
    const name = typeof combination?.['Name'] === 'string' ? (combination['Name'] as string) : '';
    const modFormIds: string[] = [];
    const includes = item['Includes'];
    if (Array.isArray(includes)) {
      for (const inc of includes as Array<Record<string, unknown>>) {
        if (typeof inc['Mod'] === 'string') modFormIds.push(inc['Mod'] as string);
      }
    }
    result.push({ name, modFormIds });
  }
  return result;
}

function templateCombinationItems(fields: Record<string, unknown>): Array<Record<string, unknown>> {
  const template = fields['Object Template'] as Record<string, unknown> | undefined;
  const combinations = template?.['Combinations'];
  if (!Array.isArray(combinations)) return [];
  return (combinations as Array<Record<string, unknown>>)
    .map(
      combo =>
        (combo['Combination'] as Record<string, unknown> | undefined)?.['Object Mod Template Item'] as
          | Record<string, unknown>
          | undefined
    )
    .filter((item): item is Record<string, unknown> => item !== undefined);
}

function flattenIncludes(items: Array<Record<string, unknown>>): string[] {
  const modIds = new Set<string>();
  for (const item of items) {
    const includes = item['Includes'];
    if (!Array.isArray(includes)) continue;
    for (const inc of includes as Array<Record<string, unknown>>) {
      if (typeof inc['Mod'] === 'string') modIds.add(inc['Mod'] as string);
    }
  }
  return [...modIds];
}

function extractTemplateModFormIds(fields: Record<string, unknown>): string[] {
  return flattenIncludes(templateCombinationItems(fields));
}

/**
 * The weapon's standard parts: the Default=True combination's includes.
 * Some records leave the flag unset — a combination NAMED "Default"
 * (CombatRifle) or a sole combination (unique weapons like the Fixer) is
 * still authoritative. Multiple combos with neither signal is an authoring
 * state we refuse to guess at (never index 0): log and emit [].
 */
function extractDefaultModFormIds(
  fields: Record<string, unknown>,
  edid: string,
  unresolved: string[]
): string[] {
  const template = fields['Object Template'] as Record<string, unknown> | undefined;
  const combinations = template?.['Combinations'];
  const combos = Array.isArray(combinations) ? (combinations as Array<Record<string, unknown>>) : [];
  if (combos.length === 0) return [];
  const itemOf = (combo: Record<string, unknown>) =>
    (combo['Combination'] as Record<string, unknown> | undefined)?.['Object Mod Template Item'] as
      | Record<string, unknown>
      | undefined;
  const items = (predicate: (combo: Record<string, unknown>) => boolean) =>
    combos.filter(predicate).map(itemOf).filter((i): i is Record<string, unknown> => i !== undefined);

  const flagged = items(c => (itemOf(c)?.['Default'] as Record<string, unknown> | undefined)?.['value'] === 1);
  if (flagged.length > 0) return flattenIncludes(flagged);
  const named = items(c => (c['Combination'] as Record<string, unknown>)?.['Name'] === 'Default');
  if (named.length > 0) return flattenIncludes(named);
  if (combos.length === 1) return flattenIncludes(items(() => true));
  unresolved.push(`no Default combination for ${edid} (${combos.length} combos)`);
  return [];
}

export async function toGeneratedWeapon(
  client: EsmClient,
  record: EsmRecord,
  unresolved: string[]
): Promise<GeneratedWeapon> {
  const fields = record.fields;
  const data = (fields['Data'] ?? {}) as Record<string, unknown>;
  const rgw3 = (fields['RGW3'] ?? {}) as Record<string, unknown>;
  const crit = (fields['Critical Data'] ?? {}) as Record<string, unknown>;
  const flagsNode = (data['Flags'] ?? {}) as Record<string, unknown>;
  const flagNames = Array.isArray(flagsNode['flags']) ? (flagsNode['flags'] as string[]) : [];
  const keywordsNode = (fields['Keywords'] ?? {}) as Record<string, unknown>;
  const keywordFormIds: string[] = Array.isArray(keywordsNode['Keywords'])
    ? (keywordsNode['Keywords'] as string[])
    : [];
  const keywords = await Promise.all(keywordFormIds.map(id => client.resolveEdid(id)));
  const weaponTypeName =
    ((data['Weapon Type'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown';

  return {
    id: record.editor_id,
    formId: record.header.form_id,
    name: (fields['Name'] as string) ?? record.editor_id,
    weaponTypeName,
    keywords,
    isAutomaticFlag: flagNames.includes('Automatic'),
    components: await buildComponents(client, fields, unresolved),
    critDamageMult: asNumber(crit['Crit Damage Mult'], 1.0),
    critChargeBonus: asNumber(crit['Crit Charge Bonus'], 1.0),
    sneakAttackMult: asNumber(fields['Sneak Attack Multiplier'], 2.0),
    speed: asNumber(data['Speed'], 1.0),
    attackDelaySec: asNumber(data['Attack Delay Seconds']),
    animationAttackSec: asNumber(data['Animation Attack Seconds']),
    animationFireSec: asNumber(rgw3['Animation Fire Seconds']),
    reloadSpeed: asNumber(data['Reload Speed'], 1.0),
    animationReloadSec: asNumber(rgw3['Animation Reload Seconds']),
    capacity: asNumber(data['Capacity']),
    ammoPerShot: asNumber(data['Ammo used per shot'], 1),
    actionPointCost: asNumber(data['Action Point Cost']),
    projectileCount: asNumber(rgw3['# Projectiles'], 1),
    reach: asNumber(data['Reach'], 1.0),
    secondaryDamage: asNumber(data['Secondary Damage']),
    damageBonusMult: asNumber(rgw3['Damage Bonus Multiplier'], 1.0),
    // Range & falloff (Phase 1 extraction half, verified live 2026-07-18:
    // Hunting Rifle 2612/5225/0.5). 0 is a real value (melee weapons carry
    // e.g. 0/10/-1) — asNumber's default only applies when the field is
    // literally absent, never overwriting a real 0.
    minRange: asNumber(data['Min Range']),
    maxRange: asNumber(data['Max Range']),
    outOfRangeDamageMult: asNumber(data['Damage - OutOfRangeMult']),
    // Charging (Gauss family, bows, tesla/gamma/laser via barrel OMODs):
    // "Full Power Seconds"/"Full Power Damage Mult" live on Data. "Minimum
    // Charge Time" (bows only) is a TOP-LEVEL WEAP field — a sibling of
    // Data/RGW3, NOT nested inside Data (verified live 2026-07-15:
    // RegularBow 0.9 / CompoundBow 1.05 sit alongside "Zoom"/"Damage Curve").
    // CAUTION: the Data field has been renamed twice by the esm CLI
    // ("Min Power Per Shot" → "Max Power Per Shot" → "Full Power Damage
    // Mult") — the checked-in weap-gammagun.json fixture still has the OLD
    // name; re-verify against a fresh `esm get` before trusting fixture shape.
    fullPowerSeconds: asNumber(data['Full Power Seconds']),
    fullPowerDamageMult: asNumber(data['Full Power Damage Mult']),
    minimumChargeTime: asNumber(fields['Minimum Charge Time']),
    eligibleLevels: Array.isArray(fields['Eligible Levels']) ? (fields['Eligible Levels'] as number[]) : [],
    templateModFormIds: extractTemplateModFormIds(fields),
    defaultModFormIds: extractDefaultModFormIds(fields, record.editor_id, unresolved),
    attachParentSlots: Array.isArray(fields['Attach Parent Slots'])
      ? (fields['Attach Parent Slots'] as string[])
      : [],
    modifiers: [],
  };
}

/**
 * Attach-point closure (docs/assumptions.md "Attach-point closure"): the WEAP
 * record's own "Attach Parent Slots" lists only the points available on the
 * bare frame — most real slots are GRANTED by installed mods (the Hunting
 * Rifle's receiver grants grip/scope/barrel/front-sight/mag). The paper model
 * wants the union over all reachable mod configurations, so:
 *
 * - Seed: WEAP's own slots ∪ each template/default mod's OWN attach point (a
 *   part the weapon ships with must have a valid slot — the Hunting Rifle's
 *   default barrel sits on ap_gun_Barrel, absent from the WEAP list) ∪ the
 *   slots those mods grant. Junk records aren't in the index, so a cut/dev
 *   donor never opens slots; unnamed entries DO seed (a template legitimately
 *   includes them) but never iterate.
 * - Fixpoint: every named indexed mod eligible per the SHARED picker
 *   predicate (isOmodEligibleForWeapon — keeping extractor and picker gates
 *   from drifting) whose attach point is currently available contributes its
 *   granted slots, until stable (receiver → barrel → muzzle chains).
 *
 * Per-configuration slot gating (does a specific barrel close the muzzle?) is
 * deliberately out of scope — the picker treats all closure slots as always
 * present, like every other loadout tool. Restrictions-rescued mods
 * (corrections.ts omodWeaponRestrictions, app-layer) are not consulted: none
 * grant attach points, and the extractor must not read override modules.
 */
export function applyAttachPointClosure(
  weapon: GeneratedWeapon,
  index: ApGrantIndex,
  grantingEntries: readonly ApGrantEntry[]
): void {
  const slots = new Set(weapon.attachParentSlots);
  for (const formId of new Set([...weapon.templateModFormIds, ...weapon.defaultModFormIds])) {
    const entry = index.get(formId);
    if (!entry) continue;
    if (entry.attachPointFormId) slots.add(entry.attachPointFormId);
    for (const ap of entry.grantedApFormIds) slots.add(ap);
  }
  let changed = true;
  while (changed) {
    changed = false;
    const view = {
      id: weapon.id,
      attachParentSlots: [...slots],
      keywords: weapon.keywords,
      templateModFormIds: weapon.templateModFormIds,
    };
    for (const entry of grantingEntries) {
      if (
        !isOmodEligibleForWeapon(
          { id: entry.edid, formId: entry.formId, attachPointFormId: entry.attachPointFormId!, targetKeywords: entry.targetKeywords },
          view
        )
      ) {
        continue;
      }
      for (const ap of entry.grantedApFormIds) {
        if (!slots.has(ap)) {
          slots.add(ap);
          changed = true;
        }
      }
    }
  }
  weapon.attachParentSlots = [...slots];
}

export async function extractWeapons(
  client: EsmClient,
  apGrantIndex: ApGrantIndex = emptyApGrantIndex()
): Promise<ExtractWeaponsResult> {
  const named = await client.search('*', { type: 'WEAP', searchIn: 'name' });

  const excluded: Record<string, string[]> = { prefix: [], noDamage: [] };
  const candidates = named.filter(row => {
    if (isExcludedWeaponEdid(row.editor_id)) {
      excluded.prefix.push(row.editor_id);
      return false;
    }
    return true;
  });

  const unresolved: string[] = [];
  const weapons: GeneratedWeapon[] = [];

  // Weapon-intrinsic Enchantment chase (chaseWeaponEnchantment) shares the
  // plumbing-perk AVIF routes with every other MGEF-translation site, in case
  // a future weapon-level effect turns out to be a Peak/Value Modifier rather
  // than the Damage-archetype DoTs seen in the 20260710 dump (which don't
  // consult routes at all).
  const routePool = new Set<string>();
  const avifRoutes = await buildAvifRoutes(client, routePool);
  const edidByFormId = new Map<string, string>();
  for (const id of routePool) edidByFormId.set(id, await client.resolveEdid(id));

  // Closure iteration only ever consults named entries that can actually
  // open a slot — precompute them once (the index holds ~12k records; only a
  // few hundred grant attach points).
  const grantingEntries = [...apGrantIndex.values()].filter(
    e => !e.unnamed && e.attachPointFormId !== null && e.grantedApFormIds.length > 0
  );

  const records = await mapPool(candidates, 8, row => client.get(row.form_id));
  for (const record of records) {
    const weapon = await toGeneratedWeapon(client, record, unresolved);
    applyAttachPointClosure(weapon, apGrantIndex, grantingEntries);
    // Grenades/mines (thrown, or projectile-override with no WEAP damage)
    // stay out per the 2026-07-12 vetting-scope decision (launchers, not
    // throwables) — this exclusion is evaluated on WEAP-level components
    // BEFORE the explosion chase so it can't be rescued by one.
    if (weapon.components.length === 0) {
      const rgw3 = (record.fields['RGW3'] ?? {}) as Record<string, unknown>;
      if (rgw3['Override Projectile'] != null || weapon.weaponTypeName === 'Grenade') {
        (excluded.projectileOnly ??= []).push(weapon.id);
        continue;
      }
    }
    // Launcher/explosion payload chase (see chaseExplosion). Rescues weapons
    // whose ONLY damage is the explosion (Gamma Gun — previously noDamage).
    const explosion = await chaseExplosion(client, record.fields, weapon.id, unresolved);
    weapon.components.push(...explosion.components);
    if (explosion.baseWeaponDamageMult > 0) {
      weapon.explosionBaseWeaponDamageMult = explosion.baseWeaponDamageMult;
    }
    if (weapon.components.length === 0) {
      excluded.noDamage.push(weapon.id);
      continue;
    }
    // Weapon-intrinsic on-hit Enchantment chase (Cremator's built-in fire
    // DoT, bladed melee weapons' innate bleed, ...) — see chaseWeaponEnchantment.
    weapon.modifiers = await chaseWeaponEnchantment(
      client, record.fields, weapon.formId, weapon.id, weapon.name, avifRoutes, edidByFormId, unresolved
    );
    weapons.push(weapon);
  }

  // Obtainability derivation: reverse-reference each surviving weapon. Weapons
  // that fail stay in the generated data flagged obtainable:false (the app
  // hides them; corrections.ts forceVisibleWeaponIds rescues false negatives
  // without a re-extract), and every failure lands in excludedDetailed with
  // its evidence for post-run review.
  const classifier = new ObtainabilityClassifier(client);
  const verdicts = await classifier.classify(weapons.map(w => ({ formId: w.formId, edid: w.id })));
  const excludedDetailed: Record<string, ExcludedRecordDetail[]> = { weaponUnobtainable: [] };
  const obtainableFormIds = new Set<string>();
  for (const weapon of weapons) {
    const verdict = verdicts.get(weapon.formId);
    weapon.obtainable = verdict?.obtainable ?? false;
    if (weapon.obtainable) {
      obtainableFormIds.add(weapon.formId);
    } else {
      (excluded.unobtainable ??= []).push(weapon.id);
      excludedDetailed.weaponUnobtainable.push({ id: weapon.id, name: weapon.name, signals: verdict?.signals });
    }
  }

  weapons.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {
    weapons,
    excluded,
    excludedDetailed,
    unresolved: [...new Set(unresolved)],
    obtainableFormIds,
    explosiveFamilyKeywords: explosiveFamilyKeywordsOf(weapons),
  };
}
