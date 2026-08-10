import path from 'node:path';
import type { GeneratedArmor, GeneratedPerk } from '../../src/types/generated';
import { buildApGrantIndex } from './ap-grant-index';
import { buildCobjIndex } from './cobj-index';
import { buildCrossFamilyRankMap } from './normalize/conditions';
import { extractWeapons } from './extract-weapons';
import { extractPerks } from './extract-perks';
import { extractArmor } from './extract-armor';
import { extractOmods } from './extract-omods';
import { extractUniques } from './extract-uniques';
import { extractBuffs } from './extract-buffs';
import { extractBodyParts } from './extract-bodyparts';
import { extractHealing } from './extract-healing';
import { buildCurveTableBarrels, extractCurveTables } from './extract-curvetables';
import { extractNpcs } from './extract-npcs';
import { extractConstants } from './extract-constants';
import { verifyDfobs } from './verify-dfobs';
import type { ExtractionPass, PassOutput } from './pass';

/**
 * One `ExtractionPass` per `KNOWN_EXTRACTORS` entry (`pass.ts`) — each is the
 * direct translation of one `if (only.includes(...))` block `run-all.ts`
 * used to inline. Behavior (console output, fallback semantics, write
 * shapes, meta-fold contents) is preserved exactly; see each pass's own
 * comments for the few places that changed on purpose (uniques now hard-
 * depends on omods instead of re-reading a possibly-stale `omods.json`).
 */

export const weaponsPass: ExtractionPass<'weapons'> = {
  id: 'weapons',
  async run(ctx) {
    console.log('Extracting weapons…');
    // Attach-point closure input (mod-granted slots). Costs one OMOD
    // list+bulkGet even on --only weapons runs; the warmed record cache
    // makes the omods pass (full runs) correspondingly cheaper.
    console.log('  building attach-point grant index…');
    const apGrantIndex = await buildApGrantIndex(ctx.client);
    const raw = await extractWeapons(ctx.client, apGrantIndex);
    console.log(
      `  ${raw.weapons.length} weapons (excluded: ${Object.entries(raw.excluded)
        .map(([k, v]) => `${v.length} ${k}`)
        .join(', ')})`,
    );
    return {
      raw,
      result: {
        outputs: [{ path: 'weapons.json', content: raw.weapons }],
        counts: { weapons: raw.weapons.length },
        excluded: raw.excluded,
        excludedDetailed: raw.excludedDetailed,
        unresolved: raw.unresolved,
      },
    };
  },
};

export const perksPass: ExtractionPass<'perks'> = {
  id: 'perks',
  async run(ctx) {
    console.log('Extracting perks…');
    const raw = await extractPerks(ctx.client);
    const unresolved = [...raw.unresolved];
    if (raw.unknownEntryPoints.length > 0) {
      unresolved.push(...raw.unknownEntryPoints.map((n) => `unknown entry point: ${n}`));
    }
    if (raw.unmappedAvifs.length > 0) {
      unresolved.push(...raw.unmappedAvifs.map((a) => `unmapped damage AVIF: ${a}`));
    }
    if (raw.unresolvedCards.length > 0) {
      unresolved.push(...raw.unresolvedCards.map((c) => `unresolved perk card: ${c}`));
    }
    console.log(
      `  ${raw.perks.length} perk families (junk: ${raw.excluded.junkEdid.length}, non-card: ${raw.excluded.noNameOrCard.length})`,
    );
    console.log(
      `  unknown entry points: ${raw.unknownEntryPoints.length}, unmapped AVIFs: ${raw.unmappedAvifs.length}, unresolved conds: ${raw.unresolved.length}, unresolved cards: ${raw.unresolvedCards.length}`,
    );
    return {
      raw,
      result: {
        outputs: [{ path: 'perks.json', content: raw.perks }],
        counts: { perks: raw.perks.length },
        excluded: { perkJunkEdid: raw.excluded.junkEdid, perkNoCard: raw.excluded.noNameOrCard },
        unresolved,
      },
    };
  },
};

export const armorPass: ExtractionPass<'armor'> = {
  id: 'armor',
  async run(ctx) {
    console.log('Extracting armor (obtainability grounding)…');
    const raw = await extractArmor(ctx.client);
    console.log(`  ${raw.armors.length} armor pieces (obtainable: ${raw.obtainableFormIds.size})`);
    return {
      raw,
      result: {
        outputs: [{ path: 'armor.json', content: raw.armors }],
        counts: { armor: raw.armors.length },
      },
    };
  },
};

export const omodsPass: ExtractionPass<'omods'> = {
  id: 'omods',
  // Hard: weapons.json genuinely can't be reconstructed from anything else
  // (today's --only omods without a prior weapons pass throws on a missing
  // file; pulling weapons in makes that a deliberate, working case instead).
  needs: ['weapons'],
  // Soft: perks/armor only sharpen HasPerk gates / armor-riding evidence —
  // extractOmods degrades gracefully without either (its own defaults).
  optionalNeeds: ['perks', 'armor'],
  async run(ctx) {
    console.log('Extracting OMODs…');
    const weapons = ctx.memoryOf('weapons')!;
    const allWeapons = weapons.weapons;
    const defaultModFormIds = new Set(allWeapons.flatMap((w) => w.defaultModFormIds ?? []));
    const templateModFormIds = new Set(allWeapons.flatMap((w) => w.templateModFormIds ?? []));

    let allPerks = ctx.memoryOf('perks')?.perks;
    if (!allPerks) {
      // `--only omods` without a perks pass: read the checked-in generated
      // set. Missing perks.json is survivable — cross-family HasPerk gates
      // just stay unresolved.
      allPerks = await ctx.readGenerated<GeneratedPerk[]>('perks.json');
      if (!allPerks) {
        console.warn('  no perks.json found — cross-family HasPerk gates will stay unresolved');
      }
    }
    const crossFamilyRank = allPerks
      ? buildCrossFamilyRankMap(allPerks.map((p) => ({ family: p.family, formIds: p.formIds })))
      : undefined;

    let obtainableArmorFormIds = ctx.memoryOf('armor')?.obtainableFormIds;
    if (!obtainableArmorFormIds) {
      // `--only omods` without an armor pass: read the checked-in generated
      // set (mirrors the perks fallback above). Missing armor.json is
      // survivable — armor-riding obtainability signals just stay absent.
      const allArmor = await ctx.readGenerated<GeneratedArmor[]>('armor.json');
      if (allArmor) {
        obtainableArmorFormIds = new Set(
          allArmor.filter((a) => a.obtainable !== false).map((a) => a.formId),
        );
      } else {
        console.warn('  no armor.json found — armor-riding obtainability signals will stay absent');
        obtainableArmorFormIds = new Set();
      }
    }

    console.log('  building COBJ index…');
    const cobjIndex = await buildCobjIndex(ctx.client);
    const raw = await extractOmods({
      client: ctx.client,
      obtainableWeaponFormIds: weapons.obtainableFormIds,
      cobjIndex,
      defaultModFormIds,
      templateModFormIds,
      crossFamilyRank,
      obtainableArmorFormIds,
    });

    const outputs: PassOutput[] = [
      { path: 'omods.json', content: raw.omods },
      { path: 'armor-omods.json', content: raw.armorOmods },
    ];
    // Replace variant-container formIds in weapon templates with their
    // emitted variant siblings (Camden Whacker, Relic Reaper) before uniques
    // extraction — mutates the SAME `allWeapons` array the (hard-dependent)
    // uniques pass reads via ctx.memoryOf('weapons').weapons, and re-writes
    // weapons.json whenever any variant container exists at all (matching
    // the original's gate, independent of whether any INDIVIDUAL weapon's
    // templateModFormIds actually changed).
    for (const weapon of allWeapons) {
      const ids = weapon.templateModFormIds;
      if (!ids?.length) continue;
      let changed = false;
      const rewritten: string[] = [];
      for (const formId of ids) {
        const variants = raw.variantContainers[formId];
        if (variants?.length) {
          rewritten.push(...variants.map((v) => v.formId));
          changed = true;
        } else {
          rewritten.push(formId);
        }
      }
      if (changed) weapon.templateModFormIds = rewritten;
    }
    if (Object.keys(raw.variantContainers).length > 0) {
      outputs.push({ path: 'weapons.json', content: allWeapons });
    }

    console.log(
      `  ${raw.omods.length} named weapon OMODs, ${raw.armorOmods.length} named armor OMODs (excluded: ${Object.entries(
        raw.excluded,
      )
        .map(([k, v]) => `${v.length} ${k}`)
        .join(', ')}); unknown properties: ${raw.unknownProperties.length}; weak-evidence review: ${
        raw.reviewFlagged.omodWeakEvidence.length
      }`,
    );

    return {
      raw,
      result: {
        outputs,
        counts: { omods: raw.omods.length, armorOmods: raw.armorOmods.length },
        excluded: raw.excluded,
        excludedDetailed: raw.excludedDetailed,
        reviewFlagged: raw.reviewFlagged,
        unresolved: [
          ...raw.unknownProperties.map((p) => `unknown OMOD property: ${p}`),
          ...raw.notes,
        ],
      },
    };
  },
};

export const uniquesPass: ExtractionPass<'uniques'> = {
  id: 'uniques',
  // Hard, on purpose (unlike omods' deps above): the variant-container
  // rewrite omods just did has NO on-disk representation, so reading
  // omods.json off disk here — even a freshly-written one — either misses it
  // (no rewrite happened yet, this run's omods pass hasn't executed) or,
  // worse, silently uses a STALE weapons.json when uniques runs without
  // omods at all. Requiring omods in memory removes the whole failure class.
  needs: ['weapons', 'omods'],
  async run(ctx) {
    console.log('Extracting unique weapon presets…');
    const weapons = ctx.memoryOf('weapons')!;
    const omods = ctx.memoryOf('omods')!;
    const raw = await extractUniques(
      ctx.client,
      weapons.weapons,
      omods.omods,
      omods.variantContainers,
    );
    console.log(
      `  ${raw.uniques.length} unique presets (skipped combinations: ${raw.skipped.length})`,
    );
    return {
      raw,
      result: {
        outputs: [{ path: 'uniques.json', content: raw.uniques }],
        counts: { uniques: raw.uniques.length },
        reviewFlagged:
          raw.skipped.length > 0
            ? {
                skippedUniqueCombinations: raw.skipped.map((s) => ({
                  id: `${s.weaponId}:${s.combinationName}`,
                  name: s.reason,
                })),
              }
            : undefined,
      },
    };
  },
};

export const buffsPass: ExtractionPass<'buffs'> = {
  id: 'buffs',
  async run(ctx) {
    console.log('Extracting mutations & consumables…');
    const raw = await extractBuffs(ctx.client);
    console.log(
      `  ${raw.mutations.length} mutations, ${raw.consumables.length} consumables, ${raw.addictions.length} addictions (excluded: ${Object.entries(
        raw.excluded,
      )
        .map(([k, v]) => `${v.length} ${k}`)
        .join(', ')}; notes: ${raw.notes.length})`,
    );
    return {
      raw,
      result: {
        outputs: [
          { path: 'mutations.json', content: raw.mutations },
          { path: 'consumables.json', content: raw.consumables },
          { path: 'addictions.json', content: raw.addictions },
        ],
        counts: {
          mutations: raw.mutations.length,
          consumables: raw.consumables.length,
          addictions: raw.addictions.length,
        },
        excluded: raw.excluded,
        excludedDetailed: raw.excludedDetailed,
        unresolved: [...raw.notes, ...raw.unmappedAvifs.map((a) => `unmapped buff AVIF: ${a}`)],
      },
    };
  },
};

export const bodypartsPass: ExtractionPass<'bodyparts'> = {
  id: 'bodyparts',
  async run(ctx) {
    console.log('Extracting enemy body parts…');
    const raw = await extractBodyParts(ctx.client);
    console.log(`  ${raw.races.length} races (unresolved: ${raw.unresolved.length})`);
    return {
      raw,
      result: {
        outputs: [{ path: 'bodyparts.json', content: raw.races }],
        counts: { bodypartRaces: raw.races.length },
        unresolved: raw.unresolved,
      },
    };
  },
};

export const healingPass: ExtractionPass<'healing'> = {
  id: 'healing',
  async run(ctx) {
    console.log('Extracting Stimpak/RadAway-adjacent healing items…');
    const raw = await extractHealing(ctx.client);
    console.log(`  ${raw.items.length} healing items (unresolved: ${raw.unresolved.length})`);
    return {
      raw,
      result: {
        outputs: [{ path: 'healing-items.json', content: raw.items }],
        counts: { healingItems: raw.items.length },
        unresolved: raw.unresolved,
      },
    };
  },
};

export const curvetablesPass: ExtractionPass<'curvetables'> = {
  id: 'curvetables',
  async run(ctx) {
    console.log('Extracting creature/player universal curve tables…');
    // Different output root than every other pass: curvetables live at
    // src/data/<mode>/curvetables/, not .../generated/ (see
    // extract-curvetables.ts) — an absolute PassOutput.path routes there
    // instead of ctx.outDir.
    const curveDir = path.join(ctx.outDir, '..', 'curvetables');
    const raw = await extractCurveTables(ctx.client);
    const barrels = buildCurveTableBarrels(raw.files);
    console.log(
      `  ${raw.files.length} curve table files + ${barrels.length} barrels written → ${curveDir} (unresolved: ${raw.unresolved.length})`,
    );
    return {
      raw,
      result: {
        outputs: [
          ...raw.files.map(
            (file): PassOutput => ({
              path: path.join(curveDir, file.relativePath),
              content: file.content,
            }),
          ),
          ...barrels.map(
            (barrel): PassOutput => ({
              path: path.join(curveDir, barrel.relativePath),
              content: barrel.source,
              raw: true,
            }),
          ),
        ],
        counts: { curvetables: raw.files.length, curvetableBarrels: barrels.length },
        unresolved: raw.unresolved,
      },
    };
  },
};

export const npcsPass: ExtractionPass<'npcs'> = {
  id: 'npcs',
  async run(ctx) {
    console.log('Extracting curated-target NPC stats…');
    const raw = await extractNpcs(ctx.client);
    console.log(`  ${raw.npcs.length} npcs (unresolved: ${raw.unresolved.length})`);
    return {
      raw,
      result: {
        outputs: [{ path: 'npcs.json', content: raw.npcs }],
        counts: { npcs: raw.npcs.length },
        unresolved: raw.unresolved,
      },
    };
  },
};

export const constantsPass: ExtractionPass<'constants'> = {
  id: 'constants',
  async run(ctx) {
    console.log('Extracting game-wide scalar constants…');
    const raw = await extractConstants(ctx.client);
    console.log(
      `  special clamp [${raw.constants.special.min}, ${raw.constants.special.max}], ` +
        `mitigation exp=${raw.constants.mitigation.resistExponent} factor=${raw.constants.mitigation.damageFactor} ` +
        `clamp=[${raw.constants.mitigation.minReduction}, ${raw.constants.mitigation.maxReduction}], ` +
        `vatsCritBase=${raw.constants.vatsCrit.chargeBase}, ` +
        `apPool=${raw.constants.actionPoints.poolBase}+${raw.constants.actionPoints.poolPerAgility}×AGI ` +
        `regenDelay=${raw.constants.actionPoints.regenDelaySec}s regen=${raw.constants.actionPoints.regenRatePct}%/` +
        `${raw.constants.actionPoints.regenRatePctPowerArmor}%PA, ` +
        `bulletStormAmmoPerStack=${raw.constants.bulletStorm.ammoPerStack}, ` +
        `closeThreshold=${raw.constants.distance.closeThresholdUnits} ` +
        `(unresolved: ${raw.unresolved.length})`,
    );
    return {
      raw,
      result: {
        outputs: [{ path: 'constants.json', content: raw.constants }],
        counts: { constants: 1 },
        unresolved: raw.unresolved,
      },
    };
  },
};

export const dfobsPass: ExtractionPass<'dfobs'> = {
  id: 'dfobs',
  async run(ctx) {
    console.log(
      'Verifying DFOB bridges (hardcoded record identities vs the exe indirection layer)…',
    );
    const raw = await verifyDfobs(ctx.client);
    console.log(`  ${raw.verified} bridges verified (unresolved: ${raw.unresolved.length})`);
    return {
      raw,
      result: {
        outputs: [],
        counts: { dfobs: raw.verified },
        unresolved: raw.unresolved,
      },
    };
  },
};

export const PASSES: readonly ExtractionPass[] = [
  weaponsPass,
  perksPass,
  armorPass,
  omodsPass,
  uniquesPass,
  buffsPass,
  bodypartsPass,
  healingPass,
  curvetablesPass,
  npcsPass,
  constantsPass,
  dfobsPass,
];
