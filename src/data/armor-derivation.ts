import type { GeneratedOmod } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';
import { hasAnyEngineEffect } from '@/types/modifiers';
import { describeBuffModifiers } from '@/lib/buff-description';
import { armorPieceOverrides } from './overrides/armor-piece-overrides';
import { MAX_LEGENDARY_COUNT, maxCountFromReach } from './armor-capacities';
import type {
  ArmorEffectEntry,
  ArmorPieceClass,
  ArmorSlotGroup,
  ArmorStarTier,
  ArmorType,
} from './armor-types';

export const LEGENDARY_ATTACH_POINT_RE = /^ap_Legendary([1-4])$/;

/**
 * Non-legendary attach points admitted to the armor picker, and which slot
 * group each belongs to — an explicit include-list (like omods.ts's
 * DEAD_MECHANIC_SLOT_EDIDS / SLOT_LABEL_OVERRIDES), not a heuristic, so a
 * new cosmetic attach point in a future ESM dump is excluded by default
 * rather than silently appearing. Verified against the 20260803 dump via
 * `jq` census over armor-omods.json (see docs/adr/0008).
 */
export function nonLegendaryGroup(omod: GeneratedOmod): ArmorSlotGroup | null {
  switch (omod.attachPointEdid) {
    case 'ap_armor_Tier':
      return 'material';
    case 'ap_underarmor_style':
      return 'lining';
    case 'ap_armor_Lining':
      // Underarmor lining effects (Shielded/Treated/Protective/Resistant
      // Lining) and non-PA functional mods (Sleek, Cushioned, Jetpack…)
      // share this one attach point in the ESM — the `_UnderArmor_` id
      // token is the only discriminator.
      return omod.id.includes('_UnderArmor_') ? 'lining' : 'misc';
    case 'ap_PowerArmor_Misc':
      return 'misc';
    default:
      return null;
  }
}

/** True for jetpack cosmetic reskins (Nuka-Cola Jetpack, MothMan Jet Pack, …) that must collapse into the base "Jetpack"/"Jet Pack" entry. */
export function isJetpackReskin(name: string): boolean {
  return /jet ?pack/i.test(name) && name !== 'Jetpack' && name !== 'Jet Pack';
}

export function armorTypeOfRecord(omod: GeneratedOmod): ArmorType {
  if (omod.attachPointEdid === 'ap_underarmor_style') return 'both';
  if (omod.attachPointEdid === 'ap_armor_Lining' && omod.id.includes('_UnderArmor_')) return 'both';
  if (omod.attachPointEdid.startsWith('ap_PowerArmor_')) return 'powerArmor';
  if (omod.attachPointEdid === 'ap_armor_Tier') return 'bodyArmor';
  if (omod.attachPointEdid === 'ap_armor_Lining') return 'bodyArmor';
  return 'bodyArmor';
}

/**
 * Legendary armor-type classification is by record presence per display
 * name, not an override list: verified 2026-08-04 against granting COBJs —
 * all 9 obtainable Armor-only names carry `Workbench_Crafting_Armor`
 * (0x001F6062), all 8 PA-only names carry `Workbench_Crafting_PowerArmor`
 * (0x004EA39F), so presence is the restriction with no authoring gaps
 * (docs/adr/0010). Don't infer PA-exclusivity from the `ma_PowerArmorMod`
 * keyword instead — it appears on every dual-availability legendary's
 * PA-flavored record too (`.claude/skills/esm-walk/SKILL.md`, "Power-armor
 * exclusivity").
 */
export function legendaryArmorType(records: readonly GeneratedOmod[]): ArmorType {
  let hasArmor = false;
  let hasPA = false;
  for (const r of records) {
    if (/mod_Legendary_Armor/.test(r.id)) hasArmor = true;
    if (/mod_Legendary_PowerArmor/.test(r.id)) hasPA = true;
  }
  if (hasArmor && hasPA) return 'both';
  if (hasPA) return 'powerArmor';
  return 'bodyArmor';
}

export function tokensFromTexts(texts: readonly string[]): string[] {
  const tokens: string[] = [];
  for (const text of texts) {
    for (const token of text.split('_')) tokens.push(token);
  }
  return tokens;
}

export function derivePieceReachFromTokens(texts: readonly string[]): ReadonlySet<ArmorPieceClass> {
  const reach = new Set<ArmorPieceClass>();
  for (const token of tokensFromTexts(texts)) {
    if (token === 'Torso') reach.add('torso');
    else if (token === 'Helmet') reach.add('helmet');
    else if (token === 'LimbArm' || token === 'Arm') reach.add('arm');
    else if (token === 'LimbLeg' || token === 'Leg') reach.add('leg');
    else if (token === 'Limb') {
      reach.add('arm');
      reach.add('leg');
    }
  }
  return reach;
}

/**
 * Piece reach is the plain union of ESM piece tags — deliberately no
 * "specific tags beat generic `Limb`" tie-break, so Muffled (targets the
 * generic `Limb` lining keyword) reaches arms wherever a set's arm ARMO
 * genuinely carries that keyword: BOS Infantry (`ma_armor_BOSInfantry_
 * Lining_Limb` 0x005DD33E) and Robot (`ma_armor_Lining_Robot_Limb`
 * 0x00508D82), verified 2026-08-04 (docs/adr/0010). The union reading is
 * correct — Muffled genuinely fits arms on those sets.
 */
export function derivePieceReach(
  name: string,
  records: readonly GeneratedOmod[],
  armorType: ArmorType,
): ReadonlySet<ArmorPieceClass> {
  const override = armorPieceOverrides[name];
  if (override) return new Set(override);

  const representative = records[0];
  if (representative.attachPointEdid === 'ap_underarmor_style') return new Set(['underarmorStyle']);
  if (representative.id.includes('_UnderArmor_')) return new Set(['underarmorLining']);

  const texts: string[] = [];
  for (const r of records) {
    texts.push(r.id);
    if (r.targetKeywords) texts.push(...r.targetKeywords);
  }
  const reach = derivePieceReachFromTokens(texts);
  if (reach.size > 0) return reach;

  // Records with only set-wide keywords and no piece suffix (Shrouded/Wood:
  // ma_armor_Wood + ma_armor_lining) attach anywhere on the chassis — the
  // set-wide keyword sits on every piece, so full reach IS the data-driven
  // reading. The `*_Null` empty-slot placeholders that also matched here are
  // hidden via `hiddenArmorOmodIds` instead.
  if (armorType === 'powerArmor') return new Set(['torso', 'arm', 'leg', 'helmet']);
  if (armorType === 'bodyArmor') return new Set(['torso', 'arm', 'leg']);
  return reach;
}

export function findWornPieceKeyword(modifiers: readonly Modifier[]): string | undefined {
  for (const m of modifiers) {
    const cond = m.conditions.find((c) => c.kind === 'wornPieceCount');
    if (cond && cond.kind === 'wornPieceCount') return cond.keyword;
  }
  return undefined;
}

export function buildEntry(name: string, records: GeneratedOmod[]): ArmorEffectEntry {
  // Engine-effective records sort before non-effective ones, then by id —
  // a no-op for every effect that existed before docs/adr/0008 (verified:
  // all 16 pre-existing legendary effect ids unchanged); it only starts
  // mattering once a same-name group can mix an effective and inert record.
  const sorted = [...records].sort((a, b) => {
    const aEff = hasAnyEngineEffect(a.modifiers);
    const bEff = hasAnyEngineEffect(b.modifiers);
    if (aEff !== bEff) return aEff ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  const representative = sorted[0];
  // "Powered" (+AP regen) has twin records at ap_Legendary1
  // (mod_Legendary_Armor_APRegen) and ap_Legendary2 (mod_Legendary_Armor2_
  // APRegen / mod_Legendary_PowerArmor2_APRegen); the alphabetical
  // representative pick lands on the tier-2 record, so Powered counts
  // against the 2★ budget — pre-existing data ambiguity inherited
  // deliberately, not fixed here.
  const match = LEGENDARY_ATTACH_POINT_RE.exec(representative.attachPointEdid);
  const isLegendary = match !== null;
  const starTier = match ? (Number(match[1]) as ArmorStarTier) : undefined;
  const selfScaling = representative.modifiers.some((m) =>
    m.conditions.some((c) => c.kind === 'wornPieceCount'),
  );

  const armorType = isLegendary ? legendaryArmorType(sorted) : armorTypeOfRecord(representative);
  const pieceReach = isLegendary ? undefined : derivePieceReach(name, sorted, armorType);
  const maxCount = isLegendary
    ? MAX_LEGENDARY_COUNT
    : pieceReach && pieceReach.size > 0
      ? maxCountFromReach(pieceReach, armorType)
      : 1;

  const description =
    representative.description?.trim() ||
    describeBuffModifiers({ modifiers: representative.modifiers });
  return {
    id: representative.id,
    name,
    description: description || null,
    group: isLegendary ? 'legendary' : nonLegendaryGroup(representative)!,
    attachPointEdid: representative.attachPointEdid,
    badge: hasAnyEngineEffect(representative.modifiers) ? undefined : 'inert',
    maxCount,
    selfScaling,
    wornPieceKeyword: selfScaling ? findWornPieceKeyword(representative.modifiers) : undefined,
    modifiers: representative.modifiers,
    starTier,
    armorType,
    pieceReach: pieceReach && pieceReach.size > 0 ? pieceReach : undefined,
  };
}
