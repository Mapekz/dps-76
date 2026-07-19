import { EsmClient, mapPool } from './esm-client';
import { CobjIndex, CobjInfo, isNonGrantingCobj } from './cobj-index';

/**
 * Player-obtainability derivation via reverse references (`esm refs`).
 *
 * A record is player-obtainable when something a player can reach references
 * it: a crafting recipe (COBJ — excluding `_REPAIRONLY`/`_NOCRAFT` stubs,
 * which don't prove fresh-craft access; see isNonGrantingCobj in
 * cobj-index.ts), a game reward (GMRW), a legendary item mod
 * (LGDI), a quest (QUST — quest-alias rewards), a non-QA container (CONT), a
 * loose-mod item (MISC), a form list (FLST — legendary crafting pools), a
 * player-facing leveled list, or — for OMODs — an obtainable weapon's or
 * armor's template/attach chain (WEAP/ARMO referencer — the ARMO branch is
 * the Phase 3 armor-pipeline parallel of the WEAP one, 2026-07-18).
 *
 * LVLI referencers are ambiguous: NPC loadout lists also reference weapons
 * (RD01_crAssaultRifle's only referencer is a MoleMiner loadout list), so a
 * leveled list only counts when ITS OWN referencer chain reaches player loot
 * (non-QA CONT / GMRW / QUST / RESO, or a craftable dispensing ACTI), recursing
 * through parent LVLIs with a depth cap and cycle guard.
 *
 * Two of those terminals exist for CAMP machines, which is how most food is
 * granted (2026-07-14 audit of _meta.excludedDetailed):
 *   - RESO is a workshop resource generator's produce list:
 *     ALCH <- LVLI <- RESO, with a buildable machine behind it (COBJ
 *     ATX_workshop_co_* + CONT ATX_CAMP_Collector_*). Every RESO in the ESM is
 *     a player workshop resource, so a RESO terminal always proves access.
 *   - A dispensing ACTI (SCORE_S22_SarsaparillaMachine) counts only when it is
 *     itself craftable — a non-junk COBJ builds it. One hop, never recursed.
 *
 * ALCH referencers are chased like OMOD/WEAP ones: a consumable's aged state is
 * referenced only by its previous state (co_Gulpershine crafts Ferm, which
 * ferments into Fresh, which ages into Vintage), so an ALCH referencer proves
 * access when ITS chain reaches a player-facing type.
 *
 * When a CobjIndex is supplied (the OMOD pass), a COBJ referencer is further
 * gated by its Learn Method (2026-07-14, dps-todos/omod-obtainability-chains):
 * plan-taught recipes (method 4) grant only when their `Learn Recipe From`
 * BOOK is itself player-reachable (isPlayerFacingBook — vendor recipe pools
 * run ~8 LVLIs deep, hence BOOK_LVLI_DEPTH_CAP); scrap-taught recipes
 * (method 1) grant only when the explicit scrap source in `Learn Recipe
 * From` is reachable (an obtainable WEAP, or a loose-mod MISC). Methods 0
 * (script/pickup) and 3 (known by default) grant outright.
 *
 * CHAL (challenge) referencers deliberately do NOT count: challenges are
 * authored against cut content too (Firecracker Whiskey's only referencers are
 * POST_Challenge_* records, and its recipes have no Created Object at all).
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
 *  leftovers, and anything self-declared NONPLAYABLE anywhere in its edid).
 *  CUT_ added 2026-07-14: the paddle ball's cut ball mods stayed "obtainable"
 *  through CUT_DLC04_modcol_melee_Paddleball while their only plan book is
 *  CUT_recipe_mod_PaddleBall_* with zero referencers — cut collections must
 *  not launder access (the extractor's own OMOD_JUNK_EDID_RE already treats
 *  cut_ records themselves as junk). */
const JUNK_REFERRER_RE = /^(zzz|QA|Test|DEL_|DEBUG_|DO_NOT_PLACE|DEPRECATED|CUT_)|NONPLAYABLE/i;

/** Record types whose direct reference proves player access. */
const OBTAINABLE_REF_TYPES: Record<string, string> = {
  COBJ: 'cobj',
  GMRW: 'gmrw',
  LGDI: 'lgdi',
  QUST: 'qust',
  CONT: 'cont',
  MISC: 'misc',
  FLST: 'flst',
  RESO: 'reso',
};

/** Terminals that make a leveled list player-facing rather than an NPC loadout. */
const LVLI_TERMINAL_TYPES = new Set(['CONT', 'GMRW', 'QUST', 'RESO']);

// NON_GRANTING_COBJ_RE (`_REPAIRONLY` repair-bench stubs, `_NOCRAFT`
// scrap/dummy stubs) lives in cobj-index.ts now, alongside the field-based
// dummy-learn-from check (isNonGrantingCobj). Unique-weapon rework fallout
// (2026-07-13): dead legacy unique WEAPs' only refs are these — see
// docs/assumptions.md "Unique weapons".

const LVLI_DEPTH_CAP = 4;
const OMOD_DEPTH_CAP = 3;
const ALCH_DEPTH_CAP = 3;
/** Vendor recipe chains run BOOK → LLS_Recipes_* → 7 nested LVLI hops →
 *  Vendor_* → CONT (walked live 2026-07-14: Whitespring BoS vendor chest is
 *  8 LVLIs from the plan). Only the BOOK chase uses this deeper cap — the
 *  general cap stays conservative so NPC-loadout laundering keeps failing
 *  fast. */
const BOOK_LVLI_DEPTH_CAP = 10;

export class ObtainabilityClassifier {
  /** Completed LVLI verdicts. `true` is always safe to memoize; `false` only
   *  from a depth-0 traversal (recursive falses can be chain-truncated). */
  private lvliCache = new Map<string, boolean>();
  /** Same memoization contract for OMOD (mod collection) chains. */
  private omodCache = new Map<string, boolean>();
  /** Same memoization contract for ALCH (ferment/spoil) chains. */
  private alchCache = new Map<string, boolean>();
  /** Craftable-ACTI verdicts. Unconditionally cacheable — the check is a single
   *  non-recursive hop, so a `false` is never chain-truncated. */
  private actiCache = new Map<string, boolean>();
  /** Player-facing BOOK (plan) verdicts. Unconditionally cacheable — a book
   *  chase always starts its LVLI walks at depth 0. */
  private bookCache = new Map<string, boolean>();

  constructor(
    private client: EsmClient,
    /** Weapons already ruled obtainable — an OMOD referenced by one rides along. */
    private obtainableWeaponFormIds: ReadonlySet<string> = new Set(),
    /** Forward COBJ index (buildCobjIndex). When present, COBJ referencers are
     *  gated by their Learn Method: plan-taught recipes must have an obtainable
     *  BOOK, scrap-taught ones an obtainable scrap source. Absent (the
     *  weapons/buffs passes) every non-stub COBJ grants, as before. */
    private cobjIndex?: CobjIndex,
    /** Armor pieces already ruled obtainable (extract-armor.ts) — an OMOD
     *  referenced by one rides along, the ARMO-record parallel of
     *  `obtainableWeaponFormIds` (Phase 3 armor pipeline, 2026-07-18). */
    private obtainableArmorFormIds: ReadonlySet<string> = new Set()
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
    const alchs: Array<{ form_id: string; editor_id: string }> = [];
    /** Learn-method-gated recipes, resolved after the loop (only when nothing
     *  cheaper proves access): plan-taught → BOOK chase, scrap-taught →
     *  scrap-source check. */
    const bookCobjs: CobjInfo[] = [];
    const scrapCobjs: CobjInfo[] = [];

    for (const ref of refs) {
      if (JUNK_REFERRER_RE.test(ref.editor_id)) continue;
      if (ref.record_type === 'COBJ') {
        const info = this.cobjIndex?.byFormId.get(ref.form_id);
        if (isNonGrantingCobj(info, ref.editor_id)) {
          signals.push(`noGrantCobj:${ref.editor_id}`);
        } else if (info?.learnMethod === 4 && info.learnRecipeFrom?.recordType === 'BOOK') {
          bookCobjs.push(info);
        } else if (info?.learnMethod === 1) {
          scrapCobjs.push(info);
        } else {
          // No index (weapons/buffs passes), absent Learn Method, 0 (learned
          // by pickup/script — can't be disproven from records), 3 (known by
          // default), or 4 without a BOOK on record. All grant, matching the
          // pre-index behavior; unexpected shapes keep an extra signal so
          // they surface in _meta review.
          obtainable = true;
          signals.push(`cobj:${ref.editor_id}`);
          if (info && info.learnMethod === 4) signals.push(`cobjPlanNoBook:${ref.editor_id}`);
          else if (info && ![null, 0, 3].includes(info.learnMethod)) {
            signals.push(`cobjUnknownLearnMethod:${info.learnMethod}`);
          }
        }
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
      } else if (ref.record_type === 'ARMO') {
        if (this.obtainableArmorFormIds.has(ref.form_id)) {
          obtainable = true;
          signals.push(`armo:${ref.editor_id}`);
        }
      } else if (ref.record_type === 'OMOD') {
        omods.push(ref);
      } else if (ref.record_type === 'LVLI') {
        lvlis.push(ref);
      } else if (ref.record_type === 'ALCH') {
        alchs.push(ref);
      } else if (ref.record_type === 'NPC_' || ref.record_type === 'RACE') {
        if (!signals.includes('npcOnly')) signals.push('npcOnly');
      } else if (ref.record_type === 'REFR') {
        if (!signals.includes('placedRef')) signals.push('placedRef');
      }
    }

    // Plan-taught recipes (Learn Method 4): the recipe grants access only if
    // its BOOK is itself player-reachable (vendor LVLI, quest reward, ...).
    if (!obtainable) {
      for (const info of bookCobjs) {
        if (await this.isPlayerFacingBook(info.learnRecipeFrom!.formId)) {
          obtainable = true;
          signals.push(`cobjBook:${info.edid}`);
          break;
        }
        signals.push(`cobjBookUnproven:${info.edid}`);
      }
    }

    // Scrap-taught recipes (Learn Method 1): `Learn Recipe From` names the
    // scrap source explicitly — a WEAP (black powder bayonet ← Black Powder
    // Rifle), a loose-mod MISC, or the created object itself (which can't
    // bootstrap its own access).
    if (!obtainable) {
      for (const info of scrapCobjs) {
        const src = info.learnRecipeFrom;
        const proven =
          src !== null &&
          src.formId !== formId &&
          src.formId !== info.createdObjectFormId &&
          ((src.recordType === 'WEAP' && this.obtainableWeaponFormIds.has(src.formId)) ||
            src.recordType === 'MISC' ||
            (src.recordType === 'BOOK' && (await this.isPlayerFacingBook(src.formId))));
        if (proven) {
          obtainable = true;
          signals.push(`cobjScrap:${info.edid}`);
          break;
        }
        signals.push(`cobjScrapUnproven:${info.edid}`);
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

    // A consumable's aged/spoiled state is referenced only by the state it ages
    // FROM, so ride along on a referencing ALCH that is itself reachable.
    if (!obtainable) {
      for (const alch of alchs) {
        if (await this.isPlayerFacingAlch(alch.form_id, 0, new Set())) {
          obtainable = true;
          signals.push(`alch:${alch.editor_id}`);
          break;
        }
      }
    }

    return { obtainable, signals };
  }

  /** An ALCH referencer (the previous state in a ferment/spoil chain) proves
   *  access when its own referencer chain reaches a player-facing type. */
  private async isPlayerFacingAlch(formId: string, depth: number, chain: Set<string>): Promise<boolean> {
    const cached = this.alchCache.get(formId);
    if (cached !== undefined) return cached;
    if (depth > ALCH_DEPTH_CAP || chain.has(formId)) return false;

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
        !(ref.record_type === 'COBJ' && isNonGrantingCobj(this.cobjIndex?.byFormId.get(ref.form_id), ref.editor_id)) &&
        OBTAINABLE_REF_TYPES[ref.record_type] !== undefined
    );
    if (!result) {
      for (const ref of refs) {
        if (JUNK_REFERRER_RE.test(ref.editor_id)) continue;
        if (ref.record_type === 'LVLI') {
          if (await this.isPlayerFacingLvli(ref.form_id, 0, new Set())) {
            result = true;
            break;
          }
        } else if (ref.record_type === 'ALCH') {
          if (await this.isPlayerFacingAlch(ref.form_id, depth + 1, chain)) {
            result = true;
            break;
          }
        }
      }
    }
    if (result || depth === 0) this.alchCache.set(formId, result);
    return result;
  }

  /** A dispensing activator (CAMP vending machine) proves access only when the
   *  player can BUILD it — i.e. a real, non-junk COBJ constructs it. Single
   *  hop: activators are never recursed, so a world activator that merely
   *  happens to hold a loot list can't launder access. */
  private async isCraftableActi(formId: string): Promise<boolean> {
    const cached = this.actiCache.get(formId);
    if (cached !== undefined) return cached;

    let refs;
    try {
      refs = await this.client.refs(formId);
    } catch {
      return false;
    }
    const result = refs.some(
      ref =>
        ref.record_type === 'COBJ' &&
        !JUNK_REFERRER_RE.test(ref.editor_id) &&
        !isNonGrantingCobj(this.cobjIndex?.byFormId.get(ref.form_id), ref.editor_id)
    );
    this.actiCache.set(formId, result);
    return result;
  }

  /** A plan BOOK proves access when a player can get the book: a direct
   *  terminal referencer (vendor CONT, GMRW, QUST, loose MISC, LGDI), or a
   *  player-facing LVLI chain (vendor recipe pools run deep — see
   *  BOOK_LVLI_DEPTH_CAP). Two referencer kinds that look like terminals are
   *  skipped: the COBJ the book teaches (circular), and FLST exclusion lists
   *  (BabylonExcludeList names every plan in the game and proves nothing). */
  private async isPlayerFacingBook(formId: string): Promise<boolean> {
    const cached = this.bookCache.get(formId);
    if (cached !== undefined) return cached;

    let refs;
    try {
      refs = await this.client.refs(formId);
    } catch {
      return false;
    }

    let result = refs.some(
      ref =>
        !JUNK_REFERRER_RE.test(ref.editor_id) &&
        ref.record_type !== 'COBJ' &&
        !(ref.record_type === 'FLST' && /exclude/i.test(ref.editor_id)) &&
        OBTAINABLE_REF_TYPES[ref.record_type] !== undefined
    );
    if (!result) {
      for (const ref of refs) {
        if (ref.record_type !== 'LVLI' || JUNK_REFERRER_RE.test(ref.editor_id)) continue;
        if (await this.isPlayerFacingLvli(ref.form_id, 0, new Set(), BOOK_LVLI_DEPTH_CAP)) {
          result = true;
          break;
        }
      }
    }
    this.bookCache.set(formId, result);
    return result;
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
        !(ref.record_type === 'COBJ' && isNonGrantingCobj(this.cobjIndex?.byFormId.get(ref.form_id), ref.editor_id)) &&
        (OBTAINABLE_REF_TYPES[ref.record_type] !== undefined ||
          (ref.record_type === 'WEAP' && this.obtainableWeaponFormIds.has(ref.form_id)) ||
          (ref.record_type === 'ARMO' && this.obtainableArmorFormIds.has(ref.form_id)))
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
   *  loot (non-QA CONT/GMRW/QUST, or a RESO camp generator's produce list)
   *  rather than only NPC loadouts. A dispensing ACTI counts too, but only if
   *  the player can build it (see isCraftableActi). */
  private async isPlayerFacingLvli(formId: string, depth: number, chain: Set<string>, cap = LVLI_DEPTH_CAP): Promise<boolean> {
    // Verdicts are cap-specific: a `false` under the shallow default cap may
    // be a truncation that the deeper book-chase cap would walk through.
    const cacheKey = `${cap}:${formId}`;
    const cached = this.lvliCache.get(cacheKey);
    if (cached !== undefined) return cached;
    if (depth > cap || chain.has(formId)) return false;

    let refs;
    try {
      refs = await this.client.refs(formId);
    } catch {
      return false;
    }
    chain.add(formId);

    let result = refs.some(
      ref => !JUNK_REFERRER_RE.test(ref.editor_id) && LVLI_TERMINAL_TYPES.has(ref.record_type)
    );
    if (!result) {
      for (const ref of refs) {
        if (JUNK_REFERRER_RE.test(ref.editor_id)) continue;
        if (ref.record_type === 'ACTI') {
          if (await this.isCraftableActi(ref.form_id)) {
            result = true;
            break;
          }
        } else if (ref.record_type === 'LVLI') {
          if (await this.isPlayerFacingLvli(ref.form_id, depth + 1, chain, cap)) {
            result = true;
            break;
          }
        }
      }
    }
    if (result || depth === 0) this.lvliCache.set(cacheKey, result);
    return result;
  }
}
