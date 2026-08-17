import type { Modifier } from '@/types/modifiers';

/**
 * Extraction-SHAPE fixes for armor OMODs (Phase 3 armor pipeline, engine
 * half) — mirrors `legendary-values.ts`'s "second, unrelated purpose"
 * (Cremator's Slow-Burner): these REPLACE an omod's whole extracted
 * `modifiers` array to correct a condition-translation artifact, not to
 * supply a script-computed magnitude. Every value below is still the
 * extracted ESM value; only the condition shape changes. Keyed by armor-OMOD
 * edid; `dataset.ts` applies this the same way `legendaryValueOverrides`
 * applies to weapon omods. `dataset.test.ts` enforces the value-preservation
 * promise above, so an ESM retune can't strand a literal here.
 *
 * Prefer fixing a translation artifact at its source in
 * `scripts/extract/normalize/mgef.ts` when the extractor has enough
 * information to emit the right shape — Battle-Loader's lived here until
 * 2026-08-17 purely because its EP-199 branch stopped short of the final
 * shape, and moving that one entry-point mapping upstream deleted ~190 lines
 * of hand-maintained literals from this file. What belongs here is the
 * residue the extractor genuinely can't know: cross-record inferences like
 * Propelling's PA-exclusivity (established from its granting COBJ, not its
 * own effect) or a gate sourced from an OMOD's prose description.
 */
export const armorLegendaryValueOverrides: Readonly<Record<string, Modifier[]>> = {
  // Bruiser's / Ranger's (armor + PA): "Melee/Ranged Weapons Deal +5% Bonus
  // Damage (up to +25% on Full Stack)" per the OMOD's own ESM description —
  // 5% per worn piece, same per-piece-scaling shape as Unyielding/2★ SPECIAL.
  // The extracted condition wrongly types the worn-piece gate as a
  // `weaponKeyword` check on `HasLegendary_Armor_{Bruiser,Ranger}` — that
  // keyword is added to the ARMOR OMOD (`addedKeywords`), never to a weapon,
  // so `ctx.weapon.keywords` can never contain it and the modifier is
  // permanently dead as extracted (same class of bug as the `GetIsPlayer`
  // Run-On-Target fix logged in docs/assumptions.md "Armor extraction
  // pipeline", but this exact row wasn't caught by that fix). Dropping
  // the broken keyword gate and letting the generic per-piece value×count
  // scaling (`src/data/armor-modifiers.ts`) reconstruct the 5/10/15/20/25%
  // ladder from the single 5%-per-piece value is the same "trust the
  // description, keep the real weapon-class gate" shape as the Battle-
  // Loader's fix above — the value and the weapon-class condition are both
  // still ESM-extracted, only the broken keyword condition is removed.
  mod_Legendary_Armor4_Bruiser: [
    {
      id: 'mod_Legendary_Armor4_Bruiser:override:0',
      source: {
        kind: 'omod',
        formId: '0x00792A2A',
        edid: 'mod_Legendary_Armor4_Bruiser',
        name: "Bruiser's",
      },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.05,
      conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeMeleeGeneral', present: true }],
    },
  ],
  mod_Legendary_PowerArmor4_Bruiser: [
    {
      id: 'mod_Legendary_PowerArmor4_Bruiser:override:0',
      source: {
        kind: 'omod',
        formId: '0x007A74CD',
        edid: 'mod_Legendary_PowerArmor4_Bruiser',
        name: "Bruiser's",
      },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.05,
      conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeMeleeGeneral', present: true }],
    },
  ],
  mod_Legendary_Armor4_Ranger: [
    {
      id: 'mod_Legendary_Armor4_Ranger:override:0',
      source: {
        kind: 'omod',
        formId: '0x00792A34',
        edid: 'mod_Legendary_Armor4_Ranger',
        name: "Ranger's",
      },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.05,
      conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeRanged', present: true }],
    },
  ],
  mod_Legendary_PowerArmor4_Ranger: [
    {
      id: 'mod_Legendary_PowerArmor4_Ranger:override:0',
      source: {
        kind: 'omod',
        formId: '0x007A74CE',
        edid: 'mod_Legendary_PowerArmor4_Ranger',
        name: "Ranger's",
      },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.05,
      conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeRanged', present: true }],
    },
  ],
  // Propelling (4★ legendary, mod_Legendary_PowerArmor4_Propelling
  // 0x00792A29): unlike Bruiser's/Ranger's above, Propelling has no plain-
  // armor sibling record at all — its own OMOD's Target OMOD Keywords
  // resolve to ma_legendarycrafting_powerarmor + ma_PowerArmorMod, and its
  // granting COBJ (co_mod_Legendary_PowerArmor4_Propelling 0x007A120A) is
  // gated on Workbench Keyword Workbench_Crafting_PowerArmor — verified
  // 2026-08-03 via `esm get`/`esm refs`. So it can only ever be crafted onto
  // a power-armor piece, meaning the ESM's own moveSpeedBonus modifier
  // (unconditional in the extracted data) is APP-INFERRED to also require
  // `inPowerArmor` here — not an ESM condition, since the enchantment effect
  // itself carries none. NOT a general rule: `ma_PowerArmorMod` is shared by
  // thousands of records including ordinary dual-availability legendaries
  // (Powered, Overeater's, the SPECIAL cards, Active, Healthy, Bruiser's/
  // Ranger's, Limit-Breaking, Crusaders — all confirmed to have a real
  // plain-armor sibling record), so it is NOT a safe PA-exclusivity signal
  // on its own; this override is scoped to the one instance whose COBJ was
  // individually verified.
  mod_Legendary_PowerArmor4_Propelling: [
    {
      id: '0x00792A29:ench:0',
      source: {
        kind: 'omod',
        formId: '0x00792A29',
        edid: 'mod_Legendary_PowerArmor4_Propelling',
        name: 'Propelling',
      },
      bucket: 'moveSpeedBonus',
      op: 'ADD',
      value: 0.05,
      conditions: [{ kind: 'inPowerArmor', value: true }],
    },
  ],
};
