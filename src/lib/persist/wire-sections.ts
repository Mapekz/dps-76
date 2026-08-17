/**
 * Per-section bit-packed codecs for the v2 share URL.
 *
 * **Stream-alignment rule:** decode must consume every bit an entry declares,
 * even when the resolved id is unknown, tombstoned, or fails validation.
 * Skipping bits on a dead entry desynchronises the entire remainder of the
 * stream — the most common catastrophic bug in packed formats.
 *
 * **Group-width rule:** every `groupWidth` is a module-level constant below,
 * never derived from `dictionary.length` at runtime. Older tabs must agree
 * with newer deploys on every field width.
 */

import { getPerks, getWeapons } from '@/data';
import { getAddictions, getConsumables, getMutations } from '@/data/buffs';
import { getArmorEffectById } from '@/data/armor-modifiers';
import { getOmodById } from '@/data/omods';
import { wireIdForIndex, wireIndexForId, type WireDomain } from '@/data/wire-dictionary';
import { buildDelta } from '@/lib/build-delta';
import {
  ENEMY_HEALTH_PERCENT_STOPS,
  healthPercentIndex,
  PLAYER_HEALTH_PERCENT_STOPS,
  snapHealthPercent,
} from '@/lib/health-percent';
import { BitReader, BitWriter } from '@/lib/persist/bitstream';
import { createDefaultBuildState, type ViewState } from '@/state/build-reducer';
import type {
  EnemyConditions,
  GameMode,
  PerkLoadout,
  PlayerConfig,
  PlayerInput,
  WeaponConfig,
} from '@/types';
import {
  DERIVED_PLAYER_CONDITION_KEYS,
  ENEMY_KNOB_REGISTRY,
  PLAYER_KNOB_REGISTRY,
} from '@/types/knob-registry';

/** Spec-constant dictionary group widths — never derive from live dictionary sizes. */
export const WIRE_GROUP_WIDTHS = {
  weapon: 9,
  omod: 13,
  attachPoint: 6,
  armorEffect: 8,
  perk: 9,
  consumable: 9,
  targetRace: 7,
  targetBodyPart: 6,
  perkDelta: 4,
} as const;

export const MUTATION_BITMASK_WIDTH = 24;
export const ADDICTION_BITMASK_WIDTH = 16;
export const CHALLENGE_ID_BITMASK_WIDTH = 16;

const ITEM_LEVEL_BITS = 6;
const WEAKPOINT_MULT_BITS = 8;
const MOD_COUNT_BITS = 4;
const LEGENDARY_COUNT_BITS = 3;
const LEGENDARY_STAR_INDEX_BITS = 3;
const CONSUMABLE_COUNT_BITS = 3;
const ARMOR_EFFECT_COUNT_BITS = 4;
const ARMOR_EFFECT_COUNT_VARINT_WIDTH = 3;
const PERK_RANK_SHORTFALL_BITS = 2;
const PLAYER_CONDITION_WIRE_WIDTH = 6;
const ENEMY_CONDITION_WIRE_WIDTH = 4;
const VIEW_EMPHASIZED_BITS = 2;
const UNCLAMPED_NUMBER_VARINT_WIDTH = 8;
const CHARGE_TIME_SCALE = 100;
const WEAKPOINT_MULT_SCALE = 10;

const DEFAULT_ITEM_LEVEL = 50;
const DEFAULT_WEAKPOINT_MULT = 1.5;

/** Legacy identity-mod container ids — same remap as codec.ts. */
const LEGACY_OMOD_ID_ALIASES: Readonly<Record<string, string>> = {
  mod_Custom_CamdenWhacker: 'mod_Custom_CamdenWhacker_Bleed',
  SDOW_Mod_Custom_RelicReaper: 'SDOW_Mod_Custom_RelicReaper_CapCollector',
};

function resolveLegacyOmodId(omodId: string): string {
  return LEGACY_OMOD_ID_ALIASES[omodId] ?? omodId;
}

function writeDictRef(w: BitWriter, domain: WireDomain, id: string, groupWidth: number): void {
  const index = wireIndexForId(domain, id);
  if (index !== undefined) {
    w.writeBit(0);
    w.writeGroupedVarint(index, groupWidth);
  } else {
    w.writeBit(1);
    w.writeString(id);
  }
}

function readDictRef(r: BitReader, domain: WireDomain, groupWidth: number): string {
  const escaped = r.readBit();
  if (escaped === 1) return r.readString();
  const index = r.readGroupedVarint(groupWidth);
  return wireIdForIndex(domain, index) ?? `__wire_unknown_${domain}_${index}__`;
}

export function clampedBitWidth(clamp: { min: number; max: number }): number {
  const range = clamp.max - clamp.min;
  return Math.ceil(Math.log2(range + 1));
}

function isObjectValue(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function perkMaxRank(perkId: string, mode: GameMode): number {
  return Math.max(1, getPerks(mode)[perkId as keyof ReturnType<typeof getPerks>]?.maxRank ?? 1);
}

function encodePerkShortfall(perkId: string, rank: number, mode: GameMode): number {
  const maxRank = perkMaxRank(perkId, mode);
  const clamped = Math.max(1, Math.min(maxRank, rank));
  return maxRank - clamped;
}

function decodePerkRank(perkId: string, shortfall: number, mode: GameMode): number {
  const maxRank = perkMaxRank(perkId, mode);
  return Math.max(1, maxRank - shortfall);
}

// ── Weapon ──────────────────────────────────────────────────────────────────

export interface DecodedWeaponSection {
  weapon: WeaponConfig | null;
  itemLevel: number;
  weakpointMult: number;
  chargeTimeSec: number | undefined;
}

export function writeWeapon(w: BitWriter, weapon: WeaponConfig | null, player: PlayerConfig): void {
  if (!weapon) {
    w.writeBit(0);
    return;
  }

  w.writeBit(1);
  writeDictRef(w, 'weapon', weapon.weaponId, WIRE_GROUP_WIDTHS.weapon);

  if (player.itemLevel !== DEFAULT_ITEM_LEVEL) {
    w.writeBit(1);
    w.writeBits(player.itemLevel, ITEM_LEVEL_BITS);
  } else {
    w.writeBit(0);
  }

  if (player.weakpointMult !== DEFAULT_WEAKPOINT_MULT) {
    w.writeBit(1);
    w.writeBits(Math.round(player.weakpointMult * WEAKPOINT_MULT_SCALE), WEAKPOINT_MULT_BITS);
  } else {
    w.writeBit(0);
  }

  if (player.chargeTimeSec !== undefined) {
    w.writeBit(1);
    w.writeGroupedVarint(
      Math.round(player.chargeTimeSec * CHARGE_TIME_SCALE),
      UNCLAMPED_NUMBER_VARINT_WIDTH,
    );
  } else {
    w.writeBit(0);
  }

  const modEntries = Object.entries(weapon.mods).filter(([, omodId]) => omodId !== null);
  w.writeBits(modEntries.length, MOD_COUNT_BITS);
  for (const [slot, omodId] of modEntries) {
    writeDictRef(w, 'attachPoint', slot, WIRE_GROUP_WIDTHS.attachPoint);
    writeDictRef(w, 'omod', omodId!, WIRE_GROUP_WIDTHS.omod);
  }

  const legendaryEntries: Array<{ starIndex: number; omodId: string }> = [];
  weapon.legendaryEffects.forEach((omodId, starIndex) => {
    if (omodId !== null) legendaryEntries.push({ starIndex, omodId });
  });
  w.writeBits(legendaryEntries.length, LEGENDARY_COUNT_BITS);
  for (const { starIndex, omodId } of legendaryEntries) {
    w.writeBits(starIndex, LEGENDARY_STAR_INDEX_BITS);
    writeDictRef(w, 'omod', omodId, WIRE_GROUP_WIDTHS.omod);
  }
}

export function readWeapon(r: BitReader, mode: GameMode, warnings: string[]): DecodedWeaponSection {
  const defaults = createDefaultBuildState().player;
  const out: DecodedWeaponSection = {
    weapon: null,
    itemLevel: defaults.itemLevel,
    weakpointMult: defaults.weakpointMult,
    chargeTimeSec: undefined,
  };

  if (r.readBit() === 0) return out;

  const rawWeaponId = readDictRef(r, 'weapon', WIRE_GROUP_WIDTHS.weapon);
  const weaponRegistry = getWeapons(mode);
  const weaponId =
    weaponRegistry[rawWeaponId] !== undefined
      ? rawWeaponId
      : (Object.keys(weaponRegistry).find((id) => id.toLowerCase() === rawWeaponId.toLowerCase()) ??
        rawWeaponId);

  if (r.readBit() === 1) {
    out.itemLevel = Math.max(1, Math.min(50, r.readBits(ITEM_LEVEL_BITS)));
  }
  if (r.readBit() === 1) {
    out.weakpointMult = Math.max(0.1, r.readBits(WEAKPOINT_MULT_BITS) / WEAKPOINT_MULT_SCALE);
  }
  if (r.readBit() === 1) {
    out.chargeTimeSec = Math.max(
      0,
      r.readGroupedVarint(UNCLAMPED_NUMBER_VARINT_WIDTH) / CHARGE_TIME_SCALE,
    );
  }

  const modCount = r.readBits(MOD_COUNT_BITS);
  const mods: Record<string, string | null> = {};
  for (let i = 0; i < modCount; i++) {
    const slot = readDictRef(r, 'attachPoint', WIRE_GROUP_WIDTHS.attachPoint);
    const rawOmodId = readDictRef(r, 'omod', WIRE_GROUP_WIDTHS.omod);
    const omodId = resolveLegacyOmodId(rawOmodId);
    if (getOmodById(mode, omodId)) mods[slot] = omodId;
    else warnings.push(`unknown weapon mod "${rawOmodId}" — removed`);
  }

  const legendaryCount = r.readBits(LEGENDARY_COUNT_BITS);
  const legendaryEffects: (string | null)[] = [];
  for (let i = 0; i < legendaryCount; i++) {
    const starIndex = r.readBits(LEGENDARY_STAR_INDEX_BITS);
    const rawOmodId = readDictRef(r, 'omod', WIRE_GROUP_WIDTHS.omod);
    while (legendaryEffects.length <= starIndex) legendaryEffects.push(null);
    if (getOmodById(mode, rawOmodId)) legendaryEffects[starIndex] = rawOmodId;
    else warnings.push(`unknown legendary effect "${rawOmodId}" — removed`);
  }

  if (weaponRegistry[weaponId]) {
    out.weapon = { weaponId, mods, legendaryEffects };
  } else {
    warnings.push(`unknown weapon "${weaponId}" — cleared`);
  }

  return out;
}

// ── Perks ───────────────────────────────────────────────────────────────────

function writePerkLoadout(w: BitWriter, loadout: PerkLoadout[], mode: GameMode): void {
  const dictEntries: Array<{ index: number; shortfall: number }> = [];
  const literalEntries: Array<{ perkId: string; shortfall: number }> = [];

  for (const { perkId, rank } of loadout) {
    const index = wireIndexForId('perk', perkId);
    const shortfall = encodePerkShortfall(perkId, rank, mode);
    if (index !== undefined) dictEntries.push({ index, shortfall });
    else literalEntries.push({ perkId, shortfall });
  }

  dictEntries.sort((a, b) => a.index - b.index);

  w.writeGroupedVarint(dictEntries.length, WIRE_GROUP_WIDTHS.perk);
  w.writeDeltaList(
    dictEntries.map((e) => e.index),
    WIRE_GROUP_WIDTHS.perk,
    WIRE_GROUP_WIDTHS.perkDelta,
  );
  for (const { shortfall } of dictEntries) {
    w.writeBits(shortfall, PERK_RANK_SHORTFALL_BITS);
  }

  w.writeGroupedVarint(literalEntries.length, WIRE_GROUP_WIDTHS.perk);
  for (const { perkId, shortfall } of literalEntries) {
    w.writeString(perkId);
    w.writeBits(shortfall, PERK_RANK_SHORTFALL_BITS);
  }
}

function readPerkLoadout(r: BitReader, mode: GameMode, warnings: string[]): PerkLoadout[] {
  const out: PerkLoadout[] = [];
  const perkRegistry = getPerks(mode);

  const dictCount = r.readGroupedVarint(WIRE_GROUP_WIDTHS.perk);
  const indices = r.readDeltaList(dictCount, WIRE_GROUP_WIDTHS.perk, WIRE_GROUP_WIDTHS.perkDelta);
  for (const index of indices) {
    const shortfall = r.readBits(PERK_RANK_SHORTFALL_BITS);
    const perkId = wireIdForIndex('perk', index);
    if (!perkId || !perkRegistry[perkId as keyof typeof perkRegistry]) {
      warnings.push(`unknown perk index ${index} — removed`);
      continue;
    }
    const rank = decodePerkRank(perkId, shortfall, mode);
    const maxRank = perkMaxRank(perkId, mode);
    out.push({ perkId, rank: rank > maxRank ? maxRank : rank });
  }

  const literalCount = r.readGroupedVarint(WIRE_GROUP_WIDTHS.perk);
  for (let i = 0; i < literalCount; i++) {
    const perkId = r.readString();
    const shortfall = r.readBits(PERK_RANK_SHORTFALL_BITS);
    if (!perkRegistry[perkId as keyof typeof perkRegistry]) {
      warnings.push(`unknown perk "${perkId}" — removed`);
      continue;
    }
    const rank = decodePerkRank(perkId, shortfall, mode);
    const maxRank = perkMaxRank(perkId, mode);
    out.push({ perkId, rank: rank > maxRank ? maxRank : rank });
  }

  return out;
}

export function writePerks(w: BitWriter, perks: PerkLoadout[]): void {
  writePerkLoadout(w, perks, 'live');
}

export function readPerks(r: BitReader, mode: GameMode, warnings: string[]): PerkLoadout[] {
  return readPerkLoadout(r, mode, warnings);
}

export function writeLegendaryPerks(w: BitWriter, perks: PerkLoadout[]): void {
  writePerkLoadout(w, perks, 'live');
}

export function readLegendaryPerks(
  r: BitReader,
  mode: GameMode,
  warnings: string[],
): PerkLoadout[] {
  return readPerkLoadout(r, mode, warnings);
}

// ── Mutations / addictions ──────────────────────────────────────────────────

function writeBitmaskSelection(
  w: BitWriter,
  domain: Extract<WireDomain, 'mutation' | 'addiction'>,
  ids: string[],
  width: number,
): void {
  if (ids.length === 0) {
    w.writeBit(0);
    return;
  }
  w.writeBit(1);
  const indices: number[] = [];
  for (const id of ids) {
    const index = wireIndexForId(domain, id);
    if (index !== undefined) indices.push(index);
  }
  w.writeBitmask(indices, width);
}

function readBitmaskSelection(
  r: BitReader,
  domain: Extract<WireDomain, 'mutation' | 'addiction'>,
  mode: GameMode,
  width: number,
  warnings: string[],
): string[] {
  if (r.readBit() === 0) return [];

  const indices = r.readBitmask(width);
  const known = new Set(
    (domain === 'mutation' ? getMutations(mode) : getAddictions(mode)).map((row) => row.id),
  );
  const out: string[] = [];
  for (const index of indices) {
    const id = wireIdForIndex(domain, index);
    if (!id) {
      warnings.push(`unknown ${domain} index ${index} — removed`);
      continue;
    }
    if (!known.has(id)) {
      warnings.push(`unknown ${domain} "${id}" — removed`);
      continue;
    }
    out.push(id);
  }
  return out;
}

export function writeMutations(w: BitWriter, mutations: string[]): void {
  writeBitmaskSelection(w, 'mutation', mutations, MUTATION_BITMASK_WIDTH);
}

export function readMutations(r: BitReader, mode: GameMode, warnings: string[]): string[] {
  return readBitmaskSelection(r, 'mutation', mode, MUTATION_BITMASK_WIDTH, warnings);
}

export function writeAddictions(w: BitWriter, addictions: string[]): void {
  writeBitmaskSelection(w, 'addiction', addictions, ADDICTION_BITMASK_WIDTH);
}

export function readAddictions(r: BitReader, mode: GameMode, warnings: string[]): string[] {
  return readBitmaskSelection(r, 'addiction', mode, ADDICTION_BITMASK_WIDTH, warnings);
}

// ── Consumables ─────────────────────────────────────────────────────────────

export function writeConsumables(w: BitWriter, consumables: string[]): void {
  w.writeBits(consumables.length, CONSUMABLE_COUNT_BITS);
  for (const id of consumables) {
    writeDictRef(w, 'consumable', id, WIRE_GROUP_WIDTHS.consumable);
  }
}

export function readConsumables(r: BitReader, mode: GameMode, warnings: string[]): string[] {
  const count = r.readBits(CONSUMABLE_COUNT_BITS);
  const known = new Set(getConsumables(mode).map((c) => c.id));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = readDictRef(r, 'consumable', WIRE_GROUP_WIDTHS.consumable);
    if (known.has(id)) out.push(id);
    else warnings.push(`unknown consumable "${id}" — removed`);
  }
  return out;
}

// ── Armor effects ───────────────────────────────────────────────────────────

export function writeArmorEffects(w: BitWriter, armorEffects: Record<string, number>): void {
  const entries = Object.entries(armorEffects).filter(([, count]) => count > 0);
  w.writeBits(entries.length, ARMOR_EFFECT_COUNT_BITS);
  for (const [id, count] of entries) {
    writeDictRef(w, 'armorEffect', id, WIRE_GROUP_WIDTHS.armorEffect);
    w.writeGroupedVarint(count, ARMOR_EFFECT_COUNT_VARINT_WIDTH);
  }
}

export function readArmorEffects(
  r: BitReader,
  mode: GameMode,
  warnings: string[],
): Record<string, number> {
  const count = r.readBits(ARMOR_EFFECT_COUNT_BITS);
  const out: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    const id = readDictRef(r, 'armorEffect', WIRE_GROUP_WIDTHS.armorEffect);
    const rawCount = r.readGroupedVarint(ARMOR_EFFECT_COUNT_VARINT_WIDTH);
    const effect = getArmorEffectById(mode, id);
    if (!effect) {
      warnings.push(`unknown armor effect "${id}" — removed`);
      continue;
    }
    out[id] = Math.max(0, Math.min(effect.maxCount, rawCount));
  }
  return out;
}

// ── Condition knobs (registry-driven) ─────────────────────────────────────

interface WireKnobRow {
  key: string;
  wire: number;
  owner: 'player' | 'enemy';
  origin: 'input' | 'derived';
  default: unknown;
  clamp?: { min: number; max: number };
}

const PLAYER_WIRE_TO_ROW = new Map<number, WireKnobRow>();
const ENEMY_WIRE_TO_ROW = new Map<number, WireKnobRow>();

for (const row of Object.values(PLAYER_KNOB_REGISTRY)) {
  if (!row) continue;
  PLAYER_WIRE_TO_ROW.set(row.wire, row as WireKnobRow);
}
for (const row of Object.values(ENEMY_KNOB_REGISTRY)) {
  if (!row) continue;
  ENEMY_WIRE_TO_ROW.set(row.wire, row as WireKnobRow);
}

const ARMOR_WORN_TAGS: Record<string, number> = { none: 0, body: 1, power: 2 };
const ARMOR_WORN_BY_TAG = ['none', 'body', 'power'] as const;
const PUBLIC_TEAM_TAGS: Record<string, number> = { none: 0, casual: 1, exploration: 2 };
const PUBLIC_TEAM_BY_TAG = ['none', 'casual', 'exploration'] as const;

function writeChallengeBitmask(w: BitWriter, ids: string[]): void {
  const indices: number[] = [];
  for (const id of ids) {
    const index = wireIndexForId('challengeId', id);
    if (index !== undefined) indices.push(index);
  }
  w.writeBitmask(indices, CHALLENGE_ID_BITMASK_WIDTH);
}

function readChallengeBitmask(r: BitReader): string[] {
  const indices = r.readBitmask(CHALLENGE_ID_BITMASK_WIDTH);
  const out: string[] = [];
  for (const index of indices) {
    const id = wireIdForIndex('challengeId', index);
    if (id) out.push(id);
  }
  return out;
}

function writePlayerKnobValue(w: BitWriter, row: WireKnobRow, value: unknown): void {
  switch (row.key) {
    case 'healthPercent':
      w.writeBits(
        healthPercentIndex(value as number, PLAYER_HEALTH_PERCENT_STOPS),
        clampedBitWidth({ min: 0, max: PLAYER_HEALTH_PERCENT_STOPS.length - 1 }),
      );
      return;
    case 'armorWorn':
      w.writeBits(ARMOR_WORN_TAGS[value as string] ?? 0, 2);
      return;
    case 'publicTeamType':
      w.writeBits(PUBLIC_TEAM_TAGS[value as string] ?? 0, 2);
      return;
    case 'completedChallengeIds':
      writeChallengeBitmask(w, (value as string[]) ?? []);
      return;
    default:
      break;
  }

  if (typeof value === 'boolean') {
    w.writeBit(value ? 1 : 0);
    return;
  }

  if (typeof value === 'number') {
    if (row.clamp && row.clamp.max - row.clamp.min <= 64) {
      const width = clampedBitWidth(row.clamp);
      w.writeBits((value as number) - row.clamp.min, width);
    } else {
      w.writeGroupedVarint(value as number, UNCLAMPED_NUMBER_VARINT_WIDTH);
    }
  }
}

function readPlayerKnobValue(r: BitReader, row: WireKnobRow): unknown {
  switch (row.key) {
    case 'healthPercent': {
      const index = r.readBits(
        clampedBitWidth({ min: 0, max: PLAYER_HEALTH_PERCENT_STOPS.length - 1 }),
      );
      return PLAYER_HEALTH_PERCENT_STOPS[Math.min(index, PLAYER_HEALTH_PERCENT_STOPS.length - 1)];
    }
    case 'armorWorn': {
      const tag = r.readBits(2);
      return ARMOR_WORN_BY_TAG[tag] ?? 'body';
    }
    case 'publicTeamType': {
      const tag = r.readBits(2);
      return PUBLIC_TEAM_BY_TAG[tag] ?? 'none';
    }
    case 'completedChallengeIds':
      return readChallengeBitmask(r);
    default:
      break;
  }

  if (typeof row.default === 'boolean') return r.readBit() === 1;

  if (typeof row.default === 'number') {
    if (row.clamp && row.clamp.max - row.clamp.min <= 64) {
      const width = clampedBitWidth(row.clamp);
      return r.readBits(width) + row.clamp.min;
    }
    return r.readGroupedVarint(UNCLAMPED_NUMBER_VARINT_WIDTH);
  }

  return undefined;
}

function writeEnemyKnobValue(w: BitWriter, row: WireKnobRow, value: unknown): void {
  switch (row.key) {
    case 'healthPercent':
      w.writeBits(
        healthPercentIndex(value as number, ENEMY_HEALTH_PERCENT_STOPS),
        clampedBitWidth({ min: 0, max: ENEMY_HEALTH_PERCENT_STOPS.length - 1 }),
      );
      return;
    case 'targetRace':
      if (value === null || value === undefined) {
        w.writeBit(0);
      } else {
        w.writeBit(1);
        writeDictRef(w, 'targetRace', value as string, WIRE_GROUP_WIDTHS.targetRace);
      }
      return;
    case 'targetBodyPart':
      if (value === null || value === undefined) {
        w.writeBit(0);
      } else {
        w.writeBit(1);
        writeDictRef(w, 'targetBodyPart', value as string, WIRE_GROUP_WIDTHS.targetBodyPart);
      }
      return;
    case 'targetLevel':
      if (value === null || value === undefined) {
        w.writeBit(0);
      } else {
        w.writeBit(1);
        w.writeGroupedVarint(value as number, UNCLAMPED_NUMBER_VARINT_WIDTH);
      }
      return;
    default:
      break;
  }

  if (typeof value === 'boolean') {
    w.writeBit(value ? 1 : 0);
    return;
  }

  if (typeof value === 'number') {
    if (row.clamp && row.clamp.max - row.clamp.min <= 64) {
      const width = clampedBitWidth(row.clamp);
      w.writeBits((value as number) - row.clamp.min, width);
    } else {
      w.writeGroupedVarint(value as number, UNCLAMPED_NUMBER_VARINT_WIDTH);
    }
  }
}

function readEnemyKnobValue(r: BitReader, row: WireKnobRow): unknown {
  switch (row.key) {
    case 'healthPercent': {
      const index = r.readBits(
        clampedBitWidth({ min: 0, max: ENEMY_HEALTH_PERCENT_STOPS.length - 1 }),
      );
      return ENEMY_HEALTH_PERCENT_STOPS[Math.min(index, ENEMY_HEALTH_PERCENT_STOPS.length - 1)];
    }
    case 'targetRace':
      if (r.readBit() === 0) return null;
      return readDictRef(r, 'targetRace', WIRE_GROUP_WIDTHS.targetRace);
    case 'targetBodyPart':
      if (r.readBit() === 0) return null;
      return readDictRef(r, 'targetBodyPart', WIRE_GROUP_WIDTHS.targetBodyPart);
    case 'targetLevel':
      if (r.readBit() === 0) return null;
      return r.readGroupedVarint(UNCLAMPED_NUMBER_VARINT_WIDTH);
    default:
      break;
  }

  if (typeof row.default === 'boolean') return r.readBit() === 1;

  if (typeof row.default === 'number') {
    if (row.clamp && row.clamp.max - row.clamp.min <= 64) {
      const width = clampedBitWidth(row.clamp);
      return r.readBits(width) + row.clamp.min;
    }
    return r.readGroupedVarint(UNCLAMPED_NUMBER_VARINT_WIDTH);
  }

  return undefined;
}

function collectPlayerConditionEntries(conditions: PlayerInput): Array<{
  row: WireKnobRow;
  value: unknown;
}> {
  const defaults = createDefaultBuildState().player.conditions;
  const delta = buildDelta(conditions, defaults);
  for (const key of DERIVED_PLAYER_CONDITION_KEYS) delete delta[key as keyof PlayerInput];

  const entries: Array<{ row: WireKnobRow; value: unknown }> = [];
  for (const [key, value] of Object.entries(delta)) {
    const row = PLAYER_KNOB_REGISTRY[key as keyof typeof PLAYER_KNOB_REGISTRY];
    if (!row || row.origin === 'derived') continue;
    const wireRow = row as WireKnobRow;
    if (key === 'completedChallengeIds') {
      entries.push({ row: wireRow, value: value ?? [] });
      continue;
    }
    if (isObjectValue(value)) continue;
    entries.push({ row: wireRow, value });
  }
  entries.sort((a, b) => a.row.wire - b.row.wire);
  return entries;
}

function collectEnemyConditionEntries(conditions: EnemyConditions): Array<{
  row: WireKnobRow;
  value: unknown;
}> {
  const defaults = createDefaultBuildState().enemy.conditions;
  const delta = buildDelta(conditions, defaults);
  const entries: Array<{ row: WireKnobRow; value: unknown }> = [];
  for (const [key, value] of Object.entries(delta)) {
    const row = ENEMY_KNOB_REGISTRY[key as keyof typeof ENEMY_KNOB_REGISTRY];
    if (!row || row.origin === 'derived') continue;
    if (isObjectValue(value)) continue;
    entries.push({ row: row as WireKnobRow, value });
  }
  entries.sort((a, b) => a.row.wire - b.row.wire);
  return entries;
}

export function writePlayerConditions(w: BitWriter, conditions: PlayerInput): void {
  const entries = collectPlayerConditionEntries(conditions);
  w.writeGroupedVarint(entries.length, PLAYER_CONDITION_WIRE_WIDTH);
  for (const { row, value } of entries) {
    w.writeGroupedVarint(row.wire, PLAYER_CONDITION_WIRE_WIDTH);
    writePlayerKnobValue(w, row, value);
  }
}

export function readPlayerConditions(
  r: BitReader,
  _mode: GameMode,
  warnings: string[],
): Partial<PlayerInput> {
  const out: Partial<PlayerInput> = {};
  const count = r.readGroupedVarint(PLAYER_CONDITION_WIRE_WIDTH);
  for (let i = 0; i < count; i++) {
    const wire = r.readGroupedVarint(PLAYER_CONDITION_WIRE_WIDTH);
    const row = PLAYER_WIRE_TO_ROW.get(wire);
    if (!row) {
      warnings.push(`unknown player condition wire ordinal ${wire} — skipped`);
      continue;
    }
    const value = readPlayerKnobValue(r, row);
    if (row.origin === 'derived') continue;
    if (row.key === 'healthPercent' && typeof value === 'number') {
      (out as Record<string, unknown>)[row.key] = snapHealthPercent(
        value,
        PLAYER_HEALTH_PERCENT_STOPS,
      );
    } else {
      (out as Record<string, unknown>)[row.key] = value;
    }
  }
  return out;
}

export function writeEnemyConditions(w: BitWriter, conditions: EnemyConditions): void {
  const entries = collectEnemyConditionEntries(conditions);
  w.writeGroupedVarint(entries.length, ENEMY_CONDITION_WIRE_WIDTH);
  for (const { row, value } of entries) {
    w.writeGroupedVarint(row.wire, ENEMY_CONDITION_WIRE_WIDTH);
    writeEnemyKnobValue(w, row, value);
  }
}

export function readEnemyConditions(
  r: BitReader,
  _mode: GameMode,
  warnings: string[],
): Partial<EnemyConditions> {
  const out: Partial<EnemyConditions> = {};
  const count = r.readGroupedVarint(ENEMY_CONDITION_WIRE_WIDTH);
  for (let i = 0; i < count; i++) {
    const wire = r.readGroupedVarint(ENEMY_CONDITION_WIRE_WIDTH);
    const row = ENEMY_WIRE_TO_ROW.get(wire);
    if (!row) {
      warnings.push(`unknown enemy condition wire ordinal ${wire} — skipped`);
      continue;
    }
    const value = readEnemyKnobValue(r, row);
    if (row.origin === 'derived') continue;
    if (row.key === 'healthPercent' && typeof value === 'number') {
      (out as Record<string, unknown>)[row.key] = snapHealthPercent(
        value,
        ENEMY_HEALTH_PERCENT_STOPS,
      );
    } else if (
      (row.key === 'targetRace' || row.key === 'targetBodyPart') &&
      typeof value === 'string' &&
      value.startsWith('__wire_unknown_')
    ) {
      warnings.push(`unknown ${row.key} "${value}" — removed`);
    } else {
      (out as Record<string, unknown>)[row.key] = value;
    }
  }
  return out;
}

// ── Build name / view ─────────────────────────────────────────────────────

export function writeBuildName(w: BitWriter, buildName: string | null): void {
  if (buildName) {
    w.writeBit(1);
    w.writeString(buildName);
  } else {
    w.writeBit(0);
  }
}

export function readBuildName(r: BitReader): string | null {
  if (r.readBit() === 0) return null;
  const name = r.readString();
  return name || null;
}

export function writeView(w: BitWriter, view: ViewState): void {
  const emphasized = view.emphasized === 'freeAim' ? 1 : view.emphasized === 'vats' ? 2 : 0;
  w.writeBits(emphasized, VIEW_EMPHASIZED_BITS);
  w.writeBit(view.breakdownOpen ? 1 : 0);
}

export function readView(r: BitReader): ViewState {
  const emphasized = r.readBits(VIEW_EMPHASIZED_BITS);
  return {
    emphasized: emphasized === 1 ? 'freeAim' : emphasized === 2 ? 'vats' : null,
    breakdownOpen: r.readBit() === 1,
  };
}

/** Exported for registry-driven width tests. */
export function knobValueBitWidth(row: WireKnobRow): number | 'varint' | 'bitmask' {
  const key = row.key;
  if (key === 'healthPercent') {
    const stops = row.owner === 'player' ? PLAYER_HEALTH_PERCENT_STOPS : ENEMY_HEALTH_PERCENT_STOPS;
    return clampedBitWidth({ min: 0, max: stops.length - 1 });
  }
  if (key === 'armorWorn' || key === 'publicTeamType') return 2;
  if (key === 'completedChallengeIds') return CHALLENGE_ID_BITMASK_WIDTH;
  if (key === 'targetRace' || key === 'targetBodyPart' || key === 'targetLevel') {
    return 'varint';
  }
  if (typeof row.default === 'boolean') return 1;
  if (typeof row.default === 'number') {
    if (row.clamp && row.clamp.max - row.clamp.min <= 64) return clampedBitWidth(row.clamp);
    return 'varint';
  }
  return 'varint';
}
