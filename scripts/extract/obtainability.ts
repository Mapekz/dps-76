import { EsmClient, mapPool } from './esm-client';

/**
 * Player-obtainability derivation via reverse references (`esm refs`).
 *
 * A record is player-obtainable when something a player can reach references
 * it: a crafting recipe (COBJ — excluding `_REPAIRONLY`/`_NOCRAFT` stubs,
 * which don't prove fresh-craft access; see NON_GRANTING_COBJ_RE), a game
 * reward (GMRW), a legendary item mod
 * (LGDI), a quest (QUST — quest-alias rewards), a non-QA container (CONT), a
 * loose-mod item (MISC), a form list (FLST — legendary crafting pools), a
 * player-facing leveled list, or — for OMODs — an obtainable weapon's
 * template/attach chain (WEAP referencer).
 *
 * LVLI referencers are ambiguous: NPC loadout lists also reference weapons
 * (RD01_crAssaultRifle's only referencer is a MoleMiner loadout list), so a
 * leveled list only counts when ITS OWN referencer chain reaches player loot
 * (non-QA CONT / GMRW / QUST), recursing through parent LVLIs with a depth
 * cap and cycle guard.
 *
 * NPC_/RACE referencers are recorded as an `npcOnly` signal; placed refs
 * (REFR) are recorded as `placedRef` but are never sufficient alone (set
 * dressing). Every verdict keeps its signals so `_meta.excludedDetailed` is
 * self-explaining and false negatives can be rescued via
 * src/data/overrides/corrections.ts (forceVisible*Ids).
 */

export interface ObtainabilityVerdict {
  obtainable: boolean;
  /** Human-auditable evidence ("cobj:co_Weapon_44", "npcOnly", "noRefs", ...). */
  signals: string[];
}

export interface ObtainabilityCandidate {
  formId: string;
  edid: string;
}

/** Referencers that never prove player access (QA chests, test NPCs, dev
 *  leftovers, and anything self-declared NONPLAYABLE anywhere in its edid). */
const JUNK_REFERRER_RE = /^(zzz|QA|Test|DEL_|DEBUG_|DO_NOT_PLACE|DEPRECATED)|NONPLAYABLE/i;

/** Record types whose direct reference proves player access. */
const OBTAINABLE_REF_TYPES: Record<string, string> = {
  COBJ: 'cobj',
  GMRW: 'gmrw',
  LGDI: 'lgdi',
  QUST: 'qust',
  CONT: 'cont',
  MISC: 'misc',
  FLST: 'flst',
};

/** COBJ recipes that reference a record without proving fresh-craft access:
 *  `_REPAIRONLY` (repair-bench only) and `_NOCRAFT` (scrap/dummy stubs).
 *  Unique-weapon rework fallout (2026-07-13): dead legacy unique WEAPs'
 *  only refs are these — see docs/assumptions.md "Unique weapons". */
const NON_GRANTING_COBJ_RE = /(REPAIRONLY$|NOCRAFT)/i;

const LVLI_DEPTH_CAP = 4;
const OMOD_DEPTH_CAP = 3;

export class ObtainabilityClassifier {
  /** Completed LVLI verdicts. `true` is always safe to memoize; `false` only
   *  from a depth-0 traversal (recursive falses can be chain-truncated). */
  private lvliCache = new Map<string, boolean>();
  /** Same memoization contract for OMOD (mod collection) chains. */
  private omodCache = new Map<string, boolean>();

  constructor(
    private client: EsmClient,
    /** Weapons already ruled obtainable — an OMOD referenced by one rides along. */
    private obtainableWeaponFormIds: ReadonlySet<string> = new Set()
  ) {}

  async classify(candidates: ObtainabilityCandidate[], concurrency = 8): Promise<Map<string, ObtainabilityVerdict>> {
    const verdicts = new Map<string, ObtainabilityVerdict>();
    await mapPool(candidates, concurrency, async candidate => {
      verdicts.set(candidate.formId, await this.classifyOne(candidate));
    });
    return verdicts;
  }

  private async classifyOne({ formId }: ObtainabilityCandidate): Promise<ObtainabilityVerdict> {
    let refs;
    try {
      refs = await this.client.refs(formId);
    } catch {
      // A refs failure must not silently drop a record — treat as unproven.
      return { obtainable: false, signals: ['refsError'] };
    }
    if (refs.length === 0) return { obtainable: false, signals: ['noRefs'] };

    const signals: string[] = [];
    let obtainable = false;
    const lvlis: Array<{ form_id: string; editor_id: string }> = [];
    const omods: Array<{ form_id: string; editor_id: string }> = [];

    for (const ref of refs) {
      if (JUNK_REFERRER_RE.test(ref.editor_id)) continue;
      if (ref.record_type === 'COBJ' && NON_GRANTING_COBJ_RE.test(ref.editor_id)) {
        signals.push(`noGrantCobj:${ref.editor_id}`);
        continue;
      }
      const signalPrefix = OBTAINABLE_REF_TYPES[ref.record_type];
      if (signalPrefix) {
        obtainable = true;
        signals.push(`${signalPrefix}:${ref.editor_id}`);
      } else if (ref.record_type === 'WEAP') {
        if (this.obtainableWeaponFormIds.has(ref.form_id)) {
          obtainable = true;
          signals.push(`weap:${ref.editor_id}`);
        }
      } else if (ref.record_type === 'OMOD') {
        omods.push(ref);
      } else if (ref.record_type === 'LVLI') {
        lvlis.push(ref);
      } else if (ref.record_type === 'NPC_' || ref.record_type === 'RACE') {
        if (!signals.includes('npcOnly')) signals.push('npcOnly');
      } else if (ref.record_type === 'REFR') {
        if (!signals.includes('placedRef')) signals.push('placedRef');
      }
    }

    // Leveled lists need chain classification — only bother when nothing
    // cheaper already proved access.
    if (!obtainable) {
      for (const lvli of lvlis) {
        if (await this.isPlayerFacingLvli(lvli.form_id, 0, new Set())) {
          obtainable = true;
          signals.push(`lvli:${lvli.editor_id}`);
          break;
        }
      }
      if (!obtainable && lvlis.length > 0 && !signals.includes('npcLvliOnly')) signals.push('npcLvliOnly');
    }

    // OMOD referencers are usually modcol_* collections: a weapon references
    // the collection, the collection references the individual mods (the .50
    // cal's Standard Magazine has no other real referencer). Recurse one hop
    // through the collection's own referencers.
    if (!obtainable) {
      for (const omod of omods) {
        if (await this.isPlayerFacingOmod(omod.form_id, 0, new Set())) {
          obtainable = true;
          signals.push(`omod:${omod.editor_id}`);
          break;
        }
      }
    }

    return { obtainable, signals };
  }

  /** An OMOD referencer (mod collection / including mod) proves access when
   *  its own referencer chain reaches an obtainable weapon, COBJ, MISC, etc. */
  private async isPlayerFacingOmod(formId: string, depth: number, chain: Set<string>): Promise<boolean> {
    const cached = this.omodCache.get(formId);
    if (cached !== undefined) return cached;
    if (depth > OMOD_DEPTH_CAP || chain.has(formId)) return false;

    let refs;
    try {
      refs = await this.client.refs(formId);
    } catch {
      return false;
    }
    chain.add(formId);

    let result = refs.some(
      ref =>
        !JUNK_REFERRER_RE.test(ref.editor_id) &&
        !(ref.record_type === 'COBJ' && NON_GRANTING_COBJ_RE.test(ref.editor_id)) &&
        (OBTAINABLE_REF_TYPES[ref.record_type] !== undefined ||
          (ref.record_type === 'WEAP' && this.obtainableWeaponFormIds.has(ref.form_id)))
    );
    if (!result) {
      for (const ref of refs) {
        if (ref.record_type !== 'OMOD' || JUNK_REFERRER_RE.test(ref.editor_id)) continue;
        if (await this.isPlayerFacingOmod(ref.form_id, depth + 1, chain)) {
          result = true;
          break;
        }
      }
    }
    if (result || depth === 0) this.omodCache.set(formId, result);
    return result;
  }

  /** A leveled list is player-facing when its referencer chain reaches player
   *  loot (non-QA CONT/GMRW/QUST) rather than only NPC loadouts. */
  private async isPlayerFacingLvli(formId: string, depth: number, chain: Set<string>): Promise<boolean> {
    const cached = this.lvliCache.get(formId);
    if (cached !== undefined) return cached;
    if (depth > LVLI_DEPTH_CAP || chain.has(formId)) return false;

    let refs;
    try {
      refs = await this.client.refs(formId);
    } catch {
      return false;
    }
    chain.add(formId);

    let result = refs.some(
      ref =>
        !JUNK_REFERRER_RE.test(ref.editor_id) &&
        (ref.record_type === 'CONT' || ref.record_type === 'GMRW' || ref.record_type === 'QUST')
    );
    if (!result) {
      for (const ref of refs) {
        if (ref.record_type !== 'LVLI' || JUNK_REFERRER_RE.test(ref.editor_id)) continue;
        if (await this.isPlayerFacingLvli(ref.form_id, depth + 1, chain)) {
          result = true;
          break;
        }
      }
    }
    if (result || depth === 0) this.lvliCache.set(formId, result);
    return result;
  }
}
