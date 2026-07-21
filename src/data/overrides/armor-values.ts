import type { Modifier } from '@/types/modifiers';

/**
 * Extraction-SHAPE fixes for armor OMODs (Phase 3 armor pipeline, engine
 * half) — mirrors `legendary-values.ts`'s "second, unrelated purpose"
 * (Cremator's Slow-Burner): these REPLACE an omod's whole extracted
 * `modifiers` array to correct a condition-translation artifact, not to
 * supply a script-computed magnitude. Every value below is still the
 * extracted ESM value; only the condition shape changes. Keyed by armor-OMOD
 * edid; `dataset.ts` applies this the same way `legendaryValueOverrides`
 * applies to weapon omods.
 *
 * Also used for a magnitude-preserving simplification (Battle-Loader's):
 * dropping condition rows that are provably redundant with the modifier's
 * own baked-in value or genuinely unmodeled (bash cadence) — see the entry's
 * own comment and docs/assumptions.md "Armor".
 */
export const armorLegendaryValueOverrides: Readonly<Record<string, Modifier[]>> = {
  // Battle-Loader's (armor + PA): the extracted modifiers carry the correct
  // wornPieceCount tier (1/2/3/4/≥5 → 15/30/45/60/75% reloadSkipChanceBash)
  // PLUS three `unresolved` conditions (IsPowerAttacking()=1,
  // GetRandomPercent()=N, GetDead()=0) — see docs/assumptions.md "Armor
  // pipeline (Phase 3 extraction)". `evalCondition`'s `unresolved` case
  // always returns null, so ANY unresolved condition permanently
  // deactivates a modifier regardless of its other conditions — wiring
  // wornPieceCount alone can't make these fire. All three are safe to drop:
  //   - GetRandomPercent()=N is the SAME chance already baked into `value`
  //     (0.15/0.30/0.45/0.60/0.75) — keeping it as a gate would be double-
  //     applying the same probability, not an independent condition.
  //   - GetDead()=0 is a target-alive sanity check with no UI input and no
  //     failure mode this calculator models (a dead target has no DPS to
  //     compute in the first place).
  //   - IsPowerAttacking()=1 is the real per-bash trigger — DROPPED as a
  //     CONDITION (bash cadence, i.e. how often a bash happens vs. an
  //     ordinary reload, is still unmodeled), but its bash-ness is preserved
  //     STRUCTURALLY instead: Battle-Loader's uses the `reloadSkipChanceBash`
  //     bucket (EP199 "Instant Reload Clip On Bash"), not the plain
  //     `reloadSkipChance` channel Quick Hands / Wild West Wind use (EP182
  //     "Auto Fill Weapon Clip", passive on the reload itself, never
  //     bash-taxed). That split (2026-07-19, Phase C — go-through-every-
  //     single-silly-whistle.md) is what lets `sustain.ts` charge a real
  //     time cost (`PlayerConditions.battleLoadersBashSec`) for Battle-
  //     Loader's specifically instead of treating it as Quick-Hands-style
  //     free/sustained skip — see docs/assumptions.md "Reload-skip &
  //     free-ammo expected value".
  mod_Legendary_Armor4_BattleLoaders: [
    {
      id: 'mod_Legendary_Armor4_BattleLoaders:override:0',
      source: { kind: 'omod', formId: '0x00792A28', edid: 'mod_Legendary_Armor4_BattleLoaders', name: "Battle-Loader's" },
      bucket: 'reloadSkipChanceBash',
      op: 'ADD',
      value: 0.15,
      conditions: [{ kind: 'wornPieceCount', keyword: 'HasLegendary_Armor_BattleLoaders', count: 1 }],
    },
    {
      id: 'mod_Legendary_Armor4_BattleLoaders:override:1',
      source: { kind: 'omod', formId: '0x00792A28', edid: 'mod_Legendary_Armor4_BattleLoaders', name: "Battle-Loader's" },
      bucket: 'reloadSkipChanceBash',
      op: 'ADD',
      value: 0.3,
      conditions: [{ kind: 'wornPieceCount', keyword: 'HasLegendary_Armor_BattleLoaders', count: 2 }],
    },
    {
      id: 'mod_Legendary_Armor4_BattleLoaders:override:2',
      source: { kind: 'omod', formId: '0x00792A28', edid: 'mod_Legendary_Armor4_BattleLoaders', name: "Battle-Loader's" },
      bucket: 'reloadSkipChanceBash',
      op: 'ADD',
      value: 0.45,
      conditions: [{ kind: 'wornPieceCount', keyword: 'HasLegendary_Armor_BattleLoaders', count: 3 }],
    },
    {
      id: 'mod_Legendary_Armor4_BattleLoaders:override:3',
      source: { kind: 'omod', formId: '0x00792A28', edid: 'mod_Legendary_Armor4_BattleLoaders', name: "Battle-Loader's" },
      bucket: 'reloadSkipChanceBash',
      op: 'ADD',
      value: 0.6,
      conditions: [{ kind: 'wornPieceCount', keyword: 'HasLegendary_Armor_BattleLoaders', count: 4 }],
    },
    {
      id: 'mod_Legendary_Armor4_BattleLoaders:override:4',
      source: { kind: 'omod', formId: '0x00792A28', edid: 'mod_Legendary_Armor4_BattleLoaders', name: "Battle-Loader's" },
      bucket: 'reloadSkipChanceBash',
      op: 'ADD',
      value: 0.75,
      conditions: [{ kind: 'wornPieceCount', keyword: 'HasLegendary_Armor_BattleLoaders', count: 5, orMore: true }],
    },
  ],
  mod_Legendary_PowerArmor4_BattleLoaders: [
    {
      id: 'mod_Legendary_PowerArmor4_BattleLoaders:override:0',
      source: { kind: 'omod', formId: '0x007A74C2', edid: 'mod_Legendary_PowerArmor4_BattleLoaders', name: "Battle-Loader's" },
      bucket: 'reloadSkipChanceBash',
      op: 'ADD',
      value: 0.15,
      conditions: [{ kind: 'wornPieceCount', keyword: 'HasLegendary_Armor_BattleLoaders', count: 1 }],
    },
    {
      id: 'mod_Legendary_PowerArmor4_BattleLoaders:override:1',
      source: { kind: 'omod', formId: '0x007A74C2', edid: 'mod_Legendary_PowerArmor4_BattleLoaders', name: "Battle-Loader's" },
      bucket: 'reloadSkipChanceBash',
      op: 'ADD',
      value: 0.3,
      conditions: [{ kind: 'wornPieceCount', keyword: 'HasLegendary_Armor_BattleLoaders', count: 2 }],
    },
    {
      id: 'mod_Legendary_PowerArmor4_BattleLoaders:override:2',
      source: { kind: 'omod', formId: '0x007A74C2', edid: 'mod_Legendary_PowerArmor4_BattleLoaders', name: "Battle-Loader's" },
      bucket: 'reloadSkipChanceBash',
      op: 'ADD',
      value: 0.45,
      conditions: [{ kind: 'wornPieceCount', keyword: 'HasLegendary_Armor_BattleLoaders', count: 3 }],
    },
    {
      id: 'mod_Legendary_PowerArmor4_BattleLoaders:override:3',
      source: { kind: 'omod', formId: '0x007A74C2', edid: 'mod_Legendary_PowerArmor4_BattleLoaders', name: "Battle-Loader's" },
      bucket: 'reloadSkipChanceBash',
      op: 'ADD',
      value: 0.6,
      conditions: [{ kind: 'wornPieceCount', keyword: 'HasLegendary_Armor_BattleLoaders', count: 4 }],
    },
    {
      id: 'mod_Legendary_PowerArmor4_BattleLoaders:override:4',
      source: { kind: 'omod', formId: '0x007A74C2', edid: 'mod_Legendary_PowerArmor4_BattleLoaders', name: "Battle-Loader's" },
      bucket: 'reloadSkipChanceBash',
      op: 'ADD',
      value: 0.75,
      conditions: [{ kind: 'wornPieceCount', keyword: 'HasLegendary_Armor_BattleLoaders', count: 5, orMore: true }],
    },
  ],

  // Bruiser's / Ranger's (armor + PA): "Melee/Ranged Weapons Deal +5% Bonus
  // Damage (up to +25% on Full Stack)" per the OMOD's own ESM description —
  // 5% per worn piece, same per-piece-scaling shape as Unyielding/2★ SPECIAL.
  // The extracted condition wrongly types the worn-piece gate as a
  // `weaponKeyword` check on `HasLegendary_Armor_{Bruiser,Ranger}` — that
  // keyword is added to the ARMOR OMOD (`addedKeywords`), never to a weapon,
  // so `ctx.weapon.keywords` can never contain it and the modifier is
  // permanently dead as extracted (same class of bug as the `GetIsPlayer`
  // Run-On-Target fix logged in docs/assumptions.md "Armor pipeline (Phase 3
  // extraction)", but this exact row wasn't caught by that fix). Dropping
  // the broken keyword gate and letting the generic per-piece value×count
  // scaling (`src/data/armor-modifiers.ts`) reconstruct the 5/10/15/20/25%
  // ladder from the single 5%-per-piece value is the same "trust the
  // description, keep the real weapon-class gate" shape as the Battle-
  // Loader's fix above — the value and the weapon-class condition are both
  // still ESM-extracted, only the broken keyword condition is removed.
  mod_Legendary_Armor4_Bruiser: [
    {
      id: 'mod_Legendary_Armor4_Bruiser:override:0',
      source: { kind: 'omod', formId: '0x00792A2A', edid: 'mod_Legendary_Armor4_Bruiser', name: "Bruiser's" },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.05,
      conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeMeleeGeneral', present: true }],
    },
  ],
  mod_Legendary_PowerArmor4_Bruiser: [
    {
      id: 'mod_Legendary_PowerArmor4_Bruiser:override:0',
      source: { kind: 'omod', formId: '0x007A74CD', edid: 'mod_Legendary_PowerArmor4_Bruiser', name: "Bruiser's" },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.05,
      conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeMeleeGeneral', present: true }],
    },
  ],
  mod_Legendary_Armor4_Ranger: [
    {
      id: 'mod_Legendary_Armor4_Ranger:override:0',
      source: { kind: 'omod', formId: '0x00792A34', edid: 'mod_Legendary_Armor4_Ranger', name: "Ranger's" },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.05,
      conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeRanged', present: true }],
    },
  ],
  mod_Legendary_PowerArmor4_Ranger: [
    {
      id: 'mod_Legendary_PowerArmor4_Ranger:override:0',
      source: { kind: 'omod', formId: '0x007A74CE', edid: 'mod_Legendary_PowerArmor4_Ranger', name: "Ranger's" },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.05,
      conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeRanged', present: true }],
    },
  ],
};
