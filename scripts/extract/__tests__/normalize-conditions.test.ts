import { describe, it, expect } from 'bun:test';
import {
  flattenPerkConditionRows,
  translateConditions,
  type ConditionTranslationContext,
  type RawCondition,
} from '../normalize/conditions';
import type { EsmRecord } from '../esm-client';
import type { Condition } from '@/types/modifiers';
import { eq } from './normalize-fixture';
import ghlGlowingCriticals01 from './fixtures/perk-ghlglowingcriticals01.json';
import ghlMadScientist01 from './fixtures/perk-ghlmadscientist01.json';

// Owns raw condition semantics: `translateConditions` and
// `flattenPerkConditionRows` against literal rows and real ESM fixtures.
// Callers (MGEF/ENCH/perk translation, extractPerks) keep only the cases that
// prove they propagate these results.

interface ConditionCase {
  name: string;
  rows: RawCondition[];
  ctx?: Partial<ConditionTranslationContext>;
  conditions: Condition[] | null;
  unresolved?: string[];
}

function itTranslatesConditions(cases: ConditionCase[]): void {
  for (const row of cases) {
    it(row.name, () => {
      const { conditions, unresolved } = translateConditions(row.rows, {
        edidByFormId: new Map(),
        ...row.ctx,
      });
      expect(conditions).toEqual(row.conditions);
      expect(unresolved).toEqual(row.unresolved ?? []);
    });
  }
}

describe('translateConditions (2026-07-10 review)', () => {
  const kw = (formId: string, andOr?: string): RawCondition => ({
    Function: 'HasKeyword',
    'Parameter 1': formId,
    'Comparison Value': 1,
    Operator: 'Equal To',
    ...(andOr ? { 'AND/OR': andOr } : {}),
  });

  it("translates an enemy-type OR-group to enemyTypeAny (Ghoul Slayer's route conditions)", () => {
    const edidMap = new Map([
      ['0xFERAL', 'ActorTypeFeralGhoul'],
      ['0xGHOUL', 'ActorTypeGhoul'],
    ]);
    const { conditions } = translateConditions([kw('0xFERAL', 'OR'), kw('0xGHOUL')], {
      edidByFormId: edidMap,
    });
    expect(conditions).toEqual([
      { kind: 'enemyTypeAny', keywordsOrRaces: ['ActorTypeFeralGhoul', 'ActorTypeGhoul'] },
    ]);
  });

  const healthPct = (
    fn: string,
    operator: string,
    cmp: number | string,
    extra: Partial<RawCondition> = {},
  ): RawCondition => ({ Function: fn, 'Comparison Value': cmp, Operator: operator, ...extra });

  itTranslatesConditions([
    {
      name: "resolves a GLOB-valued target GetHealthPercentage to enemyHealthBelowPct (Executioner's ≤ LGND_ExecuteHealthThreshold)",
      rows: [
        healthPct('GetHealthPercentage', 'Less Than Or Equal To', '0xGLOB', { 'Run On': 'Target' }),
      ],
      ctx: { globalValues: new Map([['0xGLOB', 0.4]]) },
      conditions: [{ kind: 'enemyHealthBelowPct', pct: 40 }],
    },
    {
      name: 'translates target GetHealthPercentage ≥ to enemyHealthAbovePct (Instigating ≥60%)',
      rows: [
        healthPct('GetHealthPercentage', 'Greater Than Or Equal To', 0.6, { 'Run On': 'Target' }),
      ],
      conditions: [{ kind: 'enemyHealthAbovePct', pct: 60 }],
    },
    {
      name: "translates player GetHealthPercentage ≤ to healthBelowPct with no inclusive flag (Foundation's Vengeance ≤0.25)",
      rows: [healthPct('GetHealthPercentage', 'Less Than Or Equal To', 0.25)],
      conditions: [{ kind: 'healthBelowPct', pct: 25 }],
    },
    {
      name: 'translates player GetHealthPercentage strict < to healthBelowPct with inclusive: false',
      rows: [healthPct('GetHealthPercentage', 'Less Than', 0.25)],
      conditions: [{ kind: 'healthBelowPct', pct: 25, inclusive: false }],
    },
    {
      name: 'translates target GetHealthPercentage strict < to enemyHealthBelowPct with inclusive: false',
      rows: [healthPct('GetHealthPercentage', 'Less Than', 0.4, { 'Run On': 'Target' })],
      conditions: [{ kind: 'enemyHealthBelowPct', pct: 40, inclusive: false }],
    },
    {
      name: 'translates target GetHealthPercentage strict > to enemyHealthAbovePct with inclusive: false',
      rows: [healthPct('GetHealthPercentage', 'Greater Than', 0.6, { 'Run On': 'Target' })],
      conditions: [{ kind: 'enemyHealthAbovePct', pct: 60, inclusive: false }],
    },
    {
      name: 'translates GetValuePercent(Health) strict < to healthBelowPct with inclusive: false (Emergency Protocols)',
      rows: [healthPct('GetValuePercent', 'Less Than', 0.2, { 'Parameter 1': '0x000002D4' })],
      conditions: [{ kind: 'healthBelowPct', pct: 20, inclusive: false }],
    },
    {
      name: 'translates GetValuePercent(Health) ≤ to healthBelowPct with no inclusive flag',
      rows: [
        healthPct('GetValuePercent', 'Less Than Or Equal To', 0.25, {
          'Parameter 1': '0x000002D4',
        }),
      ],
      conditions: [{ kind: 'healthBelowPct', pct: 25 }],
    },
    {
      name: 'translates GetValuePercent with non-Health param to unresolved (operator preserved)',
      rows: [healthPct('GetValuePercent', 'Equal To', 0, { 'Parameter 1': '0x000002EA' })],
      conditions: [
        expect.objectContaining({
          kind: 'unresolved',
          raw: expect.stringMatching(/GetValuePercent.*Equal To/),
        }),
      ],
      unresolved: ['GetValuePercent(0x000002EA) Equal To 0'],
    },
  ]);
});

describe('translateConditions (WornHasKeyword unique self-gate allowlist — Bullet Storm, 2026-07-16)', () => {
  const worn = (formId: string): RawCondition =>
    eq('WornHasKeyword', 1, { 'Parameter 1': formId, 'Run On': 'Subject' });

  itTranslatesConditions([
    {
      name: "translates WornHasKeyword(CustomItemName_FoundationsVengeance) to a weaponKeyword condition instead of unresolved (Foundation's Vengeance +5 max-stack tier)",
      rows: [worn('0xFV')],
      ctx: { edidByFormId: new Map([['0xFV', 'CustomItemName_FoundationsVengeance']]) },
      conditions: [
        { kind: 'weaponKeyword', keyword: 'CustomItemName_FoundationsVengeance', present: true },
      ],
    },
    {
      name: "translates WornHasKeyword(RD01_CustomItemName_Valkyrie) to a weaponKeyword condition (Valkyrie's spin-up curve gate)",
      rows: [worn('0xVLK')],
      ctx: { edidByFormId: new Map([['0xVLK', 'RD01_CustomItemName_Valkyrie']]) },
      conditions: [
        { kind: 'weaponKeyword', keyword: 'RD01_CustomItemName_Valkyrie', present: true },
      ],
    },
    {
      name: 'leaves an off-allowlist CustomItemName_* keyword (dn_TheActionHero) unresolved — deliberately not added, its gated effect is data-broken either way',
      rows: [worn('0xTAH')],
      ctx: { edidByFormId: new Map([['0xTAH', 'dn_TheActionHero']]) },
      conditions: [{ kind: 'unresolved', raw: 'WornHasKeyword(dn_TheActionHero)=1' }],
      unresolved: ['WornHasKeyword(dn_TheActionHero)=1'],
    },
  ]);
});

describe('translateConditions (tautologicalKeywords — Tone Death Well Tuned keyword-hook, 2026-08-20)', () => {
  const row: RawCondition = {
    Function: 'WornHasKeyword',
    'Parameter 1': '0x0064D000',
    'Comparison Value': 1,
    Operator: 'Equal To',
    'Run On': 'Subject',
  };
  const edidMap = new Map([['0x0064D000', 'CustomItemName_ToneDeath']]);

  it('leaves WornHasKeyword(CustomItemName_ToneDeath) unresolved off the unique self-gate allowlist', () => {
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: edidMap });
    expect(conditions).toEqual([
      { kind: 'unresolved', raw: 'WornHasKeyword(CustomItemName_ToneDeath)=1' },
    ]);
    expect(unresolved).toEqual(['WornHasKeyword(CustomItemName_ToneDeath)=1']);
  });

  it('consumes WornHasKeyword(CustomItemName_ToneDeath) when listed as tautological (OMOD self-gate)', () => {
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: edidMap,
      tautologicalKeywords: new Set(['CustomItemName_ToneDeath']),
    });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });
});

describe('translateConditions (GetIsPlayer — granted self-gate, subjectIsTarget Contact inversion 2026-07-14, Run On: Target 2026-07-18)', () => {
  itTranslatesConditions([
    {
      name: 'consumes GetIsPlayer()=1 (granted-perk self-gate) instead of leaving it unresolved',
      rows: [eq('GetIsPlayer', 1)],
      conditions: [],
    },
    {
      name: 'marks GetIsPlayer()=0 inactive in the default (granted-to-player) reading when subjectIsTarget is unset',
      rows: [eq('GetIsPlayer', 0)],
      conditions: null,
    },
    {
      name: 'consumes GetIsPlayer()=0 (the NPC branch) instead of marking it inactive, when subjectIsTarget is set',
      rows: [eq('GetIsPlayer', 0, { 'Run On': 'Subject' })],
      ctx: { subjectIsTarget: true },
      conditions: [],
    },
    {
      name: 'marks GetIsPlayer()=1 (the PVP-only branch) inactive when subjectIsTarget is set',
      rows: [eq('GetIsPlayer', 1, { 'Run On': 'Subject' })],
      ctx: { subjectIsTarget: true },
      conditions: null,
    },
    // flattenPerkConditionRows (normalize/conditions.ts) forces tab-index-2 rows'
    // Run On to 'Target' regardless of the raw ESM field — verified on
    // Legendary_Armor_BattleLoadersPerk 0x0079B522, whose tab 2 carries
    // "GetIsPlayer Equal To 0.0" meaning "the bashed target isn't a player"
    // (always true in PvE). Without this fix the row read as the SELF-gate
    // shape (wants=false → 'inactive'), silently killing the whole effect —
    // this is the same inversion `subjectIsTarget` already applies for
    // Contact-delivery ENCH/SPEL walks, driven here by the row's own Run On
    // field instead of a walk-scoped context flag.
    {
      name: "consumes GetIsPlayer(Target)=0 (the NPC-bashed-target branch, Battle-Loader's) instead of marking it inactive",
      rows: [eq('GetIsPlayer', 0, { 'Run On': 'Target' })],
      conditions: [],
    },
    {
      name: "marks GetIsPlayer(Target)=1 (the PVP-only branch, Battle-Loader's) inactive",
      rows: [eq('GetIsPlayer', 1, { 'Run On': 'Target' })],
      conditions: null,
    },
  ]);
});

describe('translateConditions (single-row gates)', () => {
  itTranslatesConditions([
    {
      name: 'consumes IsSprinting()=0 (not sprinting) instead of leaving it unresolved (non-sprint combat model, 2026-07-15)',
      rows: [eq('IsSprinting', 0)],
      conditions: [],
    },
    {
      name: 'marks IsSprinting()=1 (sprint-only) inactive',
      rows: [eq('IsSprinting', 1)],
      conditions: null,
    },
    {
      name: 'consumes IsSwimming()=0 (not swimming) instead of leaving it unresolved',
      rows: [eq('IsSwimming', 0)],
      conditions: [],
    },
    {
      name: 'marks IsSwimming()=1 (swim-only) inactive',
      rows: [eq('IsSwimming', 1)],
      conditions: null,
    },
    {
      name: 'maps WornHasKeyword(ArmorTypePower)=1 to inPowerArmor',
      rows: [eq('WornHasKeyword', 1, { 'Parameter 1': '0xPA', 'Run On': 'Subject' })],
      ctx: { edidByFormId: new Map([['0xPA', 'ArmorTypePower']]) },
      conditions: [{ kind: 'inPowerArmor', value: true }],
    },
    {
      name: "translates GetIsPlayerGhoul()=0 to a playerIsGhoul false gate (Gourmand's, 2026-07-11)",
      rows: [eq('GetIsPlayerGhoul', 0)],
      conditions: [{ kind: 'playerIsGhoul', value: false }],
    },
    {
      name: 'translates GetIsPlayerGhoul()=1 to a playerIsGhoul true gate (Glowing Criticals)',
      rows: [eq('GetIsPlayerGhoul', 1)],
      conditions: [{ kind: 'playerIsGhoul', value: true }],
    },
    {
      name: 'translates GetInIronSights Equal To 1 to aimingDownSights',
      rows: [eq('GetInIronSights', 1)],
      conditions: [{ kind: 'aimingDownSights', value: true }],
    },
    {
      name: 'translates IsPowerAttacking Equal To 0 to powerAttack false',
      rows: [eq('IsPowerAttacking', 0)],
      conditions: [{ kind: 'powerAttack', value: false }],
    },
    {
      name: 'translates IsPowerAttacking Equal To 1 to powerAttack true',
      rows: [eq('IsPowerAttacking', 1)],
      conditions: [{ kind: 'powerAttack', value: true }],
    },
    {
      name: 'translates GetIsInVATS Equal To 0 to vatsOnly false',
      rows: [eq('GetIsInVATS', 0)],
      conditions: [{ kind: 'vatsOnly', value: false }],
    },
    {
      name: 'translates GetIsInVATS Equal To 1 to vatsOnly true',
      rows: [eq('GetIsInVATS', 1)],
      conditions: [{ kind: 'vatsOnly', value: true }],
    },
    {
      name: 'translates IsMoving Equal To 0 to standingStill true (Steady, Rooted, Chameleon)',
      rows: [eq('IsMoving', 0)],
      conditions: [{ kind: 'standingStill', value: true }],
    },
    {
      name: 'translates IsMoving Equal To 1 to standingStill false',
      rows: [eq('IsMoving', 1)],
      conditions: [{ kind: 'standingStill', value: false }],
    },
    {
      name: 'translates HasCompletedChallenge Equal To 1 to lifetimeChallengeCompleted',
      rows: [eq('HasCompletedChallenge', 1, { 'Parameter 1': '0xCHAL' })],
      ctx: {
        edidByFormId: new Map([
          ['0xCHAL', 'Challenge_Lifetime_CraftScrap_Weapon_Tiers_Ranged_Pistols_Pipe'],
        ]),
      },
      conditions: [
        {
          kind: 'lifetimeChallengeCompleted',
          challengeId: 'Challenge_Lifetime_CraftScrap_Weapon_Tiers_Ranged_Pistols_Pipe',
        },
      ],
    },
    {
      name: 'IsMemberOfAPlayerTeam=1 → teammateCount ≥1 (Herd Mentality team bonus, 2026-07-14)',
      rows: [eq('IsMemberOfAPlayerTeam', 1)],
      conditions: [{ kind: 'teammateCount', count: 1, orMore: true }],
    },
    {
      name: 'IsMemberOfAPlayerTeam=0 → teammateCount 0 (Herd Mentality solo penalty)',
      rows: [eq('IsMemberOfAPlayerTeam', 0)],
      conditions: [{ kind: 'teammateCount', count: 0 }],
    },
    {
      name: 'maps IsMeleeAttacking()=0 to consumed (condition-whitelist round K, 2026-08-28)',
      rows: [eq('IsMeleeAttacking', 0)],
      conditions: [],
    },
    {
      name: 'maps IsMeleeAttacking()=1 to weaponAnimTypeMax ≤6',
      rows: [eq('IsMeleeAttacking', 1)],
      conditions: [{ kind: 'weaponAnimTypeMax', max: 6 }],
    },
  ]);
});

describe('translateConditions (2026-07-11 condition kinds)', () => {
  it("dedupes Last Shot's GetLoadedAmmoCount()=0 + IsNextClipLastShot pair into ONE lastRound gate", () => {
    const rows: RawCondition[] = [
      {
        Function: 'GetLoadedAmmoCount',
        'Comparison Value': 0,
        Operator: 'Equal To',
        'Run On': 'Subject',
      },
      {
        Function: 'IsNextClipLastShot',
        'Comparison Value': 0,
        Operator: 'Greater Than',
        'Run On': 'Subject',
      },
    ];
    const { conditions, unresolved } = translateConditions(rows, { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'lastRound' }]);
    expect(unresolved).toEqual([]);
  });

  it("translates target GetNumActiveEffectsWithKeyword ≥1 to enemyHasActiveEffect (Pyromaniac's fire gate)", () => {
    const row: RawCondition = {
      Function: 'GetNumActiveEffectsWithKeyword',
      'Parameter 1': '0xFIRE',
      'Comparison Value': 1,
      Operator: 'Greater Than Or Equal To',
      'Run On': 'Target',
    };
    const { conditions } = translateConditions([row], {
      edidByFormId: new Map([['0xFIRE', 'DamageTypeFire']]),
    });
    expect(conditions).toEqual([{ kind: 'enemyHasActiveEffect', keyword: 'DamageTypeFire' }]);
  });

  it("translates GetGroupTargetCount == N and ≥ N to enemyGroupCount tiers (Encircler's)", () => {
    const eq: RawCondition = {
      Function: 'GetGroupTargetCount',
      'Comparison Value': 3,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const ge: RawCondition = {
      Function: 'GetGroupTargetCount',
      'Comparison Value': 5,
      Operator: 'Greater Than Or Equal To',
      'Run On': 'Subject',
    };
    expect(translateConditions([eq], { edidByFormId: new Map() }).conditions).toEqual([
      { kind: 'enemyGroupCount', count: 3 },
    ]);
    expect(translateConditions([ge], { edidByFormId: new Map() }).conditions).toEqual([
      { kind: 'enemyGroupCount', count: 5, orMore: true },
    ]);
  });

  it("translates WornApparelHasKeywordCount == N and ≥ N to wornPieceCount tiers (Battle-Loader's, Phase 3 armor pipeline)", () => {
    const edidByFormId = new Map([['0x00792A12', 'HasLegendary_Armor_BattleLoaders']]);
    const eq: RawCondition = {
      Function: 'WornApparelHasKeywordCount',
      'Parameter 1': '0x00792A12',
      'Comparison Value': 4,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const ge: RawCondition = {
      Function: 'WornApparelHasKeywordCount',
      'Parameter 1': '0x00792A12',
      'Comparison Value': 5,
      Operator: 'Greater Than Or Equal To',
      'Run On': 'Subject',
    };
    expect(translateConditions([eq], { edidByFormId }).conditions).toEqual([
      { kind: 'wornPieceCount', keyword: 'HasLegendary_Armor_BattleLoaders', count: 4 },
    ]);
    expect(translateConditions([ge], { edidByFormId }).conditions).toEqual([
      {
        kind: 'wornPieceCount',
        keyword: 'HasLegendary_Armor_BattleLoaders',
        count: 5,
        orMore: true,
      },
    ]);
  });

  it("translates GetPlayerTeammateCount == N to teammateCount and consumes the teammate GetDistance row (Fencer's)", () => {
    const rows: RawCondition[] = [
      {
        Function: 'GetPlayerTeammateCount',
        'Comparison Value': 2,
        Operator: 'Equal To',
        'Run On': 'Subject',
      },
      {
        Function: 'GetDistance',
        'Parameter 1': null,
        'Comparison Value': 2500,
        Operator: 'Less Than',
        'Run On': 'Potential Players',
      },
    ];
    const { conditions, unresolved } = translateConditions(rows, { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'teammateCount', count: 2 }]);
    expect(unresolved).toEqual([]);
  });

  it("translates GetPlayerTeammateCount >= N to teammateCount with orMore (United Ordeal's 'in a team of >=1')", () => {
    const row: RawCondition = {
      Function: 'GetPlayerTeammateCount',
      'Comparison Value': 1,
      Operator: 'Greater Than Or Equal To',
      'Run On': 'Subject',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'teammateCount', count: 1, orMore: true }]);
    expect(unresolved).toEqual([]);
  });

  it("consumes target HasPerk(ImmuneToPoison)=0 — a generic target is assumed vulnerable (Viper's)", () => {
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xIMMUNE',
      'Comparison Value': 0,
      Operator: 'Equal To',
      'Run On': 'Target',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map([['0xIMMUNE', 'ImmuneToPoison']]),
    });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it('leaves an off-pattern GetDistance row unresolved instead of silently consuming it', () => {
    const row: RawCondition = {
      Function: 'GetDistance',
      'Comparison Value': 500,
      Operator: 'Less Than',
      'Run On': 'Target',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([
      { kind: 'unresolved', raw: 'GetDistance Less Than 500 on Target' },
    ]);
  });
});

describe('translateConditions (Stage C3, killstreak GetValue tiers)', () => {
  it('consumes the redundant "kill streak ≥1" gate on curve-driven effects', () => {
    const row: RawCondition = {
      Function: 'GetValue',
      'Parameter 1': '0x00000399',
      'Comparison Value': 1,
      Operator: 'Greater Than Or Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it("translates GetValue(killStreak) Equal To N to a killStreakCount condition (Thrill-Seeker's tiers)", () => {
    const row: RawCondition = {
      Function: 'GetValue',
      'Parameter 1': '0x00000399',
      'Comparison Value': 5,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'killStreakCount', count: 5 }]);
    expect(unresolved).toEqual([]);
  });

  it('leaves an unrecognized comparison on the killstreak AV unresolved instead of silently consuming it', () => {
    const row: RawCondition = {
      Function: 'GetValue',
      'Parameter 1': '0x00000399',
      'Comparison Value': 3,
      Operator: 'Greater Than Or Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([
      { kind: 'unresolved', raw: 'GetValue(0x00000399) Greater Than Or Equal To 3' },
    ]);
  });
});

describe('translateConditions (Stage C4, gender-twin paired family — Action Boy/Girl)', () => {
  const ownFamily = ['0xAB01', '0xAB02', '0xAB03']; // simulated family (e.g. Action Boy)
  const pairedFamily = ['0xAG01', '0xAG02', '0xAG03']; // paired family (e.g. Action Girl)

  it('a single-row HasPerk on the paired family is consumed when the mirrored rank matches', () => {
    // Rank-1 simulation: mirrored paired rank is also 1, so paired rank-2
    // (index 1) is NOT owned — HasPerk(...)=0 wants "not owned" → satisfied.
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xAG02',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      pairedFamilyFormIds: pairedFamily,
      ownedRanks: 1,
    });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it('a single-row HasPerk on the paired family kills the effect when the mirrored rank mismatches', () => {
    // Rank-2 simulation: mirrored paired rank-2 IS owned, but the row wants
    // "not owned" (=0) → mismatch → the whole effect is inactive.
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xAG02',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    const { conditions } = translateConditions([row], {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      pairedFamilyFormIds: pairedFamily,
      ownedRanks: 2,
    });
    expect(conditions).toBeNull();
  });

  it('an OR-group of own+paired HasPerk rows is consumed when ANY member is satisfied', () => {
    const rows: RawCondition[] = [
      {
        Function: 'HasPerk',
        'Parameter 1': '0xAB02',
        'Comparison Value': 1,
        Operator: 'Equal To',
        'AND/OR': 'OR',
      },
      { Function: 'HasPerk', 'Parameter 1': '0xAG02', 'Comparison Value': 1, Operator: 'Equal To' },
    ];
    // Rank-2 simulation: own rank-2 (index 1) IS owned → wants=1 → satisfied.
    const { conditions, unresolved } = translateConditions(rows, {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      pairedFamilyFormIds: pairedFamily,
      ownedRanks: 2,
    });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it('an OR-group of own+paired HasPerk rows kills the effect when NEITHER member is satisfied', () => {
    const rows: RawCondition[] = [
      {
        Function: 'HasPerk',
        'Parameter 1': '0xAB02',
        'Comparison Value': 1,
        Operator: 'Equal To',
        'AND/OR': 'OR',
      },
      { Function: 'HasPerk', 'Parameter 1': '0xAG02', 'Comparison Value': 1, Operator: 'Equal To' },
    ];
    // Rank-1 simulation: neither own nor paired rank-2 is owned → both fail.
    const { conditions } = translateConditions(rows, {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      pairedFamilyFormIds: pairedFamily,
      ownedRanks: 1,
    });
    expect(conditions).toBeNull();
  });

  it('an all-HasPerk OR-group with NO pairedFamilyFormIds falls through to unresolved (pre-Stage-C4 behavior preserved)', () => {
    const rows: RawCondition[] = [
      {
        Function: 'HasPerk',
        'Parameter 1': '0xAB02',
        'Comparison Value': 1,
        Operator: 'Equal To',
        'AND/OR': 'OR',
      },
      { Function: 'HasPerk', 'Parameter 1': '0xAG02', 'Comparison Value': 1, Operator: 'Equal To' },
    ];
    const { conditions, unresolved } = translateConditions(rows, {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      ownedRanks: 1,
    });
    expect(unresolved).toHaveLength(1);
    expect(conditions).toEqual([{ kind: 'unresolved', raw: expect.stringContaining('OR-group') }]);
  });
});

describe('translateConditions (cross-family HasPerk → perkFamilyRank, 2026-07-15)', () => {
  const ownFamily = ['0xBS01', '0xBS02', '0xBS03']; // simulated family (Bullet Storm shape)
  const crossFamilyRank = new Map([
    ['0xLNL01', { family: 'LockAndLoad', rank: 1 }],
    ['0xLNL02', { family: 'LockAndLoad', rank: 2 }],
    ['0xBS01', { family: 'BulletStorm', rank: 1 }], // own formids may also be in the global map
  ]);

  it('a HasPerk row on ANOTHER family translates to a typed perkFamilyRank condition', () => {
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xLNL01',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      ownedRanks: 1,
      crossFamilyRank,
    });
    expect(conditions).toEqual([
      { kind: 'perkFamilyRank', family: 'LockAndLoad', minRank: 1, present: true },
    ]);
    expect(unresolved).toEqual([]);
  });

  it('=0 rows carry present:false; higher ranks carry their own minRank', () => {
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xLNL02',
      'Comparison Value': 0,
      Operator: 'Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map(), crossFamilyRank });
    expect(conditions).toEqual([
      { kind: 'perkFamilyRank', family: 'LockAndLoad', minRank: 2, present: false },
    ]);
  });

  it('the SELF-family rank gate wins over the global map (simulation-consumed, never a runtime condition)', () => {
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xBS01',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map(),
      familyFormIds: ownFamily,
      ownedRanks: 1,
      crossFamilyRank,
    });
    expect(conditions).toEqual([]); // consumed by the rank-1 simulation
    expect(unresolved).toEqual([]);
  });

  it('a formid outside the map (cut content, e.g. CUT_Radicool) still falls through to unresolved', () => {
    const row: RawCondition = {
      Function: 'HasPerk',
      'Parameter 1': '0xCUT01',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map(),
      crossFamilyRank,
    });
    expect(conditions).toEqual([{ kind: 'unresolved', raw: 'HasPerk(0xCUT01)=1' }]);
    expect(unresolved).toHaveLength(1);
  });
});

describe('flattenPerkConditionRows', () => {
  it('flattens tabbed perk conditions and forces Run On=Target for tab index 2', () => {
    const rows = flattenPerkConditionRows([
      {
        'Perk Condition': {
          'Run On (Tab Index)': 2,
          Conditions: [
            {
              Condition: {
                'Condition Data': {
                  Function: 'HasKeyword',
                  'Parameter 1': '0xKW',
                  'Comparison Value': 1,
                },
              },
            },
          ],
        },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      Function: 'HasKeyword',
      'Parameter 1': '0xKW',
      'Run On': 'Target',
    });
  });

  it('returns [] for a non-array node', () => {
    expect(flattenPerkConditionRows(undefined)).toEqual([]);
  });
});

describe('translateConditions (2026-07-14 anim-type gate + CNDF expansion)', () => {
  it('translates GetWeaponAnimType() ≤ 6 to weaponAnimTypeMax (Martial Artist melee gate)', () => {
    const row: RawCondition = {
      Function: 'GetWeaponAnimType',
      'Comparison Value': 6,
      Operator: 'Less Than Or Equal To',
      'Run On': 'Subject',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'weaponAnimTypeMax', max: 6 }]);
    expect(unresolved).toEqual([]);
  });

  it('leaves non-≤ GetWeaponAnimType comparisons unresolved (no real use in data)', () => {
    const row: RawCondition = {
      Function: 'GetWeaponAnimType',
      'Comparison Value': 9,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'unresolved', raw: 'GetWeaponAnimType() Equal To 9' }]);
    expect(unresolved).toHaveLength(1);
  });

  // Ground Pounder's SmallGun_Actor_Condition CNDF, verbatim shape:
  // (Rifle OR Shotgun OR Pistol) AND NOT HeavyGun.
  const smallGunRows: RawCondition[] = [
    {
      Function: 'WornHasKeyword',
      'Parameter 1': '0xRIFLE',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'AND/OR': 'OR',
      'Run On': 'Subject',
    },
    {
      Function: 'WornHasKeyword',
      'Parameter 1': '0xSHOTGUN',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'AND/OR': 'OR',
      'Run On': 'Subject',
    },
    {
      Function: 'WornHasKeyword',
      'Parameter 1': '0xPISTOL',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'AND/OR': 'AND',
      'Run On': 'Subject',
    },
    {
      Function: 'WornHasKeyword',
      'Parameter 1': '0xHEAVY',
      'Comparison Value': 0,
      Operator: 'Equal To',
      'AND/OR': 'AND',
      'Run On': 'Subject',
    },
  ];
  const smallGunEdids = new Map([
    ['0xCNDF', 'SmallGun_Actor_Condition'],
    ['0xRIFLE', 'WeaponTypeRifle'],
    ['0xSHOTGUN', 'WeaponTypeShotgun'],
    ['0xPISTOL', 'WeaponTypePistol'],
    ['0xHEAVY', 'WeaponTypeHeavyGun'],
  ]);
  const isTrueRow: RawCondition = {
    Function: 'IsTrueForConditionForm',
    'Parameter 1': '0xCNDF',
    'Comparison Value': 1,
    Operator: 'Equal To',
    'Run On': 'Subject',
  };

  it("expands IsTrueForConditionForm into the CNDF's translated rows (Ground Pounder's small-gun gate)", () => {
    const { conditions, unresolved } = translateConditions([isTrueRow], {
      edidByFormId: smallGunEdids,
      conditionForms: new Map([['0xCNDF', smallGunRows]]),
    });
    expect(conditions).toEqual([
      {
        kind: 'weaponKeywordAny',
        keywords: ['WeaponTypeRifle', 'WeaponTypeShotgun', 'WeaponTypePistol'],
      },
      { kind: 'weaponKeyword', keyword: 'WeaponTypeHeavyGun', present: false },
    ]);
    expect(unresolved).toEqual([]);
  });

  it('falls back to the unresolved row when the CNDF contents do not FULLY translate (Perk_Day_Condition shape)', () => {
    const dayRows: RawCondition[] = [
      {
        Function: 'GetCurrentTime',
        'Comparison Value': 6,
        Operator: 'Greater Than Or Equal To',
        'Run On': 'Subject',
      },
    ];
    const { conditions, unresolved } = translateConditions([isTrueRow], {
      edidByFormId: new Map([['0xCNDF', 'Perk_Day_Condition']]),
      conditionForms: new Map([['0xCNDF', dayRows]]),
    });
    expect(conditions).toEqual([
      { kind: 'unresolved', raw: 'IsTrueForConditionForm(Perk_Day_Condition)=1' },
    ]);
    expect(unresolved).toHaveLength(1);
  });

  it('never expands inside an OR-group (GHL feral-rage shape) or without a pre-fetched form', () => {
    const orGroup: RawCondition[] = [
      { ...isTrueRow, 'AND/OR': 'OR' },
      {
        Function: 'GetValue',
        'Parameter 1': '0xRADS',
        'Comparison Value': 5,
        Operator: 'Greater Than Or Equal To',
        'Run On': 'Subject',
      },
    ];
    const withForm = translateConditions(orGroup, {
      edidByFormId: smallGunEdids,
      conditionForms: new Map([['0xCNDF', smallGunRows]]),
    });
    expect(withForm.conditions?.[0]?.kind).toBe('unresolved');

    const noForm = translateConditions([isTrueRow], { edidByFormId: smallGunEdids });
    expect(noForm.conditions).toEqual([
      { kind: 'unresolved', raw: 'IsTrueForConditionForm(SmallGun_Actor_Condition)=1' },
    ]);
  });
});

describe('translateConditions (Class Freak rank tiers, 2026-07-14)', () => {
  // Real Grounded perk formids: ClassFreak01/02/03 = 0x00391F0E/11/12.
  const rank = (formId: string, cmp: number): RawCondition =>
    eq('HasPerk', cmp, { 'Parameter 1': formId });

  itTranslatesConditions([
    {
      name: 'tier 0 (below ClassFreak01): [HasPerk(01)=0] → [{min:0,max:0}]',
      rows: [rank('0x00391F0E', 0)],
      conditions: [{ kind: 'classFreakRank', min: 0, max: 0 }],
    },
    {
      name: 'tier 1 (ClassFreak01 only): [HasPerk(02)=0, HasPerk(01)=1] → [{0,1},{1,3}]',
      rows: [rank('0x00391F11', 0), rank('0x00391F0E', 1)],
      conditions: [
        { kind: 'classFreakRank', min: 0, max: 1 },
        { kind: 'classFreakRank', min: 1, max: 3 },
      ],
    },
    {
      name: 'tier 2 (ClassFreak02): [HasPerk(02)=1, HasPerk(03)=0] → [{2,3},{0,2}]',
      rows: [rank('0x00391F11', 1), rank('0x00391F12', 0)],
      conditions: [
        { kind: 'classFreakRank', min: 2, max: 3 },
        { kind: 'classFreakRank', min: 0, max: 2 },
      ],
    },
    {
      name: 'tier 3 (ClassFreak03): [HasPerk(03)=1] → [{3,3}]',
      rows: [rank('0x00391F12', 1)],
      conditions: [{ kind: 'classFreakRank', min: 3, max: 3 }],
    },
  ]);
});

describe('translateConditions (IsSpellTarget RadX/Serum suppression, 2026-07-14)', () => {
  const suppressionEdids = new Map([
    ['0x00024057', 'RadX'],
    ['0x0050A5CB', 'Serum_EggHead'],
  ]);

  it('consumes both RadX=0 and Serum_EggHead=0 (effect active while unsuppressed)', () => {
    const rows: RawCondition[] = [
      {
        Function: 'IsSpellTarget',
        'Parameter 1': '0x00024057',
        'Comparison Value': 0,
        Operator: 'Equal To',
      },
      {
        Function: 'IsSpellTarget',
        'Parameter 1': '0x0050A5CB',
        'Comparison Value': 0,
        Operator: 'Equal To',
      },
    ];
    const { conditions, unresolved } = translateConditions(rows, {
      edidByFormId: suppressionEdids,
    });
    expect(conditions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it('kills the effect for RadX=1 (the treated/suppressed variant we never model)', () => {
    const row: RawCondition = {
      Function: 'IsSpellTarget',
      'Parameter 1': '0x00024057',
      'Comparison Value': 1,
      Operator: 'Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: suppressionEdids });
    expect(conditions).toBeNull();
  });
});

describe('translateConditions (Phase 4 — GetDistanceToClosestHostileActor, 2026-07-18)', () => {
  it("translates GetDistanceToClosestHostileActor() >= N to targetDistance 'far' (Eye of the Hunter's 10/20/30-by-rank gates)", () => {
    for (const cmp of [10, 20, 30]) {
      const row: RawCondition = {
        Function: 'GetDistanceToClosestHostileActor',
        'Comparison Value': cmp,
        Operator: 'Greater Than Or Equal To',
        'Run On': 'Subject',
      };
      const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
      expect(conditions).toEqual([{ kind: 'targetDistance', range: 'far' }]);
      expect(unresolved).toEqual([]);
    }
  });

  it('leaves other operators unresolved (no other shape observed in data)', () => {
    const row: RawCondition = {
      Function: 'GetDistanceToClosestHostileActor',
      'Comparison Value': 10,
      Operator: 'Less Than',
      'Run On': 'Subject',
    };
    const { conditions, unresolved } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([
      { kind: 'unresolved', raw: 'GetDistanceToClosestHostileActor Less Than 10' },
    ]);
    expect(unresolved).toEqual(['GetDistanceToClosestHostileActor Less Than 10']);
  });
});

describe('translateConditions (condition-whitelist round K, 2026-08-28)', () => {
  it('maps HasKeyword(DamageTypeEnergy)=1 on the wielder to damageTypeScope energy', () => {
    const row: RawCondition = {
      Function: 'HasKeyword',
      'Parameter 1': '0xENERGY',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const { conditions, unresolved } = translateConditions([row], {
      edidByFormId: new Map([['0xENERGY', 'DamageTypeEnergy']]),
    });
    expect(conditions).toEqual([{ kind: 'damageTypeScope', types: ['energy'] }]);
    expect(unresolved).toEqual([]);
  });

  it('maps HasScopeWeaponEquipped()=1 to weaponKeywordAny over scope keywords', () => {
    const row: RawCondition = {
      Function: 'HasScopeWeaponEquipped',
      'Comparison Value': 1,
      Operator: 'Equal To',
      'Run On': 'Subject',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([
      { kind: 'weaponKeywordAny', keywords: ['HasScope', 'HasScopeRecon'] },
    ]);
  });

  it('maps scoped-weapon OR-groups to weaponKeywordAny', () => {
    const rows: RawCondition[] = [
      {
        Function: 'HasKeyword',
        'Parameter 1': '0xSCOPE',
        'Comparison Value': 1,
        Operator: 'Equal To',
        'AND/OR': 'OR',
        'Run On': 'Subject',
      },
      {
        Function: 'HasKeyword',
        'Parameter 1': '0xRECON',
        'Comparison Value': 1,
        Operator: 'Equal To',
        'Run On': 'Subject',
      },
    ];
    const { conditions, unresolved } = translateConditions(rows, {
      edidByFormId: new Map([
        ['0xSCOPE', 'HasScope'],
        ['0xRECON', 'HasScopeRecon'],
      ]),
    });
    expect(conditions).toEqual([
      { kind: 'weaponKeywordAny', keywords: ['HasScope', 'HasScopeRecon'] },
    ]);
    expect(unresolved).toEqual([]);
  });

  it('maps negated scope keywords to present:false weaponKeyword (Guns and Bullets 7, 20261026)', () => {
    // Magazine_GunsAndBullets07Perk 0x001EFC29 scope rows as decoded live;
    // the last row's trailing OR has no following row, so both AND.
    const rows: RawCondition[] = [
      {
        Function: 'HasKeyword',
        'Parameter 1': '0x0009F425',
        'Comparison Value': 0,
        Operator: 'Equal To',
        'AND/OR': 'AND',
        'Run On': 'Subject',
      },
      {
        Function: 'HasKeyword',
        'Parameter 1': '0x00184C55',
        'Comparison Value': 0,
        Operator: 'Equal To',
        'AND/OR': 'OR',
        'Run On': 'Subject',
      },
    ];
    const { conditions, unresolved } = translateConditions(rows, {
      edidByFormId: new Map([
        ['0x0009F425', 'HasScope'],
        ['0x00184C55', 'HasScopeRecon'],
      ]),
    });
    expect(conditions).toEqual([
      { kind: 'weaponKeyword', keyword: 'HasScope', present: false },
      { kind: 'weaponKeyword', keyword: 'HasScopeRecon', present: false },
    ]);
    expect(unresolved).toEqual([]);
  });

  it('maps WornHasKeyword(MoMEyeOfRaItemKeyword) to eyeOfRaWorn true/false tiers', () => {
    const base = translateConditions(
      [
        {
          Function: 'WornHasKeyword',
          'Parameter 1': '0xEYE',
          'Comparison Value': 1,
          Operator: 'Not Equal To',
        },
      ],
      { edidByFormId: new Map([['0xEYE', 'MoMEyeOfRaItemKeyword']]) },
    );
    expect(base.conditions).toEqual([{ kind: 'eyeOfRaWorn', value: false }]);
    const upgrade = translateConditions(
      [
        {
          Function: 'WornHasKeyword',
          'Parameter 1': '0xEYE',
          'Comparison Value': 1,
          Operator: 'Equal To',
        },
      ],
      { edidByFormId: new Map([['0xEYE', 'MoMEyeOfRaItemKeyword']]) },
    );
    expect(upgrade.conditions).toEqual([{ kind: 'eyeOfRaWorn', value: true }]);
  });
});

describe('translateConditions (glowAtLeast — Rads AV 0x000002E1, 2026-07-13)', () => {
  it("translates a literal GetValue(Rads) >= 180 row to glowAtLeast (GHL_GlowingCriticals01's entry-point gate)", () => {
    const effects = (ghlGlowingCriticals01 as unknown as EsmRecord).fields['Effects'] as Array<
      Record<string, unknown>
    >;
    const perkConditions = (effects[0]['Effect'] as Record<string, unknown>)['Perk Conditions'];
    const rows = flattenPerkConditionRows(perkConditions);
    const { conditions } = translateConditions(rows, { edidByFormId: new Map() });
    expect(conditions).toContainEqual({ kind: 'glowAtLeast', min: 180 });
  });

  it("resolves a GLOB-compared Rads row via globalValues (GHL_MadScientist01's ability grant: GetValue(Rads) >= GLOB GHL_BasicGlowUse=5)", () => {
    const effects = (ghlMadScientist01 as unknown as EsmRecord).fields['Effects'] as Array<
      Record<string, unknown>
    >;
    // Effects[1] is the "Ability" entry whose tab-0 Perk Conditions carry the
    // GLOB-compared Rads gate (0x007F68B6 = GHL_BasicGlowUse, Value 5.0).
    const abilityEffect = effects[1]['Effect'] as Record<string, unknown>;
    const rows = flattenPerkConditionRows(abilityEffect['Perk Conditions']);
    const { conditions } = translateConditions(rows, {
      edidByFormId: new Map(),
      globalValues: new Map([['0x007F68B6', 5]]),
    });
    expect(conditions).toContainEqual({ kind: 'glowAtLeast', min: 5 });
  });

  it('leaves a GLOB-compared Rads row unresolved when the global is not pre-resolved', () => {
    const row = {
      Function: 'GetValue',
      'Parameter 1': '0x000002E1',
      'Comparison Value': '0x007F68B6',
      Operator: 'Greater Than Or Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([
      { kind: 'unresolved', raw: 'GetValue(0x000002E1) Greater Than Or Equal To 0x007F68B6' },
    ]);
  });
});

describe('translateConditions (radResistAtLeast — RadResistExposure AV 0x000002EA, 20260724 Daisy Cutter rebuild)', () => {
  const ladderRows: Array<{ name: string; min: number }> = [
    {
      name: "translates a literal GetValue(RadResistExposure) >= 1000 row to radResistAtLeast (Perk_Daisycutter's ladder, verified via esm chase 0x00471882)",
      min: 1000,
    },
    { name: 'translates the top step of the ladder (>= 8000, the +160% cap)', min: 8000 },
  ];
  for (const row of ladderRows) {
    it(row.name, () => {
      const rawRow = {
        Function: 'GetValue',
        'Parameter 1': '0x000002EA',
        'Comparison Value': row.min,
        Operator: 'Greater Than Or Equal To',
      };
      const { conditions } = translateConditions([rawRow], { edidByFormId: new Map() });
      expect(conditions).toEqual([{ kind: 'radResistAtLeast', min: row.min }]);
    });
  }
});

describe('translateConditions (non-≥ GetValue comparisons stay unresolved)', () => {
  const nonGteRows: Array<{ name: string; av: string; value: number }> = [
    {
      name: 'leaves a Rads GetValue row unresolved for a non-≥ comparison (e.g. "Less Than")',
      av: '0x000002E1',
      value: 200,
    },
    {
      name: 'leaves a RadResistExposure GetValue row unresolved for a non-≥ comparison (e.g. "Less Than")',
      av: '0x000002EA',
      value: 1000,
    },
  ];
  for (const row of nonGteRows) {
    it(row.name, () => {
      const rawRow = {
        Function: 'GetValue',
        'Parameter 1': row.av,
        'Comparison Value': row.value,
        Operator: 'Less Than',
      };
      const { conditions } = translateConditions([rawRow], { edidByFormId: new Map() });
      expect(conditions).toEqual([
        { kind: 'unresolved', raw: `GetValue(${row.av}) Less Than ${row.value}` },
      ]);
    });
  }
});

describe('translateConditions (kill-state rows, extraction pile-1, 2026-08-28)', () => {
  it('translateConditions consumes GetDead()=0, GetDead() Not Equal To 1, and drops IsEssential()=1', () => {
    const rows: RawCondition[] = [
      {
        Function: 'GetDead',
        'Comparison Value': 0,
        Operator: 'Equal To',
        'Run On': 'Target',
      },
    ];
    expect(translateConditions(rows, { edidByFormId: new Map() }).conditions).toEqual([]);
    const notEqual = translateConditions(
      [
        {
          Function: 'GetDead',
          'Comparison Value': 1,
          Operator: 'Not Equal To',
          'Run On': 'Target',
        },
      ],
      { edidByFormId: new Map() },
    );
    expect(notEqual.conditions).toEqual([]);
    const essential = translateConditions(
      [{ Function: 'IsEssential', 'Comparison Value': 1, Operator: 'Equal To' }],
      { edidByFormId: new Map() },
    );
    expect(essential.conditions).toBeNull();
  });
});
