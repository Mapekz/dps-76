import {
  createDefaultEnemyConditions,
  createDefaultPlayerConditions,
  type EnemyConditions,
  type GameMode,
  type PerkLoadout,
  type PlayerConditions,
} from '@/types';
import { getPerks, getWeapons } from '@/data';
import { getConsumables, getMutations } from '@/data/buffs';
import { getOmodById } from '@/data/omods';
import { nukesDragonsPerks } from '@/lib/nukes-dragons';
import { createDefaultBuildState, type BuildState } from '@/state/build-reducer';
import type { PerkId } from '@/data/perk-ids';

/**
 * Versioned URL/localStorage codec for the full build state.
 *
 * Format: `1.` + base64url(deflate-raw(compact JSON)). The JSON stores only
 * non-default values (diffed against the default factories), so old links keep
 * decoding as the schema grows — unknown keys are dropped, missing keys fall
 * back to defaults. Perk loadouts reuse the N&D 2-char key dictionary +
 * 1-char base-36 rank (same 3-char chunk convention as N&D `p=`); perks
 * without an N&D key travel in a fallback array.
 *
 * decode() never throws on user input: corrupt payloads return null, unknown
 * ids (weapon renamed by a patch, removed omod, ...) are skipped with a warning.
 */

const VERSION_PREFIX = '1.';

/** v1 wire shape — every field optional; short keys on purpose. */
interface SerializedBuild {
  /** weapon: [weaponId, mods record, legendary effect ids] */
  w?: [string, Record<string, string | null>, string[]];
  /** itemLevel (default 50) */
  il?: number;
  /** weakpointMult (default 2) */
  wm?: number;
  /** perks as concatenated N&D-style 3-char chunks (key + base36 rank) */
  p?: string;
  /** legendary perks, same encoding */
  lp?: string;
  /** perks with no N&D key: [perkId, rank][] */
  px?: Array<[string, number]>;
  lpx?: Array<[string, number]>;
  m?: string[];
  c?: string[];
  /** non-default player conditions */
  pc?: Partial<PlayerConditions>;
  /** non-default enemy conditions */
  ec?: Partial<EnemyConditions>;
  n?: string;
  /** view: emphasized scenario + breakdown open */
  ve?: 'freeAim' | 'vats';
  vb?: boolean;
}

// ── perk chunk coding (N&D key dictionary) ─────────────────────────────────

let reverseKeyCache: Map<string, string> | null = null;
function perkIdToKey(): Map<string, string> {
  if (!reverseKeyCache) {
    reverseKeyCache = new Map<string, string>();
    for (const [key, perkId] of Object.entries(nukesDragonsPerks)) {
      // First key wins; the map is injective in practice.
      if (!reverseKeyCache.has(perkId)) reverseKeyCache.set(perkId, key);
    }
  }
  return reverseKeyCache;
}

function encodePerks(loadout: PerkLoadout[]): { chunks: string; fallback: Array<[string, number]> } {
  const keys = perkIdToKey();
  let chunks = '';
  const fallback: Array<[string, number]> = [];
  for (const { perkId, rank } of loadout) {
    const key = keys.get(perkId);
    if (key && key.length === 2 && rank >= 1 && rank <= 35) chunks += key + rank.toString(36);
    else fallback.push([perkId, rank]);
  }
  return { chunks, fallback };
}

function decodePerks(chunks: string | undefined, fallback: Array<[string, number]> | undefined, warnings: string[]): PerkLoadout[] {
  const out: PerkLoadout[] = [];
  if (chunks) {
    for (let i = 0; i + 3 <= chunks.length; i += 3) {
      const key = chunks.slice(i, i + 2);
      const rank = parseInt(chunks[i + 2], 36);
      const perkId = nukesDragonsPerks[key];
      if (!perkId || !Number.isFinite(rank) || rank < 1) {
        warnings.push(`unknown perk key "${key}" — skipped`);
        continue;
      }
      out.push({ perkId, rank });
    }
  }
  for (const [perkId, rank] of fallback ?? []) {
    if (typeof perkId === 'string' && Number.isFinite(rank) && rank >= 1) out.push({ perkId, rank });
  }
  return out;
}

// ── non-default diffing ─────────────────────────────────────────────────────

function diffAgainstDefaults<T extends object>(value: T, defaults: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    if (value[key] !== defaults[key]) out[key] = value[key];
  }
  return out;
}

// ── deflate/base64url plumbing (browser + Node ≥18) ─────────────────────────

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const readable = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(readable).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── public API ──────────────────────────────────────────────────────────────

export async function encodeBuild(state: BuildState): Promise<string> {
  const defaults = createDefaultBuildState();
  const { player, enemy, buildName, view } = state;

  const perks = encodePerks(player.perks);
  const legendaryPerks = encodePerks(player.legendaryPerks);

  const wire: SerializedBuild = {
    ...(player.weapon && { w: [player.weapon.weaponId, player.weapon.mods, player.weapon.legendaryEffects] }),
    ...(player.itemLevel !== defaults.player.itemLevel && { il: player.itemLevel }),
    ...(player.weakpointMult !== defaults.player.weakpointMult && { wm: player.weakpointMult }),
    ...(perks.chunks && { p: perks.chunks }),
    ...(legendaryPerks.chunks && { lp: legendaryPerks.chunks }),
    ...(perks.fallback.length > 0 && { px: perks.fallback }),
    ...(legendaryPerks.fallback.length > 0 && { lpx: legendaryPerks.fallback }),
    ...(player.mutations.length > 0 && { m: player.mutations }),
    ...(player.consumables.length > 0 && { c: player.consumables }),
    ...(buildName && { n: buildName }),
    ...(view.emphasized && { ve: view.emphasized }),
    ...(view.breakdownOpen && { vb: true }),
  };
  const pc = diffAgainstDefaults(player.conditions, createDefaultPlayerConditions());
  if (Object.keys(pc).length > 0) wire.pc = pc;
  const ec = diffAgainstDefaults(enemy.conditions, createDefaultEnemyConditions());
  if (Object.keys(ec).length > 0) wire.ec = ec;

  const bytes = new TextEncoder().encode(JSON.stringify(wire)) as Uint8Array<ArrayBuffer>;
  const deflated = await pipe(bytes, new CompressionStream('deflate-raw'));
  return VERSION_PREFIX + toBase64Url(deflated);
}

export interface DecodedBuild {
  state: BuildState;
  warnings: string[];
}

export async function decodeBuild(encoded: string, mode: GameMode): Promise<DecodedBuild | null> {
  if (!encoded.startsWith(VERSION_PREFIX)) return null;
  let wire: SerializedBuild;
  try {
    const deflated = fromBase64Url(encoded.slice(VERSION_PREFIX.length));
    const json = new TextDecoder().decode(await pipe(deflated, new DecompressionStream('deflate-raw')));
    wire = JSON.parse(json) as SerializedBuild;
  } catch {
    return null;
  }
  if (!wire || typeof wire !== 'object') return null;

  const warnings: string[] = [];
  const state = createDefaultBuildState();
  const perkRegistry = getPerks(mode);

  if (wire.w) {
    const [weaponId, mods, legendaryEffects] = wire.w;
    if (getWeapons(mode)[weaponId]) {
      const keptMods: Record<string, string | null> = {};
      for (const [slot, omodId] of Object.entries(mods ?? {})) {
        if (omodId === null || getOmodById(mode, omodId)) keptMods[slot] = omodId;
        else warnings.push(`unknown weapon mod "${omodId}" — removed`);
      }
      const keptLegendary = (legendaryEffects ?? []).filter(id => {
        if (getOmodById(mode, id)) return true;
        warnings.push(`unknown legendary effect "${id}" — removed`);
        return false;
      });
      state.player.weapon = { weaponId, mods: keptMods, legendaryEffects: keptLegendary };
    } else {
      warnings.push(`unknown weapon "${weaponId}" — cleared`);
    }
  }

  if (typeof wire.il === 'number') state.player.itemLevel = Math.max(1, Math.min(50, wire.il));
  if (typeof wire.wm === 'number') state.player.weakpointMult = Math.max(0, wire.wm);

  const keepKnown = (loadout: PerkLoadout[]) =>
    loadout.filter(p => {
      if (perkRegistry[p.perkId as PerkId]) return true;
      warnings.push(`unknown perk "${p.perkId}" — removed`);
      return false;
    });
  state.player.perks = keepKnown(decodePerks(wire.p, wire.px, warnings));
  state.player.legendaryPerks = keepKnown(decodePerks(wire.lp, wire.lpx, warnings));

  const knownMutations = new Set(getMutations(mode).map(b => b.id));
  state.player.mutations = (wire.m ?? []).filter(id => {
    if (knownMutations.has(id)) return true;
    warnings.push(`unknown mutation "${id}" — removed`);
    return false;
  });
  const knownConsumables = new Set(getConsumables(mode).map(b => b.id));
  state.player.consumables = (wire.c ?? []).filter(id => {
    if (knownConsumables.has(id)) return true;
    warnings.push(`unknown consumable "${id}" — removed`);
    return false;
  });

  // Conditions: only keys that exist in the current schema survive.
  for (const [key, value] of Object.entries(wire.pc ?? {})) {
    if (key in state.player.conditions) {
      (state.player.conditions as unknown as Record<string, unknown>)[key] = value;
    }
  }
  for (const [key, value] of Object.entries(wire.ec ?? {})) {
    if (key in state.enemy.conditions) {
      (state.enemy.conditions as unknown as Record<string, unknown>)[key] = value;
    }
  }

  if (typeof wire.n === 'string') state.buildName = wire.n;
  if (wire.ve === 'freeAim' || wire.ve === 'vats') state.view.emphasized = wire.ve;
  if (wire.vb === true) state.view.breakdownOpen = true;

  return { state, warnings };
}
