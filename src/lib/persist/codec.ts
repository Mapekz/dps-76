import {
  createDefaultEnemyConditions,
  createDefaultPlayerConditions,
  type EnemyConditions,
  type GameMode,
  type PerkLoadout,
  type PlayerConditions,
} from '@/types';
import { getPerks, getWeapons } from '@/data';
import { getAddictions, getConsumables, getMutations } from '@/data/buffs';
import { getOmodById } from '@/data/omods';
import { getArmorEffectById } from '@/data/armor-modifiers';
import { nukesDragonsPerks, reclassifyPerkLoadouts } from '@/lib/nukes-dragons';
import { consumablesById, sanitizeConsumables } from '@/lib/consumable-rules';
import { createDefaultBuildState, type BuildState } from '@/state/build-reducer';
import type { PerkId } from '@/data/perk-ids';

/**
 * Versioned URL/localStorage codec for the full build state.
 *
 * Format: `1.` + base64url(deflate-raw(compact JSON)). The JSON stores only
 * non-default values (diffed against the default factories), so old links keep
 * decoding as the schema grows — unknown keys are dropped, missing keys fall
 * back to defaults. Perk chunks reuse the N&D 2-char key dictionary with our
 * own base-36 rank wire format (see encodePerks); perks without an N&D key
 * travel in a fallback array.
 *
 * decode() never throws on user input: corrupt payloads return null, unknown
 * ids (weapon renamed by a patch, removed omod, ...) are skipped with a warning.
 */

const VERSION_PREFIX = '1.';

/** v1 wire shape — every field optional; short keys on purpose. */
interface SerializedBuild {
  /** weapon: [weaponId, mods record, legendary effect ids by star index (null = empty slot)] */
  w?: [string, Record<string, string | null>, (string | null)[]];
  /** itemLevel (default 50) */
  il?: number;
  /** weakpointMult (default 1.5) */
  wm?: number;
  /** chargeTimeSec — absent means undefined (always fully charge) */
  ct?: number;
  /** perks as concatenated N&D-style 3-char chunks (key + base36 rank) */
  p?: string;
  /** legendary perks, same encoding */
  lp?: string;
  /** perks with no N&D key: [perkId, rank][] */
  px?: Array<[string, number]>;
  lpx?: Array<[string, number]>;
  m?: string[];
  c?: string[];
  /** selected addiction ids (GeneratedAddiction.id) */
  ad?: string[];
  /** Armor checklist selections: [effectId, count][], count>0 only */
  ae?: Array<[string, number]>;
  /** non-default player conditions */
  pc?: Partial<PlayerConditions>;
  /** non-default enemy conditions */
  ec?: Partial<EnemyConditions>;
  n?: string;
  /** view: emphasized scenario + breakdown open */
  ve?: 'freeAim' | 'vats';
  vb?: boolean;
}

// ── perk chunk coding (our internal wire format) ────────────────────────────
//
// encodePerks/decodePerks implement OUR OWN #b=… share-link perk
// encoding: 2-char key + 1-char base-36 rank (ranks 1–35), plus a fallback
// array (px/lpx) for perks outside the 2-char dictionary. Deliberately
// distinct from src/lib/nukes-dragons.ts parsePerkString, which decodes
// nukesdragons.com's externally-fixed build-share URL scheme (base-10 rank,
// capped at 5) — a format we do not control and cannot extend. The one shared
// seam is the nukesDragonsPerks dictionary (key → PerkId), imported above and
// reversed via perkIdToKey below; it is not duplicated.

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

/**
 * Derived player-condition fields (resolveLoadout recomputes them from the
 * build every run): never written to URLs and ignored when a legacy payload
 * carries one — the stored values only feed synthetic engine tests.
 */
const DERIVED_PLAYER_CONDITION_KEYS = new Set<keyof PlayerConditions>([
  'strangeInNumbers',
  'hungerThirstTier',
  'maxHealth',
  'mutationCount',
  'addictionCount',
]);

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
    ...(player.chargeTimeSec !== undefined && { ct: player.chargeTimeSec }),
    ...(perks.chunks && { p: perks.chunks }),
    ...(legendaryPerks.chunks && { lp: legendaryPerks.chunks }),
    ...(perks.fallback.length > 0 && { px: perks.fallback }),
    ...(legendaryPerks.fallback.length > 0 && { lpx: legendaryPerks.fallback }),
    ...(player.mutations.length > 0 && { m: player.mutations }),
    ...(player.consumables.length > 0 && { c: player.consumables }),
    ...(player.addictions.length > 0 && { ad: player.addictions }),
    ...(Object.keys(player.armorEffects).length > 0 && {
      ae: Object.entries(player.armorEffects).filter(([, count]) => count > 0),
    }),
    ...(buildName && { n: buildName }),
    ...(view.emphasized && { ve: view.emphasized }),
    ...(view.breakdownOpen && { vb: true }),
  };
  const pc = diffAgainstDefaults(player.conditions, createDefaultPlayerConditions());
  for (const key of DERIVED_PLAYER_CONDITION_KEYS) delete pc[key];
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
    const [rawWeaponId, mods, legendaryEffects] = wire.w;
    // Weapon ids are ESM editor ids, whose casing Bethesda occasionally fixes
    // (20260717: pickaxe→Pickaxe, crossbow→Crossbow, sledgehammer→Sledgehammer)
    // — resolve stored ids case-insensitively so old share URLs keep working.
    const weaponId =
      getWeapons(mode)[rawWeaponId] !== undefined
        ? rawWeaponId
        : (Object.keys(getWeapons(mode)).find(id => id.toLowerCase() === rawWeaponId.toLowerCase()) ?? rawWeaponId);
    if (getWeapons(mode)[weaponId]) {
      const keptMods: Record<string, string | null> = {};
      for (const [slot, omodId] of Object.entries(mods ?? {})) {
        if (omodId === null || getOmodById(mode, omodId)) keptMods[slot] = omodId;
        else warnings.push(`unknown weapon mod "${omodId}" — removed`);
      }
      const keptLegendary: (string | null)[] = [];
      for (const entry of legendaryEffects ?? []) {
        if (entry === null) {
          keptLegendary.push(null);
          continue;
        }
        if (getOmodById(mode, entry)) keptLegendary.push(entry);
        else warnings.push(`unknown legendary effect "${entry}" — removed`);
      }
      state.player.weapon = { weaponId, mods: keptMods, legendaryEffects: keptLegendary };
    } else {
      warnings.push(`unknown weapon "${weaponId}" — cleared`);
    }
  }

  if (typeof wire.il === 'number') state.player.itemLevel = Math.max(1, Math.min(50, wire.il));
  if (typeof wire.wm === 'number') state.player.weakpointMult = Math.max(0.1, wire.wm);
  // No upper clamp here either (see the reducer's weapon/chargeTime case) —
  // absent wire.ct decodes as undefined (backward compat: full charge).
  if (typeof wire.ct === 'number') state.player.chargeTimeSec = Math.max(0, wire.ct);

  const keepKnown = (loadout: PerkLoadout[]) =>
    loadout
      .filter(p => {
        if (perkRegistry[p.perkId as PerkId]) return true;
        warnings.push(`unknown perk "${p.perkId}" — removed`);
        return false;
      })
      // Silent clamp: an out-of-range rank (stale/adversarial payload, or a
      // card's maxRank shrinking after an ESM sync) is clamped rather than
      // dropped — the existing over-budget flag covers budget overruns.
      .map(p => {
        const maxRank = perkRegistry[p.perkId as PerkId].maxRank;
        return p.rank > maxRank ? { ...p, rank: maxRank } : p;
      });
  state.player.perks = keepKnown(decodePerks(wire.p, wire.px, warnings));
  state.player.legendaryPerks = keepKnown(decodePerks(wire.lp, wire.lpx, warnings));
  // Builds encoded before the ghoul-card/legendary-perk classification fix
  // stored ghoul cards under legendaryPerks — re-sort against the current set.
  const reclassified = reclassifyPerkLoadouts(state.player.perks, state.player.legendaryPerks);
  if (reclassified.migrated > 0) {
    warnings.push(
      `${reclassified.migrated} perk(s) moved between regular/legendary after a classification fix`
    );
    state.player.perks = reclassified.perks;
    state.player.legendaryPerks = reclassified.legendaryPerks;
  }

  const knownMutations = new Set(getMutations(mode).map(b => b.id));
  state.player.mutations = (wire.m ?? []).filter(id => {
    if (knownMutations.has(id)) return true;
    warnings.push(`unknown mutation "${id}" — removed`);
    return false;
  });
  const knownConsumables = new Set(getConsumables(mode).map(b => b.id));
  const knownConsumableIds = (wire.c ?? []).filter(id => {
    if (knownConsumables.has(id)) return true;
    warnings.push(`unknown consumable "${id}" — removed`);
    return false;
  });
  // Old/adversarial payloads can encode combinations the stacking rules
  // (src/lib/consumable-rules.ts) no longer allow (two chems, two same-key
  // foods, ...) — replay through the same rules the reducer enforces.
  const sanitizedConsumables = sanitizeConsumables(consumablesById(mode), knownConsumableIds);
  if (sanitizedConsumables.length !== knownConsumableIds.length) {
    warnings.push(
      "removed to satisfy stacking rules (one chem/alcohol at a time; same-bonus food/drink don't stack)"
    );
  }
  state.player.consumables = sanitizedConsumables;

  const knownAddictions = new Set(getAddictions(mode).map(a => a.id));
  state.player.addictions = (wire.ad ?? []).filter(id => {
    if (knownAddictions.has(id)) return true;
    warnings.push(`unknown addiction "${id}" — removed`);
    return false;
  });

  for (const [id, count] of wire.ae ?? []) {
    const effect = getArmorEffectById(mode, id);
    if (!effect || typeof count !== 'number') {
      warnings.push(`unknown armor effect "${id}" — removed`);
      continue;
    }
    state.player.armorEffects[id] = Math.max(0, Math.min(effect.maxCount, count));
  }

  // Conditions: only keys that exist in the current schema survive.
  for (const [key, value] of Object.entries(wire.pc ?? {})) {
    if (key === 'limitBreakingPieces' && typeof value === 'number') {
      // Pre-Phase-3 URLs stored Limit Breaking as a standalone manual
      // condition; it's now the "Limit-Breaking" Armor checklist row
      // (mod_Legendary_Armor4_LimitBreak — same 0-5 worn-piece count, just
      // sourced from real OMOD data instead of a hand-authored crit-meter
      // term — see docs/assumptions.md "Armor").
      const effect = getArmorEffectById(mode, 'mod_Legendary_Armor4_LimitBreak');
      if (effect && value > 0) {
        state.player.armorEffects[effect.id] = Math.max(0, Math.min(effect.maxCount, value));
        warnings.push('"Limit Breaking armor pieces" moved into the Armor checklist');
      }
      continue;
    }
    if (key === 'addictionCount') {
      // Pre-overhaul URLs stored a manual count; there's no way to map a
      // bare number back to specific addiction ids, so it's dropped rather
      // than silently winning over the (now addiction-less) picker state.
      warnings.push('"addictionCount" is no longer a manual input — pick your addictions in Chems & Addictions');
      continue;
    }
    if (DERIVED_PLAYER_CONDITION_KEYS.has(key as keyof PlayerConditions)) continue; // legacy payloads
    if (key in state.player.conditions) {
      (state.player.conditions as unknown as Record<string, unknown>)[key] = value;
    }
  }
  for (const [key, value] of Object.entries(wire.ec ?? {})) {
    if (key === 'targetDistance' && typeof value === 'string') {
      // Pre-Phase-1 URLs stored a three-way bucket ('close'|'none'|'far');
      // targetDistance is now a continuous raw-game-units number. Map to a
      // representative distance inside each old bucket (pattern: the
      // addictionCount special case above) rather than dropping it outright
      // — the perk gates it drove (Guerrilla, Sniper's) still resolve
      // sensibly from a representative number.
      const legacyDistance: Record<string, number> = { close: 400, none: 900, far: 1500 };
      if (value in legacyDistance) {
        state.enemy.conditions.targetDistance = legacyDistance[value];
      } else {
        warnings.push(`unknown "targetDistance" value "${value}" — using default`);
      }
      continue;
    }
    if (key in state.enemy.conditions) {
      (state.enemy.conditions as unknown as Record<string, unknown>)[key] = value;
    }
  }

  if (typeof wire.n === 'string') state.buildName = wire.n;
  if (wire.ve === 'freeAim' || wire.ve === 'vats') state.view.emphasized = wire.ve;
  if (wire.vb === true) state.view.breakdownOpen = true;

  return { state, warnings };
}
