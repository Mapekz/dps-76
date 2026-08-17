import { type GameMode } from '@/types';
import { getWeapons } from '@/data';
import { consumablesById, sanitizeConsumables } from '@/lib/consumable-rules';
import { reclassifyPerkLoadouts } from '@/lib/nukes-dragons';
import { normalizeBuildState } from '@/lib/build-rules';
import { BitReader, BitWriter } from '@/lib/persist/bitstream';
import { buildShareSlug } from '@/lib/persist/slug';
import {
  readAddictions,
  readArmorEffects,
  readBuildName,
  readConsumables,
  readEnemyConditions,
  readLegendaryPerks,
  readMutations,
  readPerks,
  readPlayerConditions,
  readView,
  readWeapon,
  writeAddictions,
  writeArmorEffects,
  writeBuildName,
  writeConsumables,
  writeEnemyConditions,
  writeLegendaryPerks,
  writeMutations,
  writePerks,
  writePlayerConditions,
  writeView,
  writeWeapon,
} from '@/lib/persist/wire-sections';
import { createDefaultBuildState, type BuildState } from '@/state/build-reducer';

/**
 * Versioned URL/localStorage codec for the full build state.
 *
 * Format: `2.<slug>.<base64url(headerByte + packedBytes)>`. The slug is
 * decorative (human-readable hint); decode reads and discards it. The
 * packed bitstream is built from wire-section codecs; header bit 0 marks
 * deflate-raw compression when that yields a shorter payload than raw.
 *
 * encode/decode both diff against `createDefaultBuildState()` — the same
 * object decode seeds from, so omitted fields refill with that baseline.
 *
 * decode() never throws on user input: corrupt payloads return null, unknown
 * ids are skipped with a warning.
 */

const VERSION = '2';

// ── deflate/base64url plumbing (browser + Node ≥18) ─────────────────────────

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
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

// ── envelope ────────────────────────────────────────────────────────────────

function parseEnvelope(encoded: string): { payload: string } | null {
  const firstDot = encoded.indexOf('.');
  if (firstDot === -1) return null;
  const secondDot = encoded.indexOf('.', firstDot + 1);
  if (secondDot === -1) return null;
  if (encoded.slice(0, firstDot) !== VERSION) return null;
  const payload = encoded.slice(secondDot + 1);
  if (payload.length === 0) return null;
  return { payload };
}

function packState(state: BuildState): Uint8Array {
  const w = new BitWriter();
  const { player, enemy, buildName, view } = state;
  writeWeapon(w, player.weapon, player);
  writePerks(w, player.perks);
  writeLegendaryPerks(w, player.legendaryPerks);
  writeMutations(w, player.mutations);
  writeAddictions(w, player.addictions);
  writeConsumables(w, player.consumables);
  writeArmorEffects(w, player.armorEffects);
  writePlayerConditions(w, player.conditions);
  writeEnemyConditions(w, enemy.conditions);
  writeBuildName(w, buildName);
  writeView(w, view);
  return w.toBytes();
}

function unpackState(bytes: Uint8Array, mode: GameMode, warnings: string[]): BuildState | null {
  const r = new BitReader(bytes);
  const state = createDefaultBuildState();

  const weaponSection = readWeapon(r, mode, warnings);
  state.player.weapon = weaponSection.weapon;
  state.player.itemLevel = weaponSection.itemLevel;
  state.player.weakpointMult = weaponSection.weakpointMult;
  state.player.chargeTimeSec = weaponSection.chargeTimeSec;

  state.player.perks = readPerks(r, mode, warnings);
  state.player.legendaryPerks = readLegendaryPerks(r, mode, warnings);
  const reclassified = reclassifyPerkLoadouts(state.player.perks, state.player.legendaryPerks);
  if (reclassified.migrated > 0) {
    warnings.push(
      `${reclassified.migrated} perk(s) moved between regular/legendary after a classification fix`,
    );
    state.player.perks = reclassified.perks;
    state.player.legendaryPerks = reclassified.legendaryPerks;
  }

  state.player.mutations = readMutations(r, mode, warnings);
  state.player.addictions = readAddictions(r, mode, warnings);

  const knownConsumableIds = readConsumables(r, mode, warnings);
  const sanitizedConsumables = sanitizeConsumables(consumablesById(mode), knownConsumableIds);
  if (sanitizedConsumables.length !== knownConsumableIds.length) {
    warnings.push(
      "removed to satisfy stacking rules (one chem/alcohol at a time; same-bonus food/drink don't stack)",
    );
  }
  state.player.consumables = sanitizedConsumables;

  state.player.armorEffects = readArmorEffects(r, mode, warnings);

  const pc = readPlayerConditions(r, mode, warnings);
  for (const [key, value] of Object.entries(pc)) {
    if (key in state.player.conditions) {
      (state.player.conditions as unknown as Record<string, unknown>)[key] = value;
    }
  }

  const ec = readEnemyConditions(r, mode, warnings);
  for (const [key, value] of Object.entries(ec)) {
    if (key in state.enemy.conditions) {
      (state.enemy.conditions as unknown as Record<string, unknown>)[key] = value;
    }
  }

  const buildName = readBuildName(r);
  if (buildName !== null) state.buildName = buildName;

  state.view = readView(r);

  if (r.overrun) return null;
  return state;
}

// ── public API ──────────────────────────────────────────────────────────────

export async function encodeBuild(state: BuildState, mode: GameMode): Promise<string> {
  const weaponName = getWeapons(mode)[state.player.weapon?.weaponId ?? '']?.name ?? null;
  const slug = buildShareSlug(state.buildName, weaponName);

  const packed = packState(state) as Uint8Array<ArrayBuffer>;
  const deflated = await pipe(packed, new CompressionStream('deflate-raw'));

  const useDeflate = deflated.length < packed.length;
  const body = useDeflate ? deflated : packed;
  const headerByte = useDeflate ? 1 : 0;

  const wire = new Uint8Array(1 + body.length);
  wire[0] = headerByte;
  wire.set(body, 1);

  return `${VERSION}.${slug}.${toBase64Url(wire)}`;
}

export interface DecodedBuild {
  state: BuildState;
  warnings: string[];
}

export async function decodeBuild(encoded: string, mode: GameMode): Promise<DecodedBuild | null> {
  const parsed = parseEnvelope(encoded);
  if (!parsed) return null;

  let wire: Uint8Array;
  try {
    wire = fromBase64Url(parsed.payload);
  } catch {
    return null;
  }
  if (wire.length === 0) return null;

  const compressed = (wire[0]! & 1) === 1;
  const body = wire.subarray(1);

  let packed: Uint8Array;
  try {
    packed = compressed
      ? await pipe(body as Uint8Array<ArrayBuffer>, new DecompressionStream('deflate-raw'))
      : body;
  } catch {
    return null;
  }

  const warnings: string[] = [];
  const state = unpackState(packed, mode, warnings);
  if (!state) return null;

  const normalized = normalizeBuildState(mode, state);
  warnings.push(...normalized.warnings);
  return { state: normalized.state, warnings };
}
