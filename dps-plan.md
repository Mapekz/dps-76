# Implementation Plan: Complete Combat Perk System

## Overview
Implement all combat-related perks from Fallout 76 with proper stat modifications, conditional bonuses, stacking mechanics, and SPECIAL scaling.

## Phase 1: Extend Stat System

### Add New Stats to `src/data/stats.ts`

#### Conditional Damage Stats
- `DamageToCrippledBonus` - Bonus damage to crippled enemies (Easy Target, Slugger, Shotgun Champ)
- `DamagePerCrippledLimb` - Damage multiplier per crippled limb (Tormentor: +20% per limb)
- `DamagePerStatusEffect` - Damage multiplier per status effect (Deal Sealer: +10% per impairment)
- `DamageToGlowingEnemiesBonus` - Bonus damage to glowing enemies (Glow Sight: +60%)

#### Stacking Mechanic Stats
- `BulletStormDamagePerStack` - Damage bonus per Bullet Storm stack (Bullet Storm: +9% per stack)
- `OnslaughtDamageBonus` - Base damage from Onslaught (Guerrilla Master: +5% per stack)
- `OnslaughtWeakspotPerStack` - Weakspot damage per Onslaught stack (Gunslinger Expert: +1% per stack)
- `BulletStormBashPerStack` - Bash damage per Bullet Storm stack (Bear Arms: +5% per stack)

#### Weapon Category Stats
- `UnarmedDamageBonus` - Unarmed weapons only
- `BowDamageBonus` - Bows and crossbows
- `GunDamageBonus` - All guns (not bows)
- `RangedDamageBonus` - All ranged weapons (guns + bows)
- `ThrownWeaponDamageBonus` - Thrown weapons (knives, not explosives)
- Keep existing: `MeleeDamageBonus` (all melee including unarmed), `OutgoingExplosionDamageMultiplier`

#### Weakspot/Limb/Torso Stats
- `WeakspotDamageBonus` - Generic weakspot bonus (Faulty Spots: +15%)
- `TorsoDamageBonus` - Torso-specific damage (Center Masochist: +75%)
- Keep existing: `LimbDamageBonus`, `MeleeLimbDamageBonus`

#### Enemy Armor Stats
- `ArmorPenetrationVsInsects` - Armor pen vs insects only (Exterminator: 75%)
- Keep existing: `ArmorPenetration` (general armor pen)

#### Add StatDefaultValues for all new stats
- Bonuses default to 0
- Multipliers default to 1.0

---

## Phase 2: Extend Type System

### Update `src/types/index.ts`

Add `PlayerConditions` interface:
```typescript
export interface PlayerConditions {
  // Combat state
  isSneaking: boolean;
  isInPowerArmor: boolean;
  isSolo: boolean;
  healthPercent: number; // 0-100 for perks like Nerd Rage, Serendipity

  // Stack counts
  bulletStormStacks: number; // 0-20 (10 base, 20 with Bringing the Big Guns)
  onslaughtStacks: number; // 0-10
  adredalineStacks: number; // 0-10 (always max per user preference)

  // SPECIAL stats
  strength: number; // 1-15 (can exceed with legendary perks)
  perception: number;
  endurance: number;
  charisma: number;
  intelligence: number;
  agility: number;
  luck: number;

  // Other
  junkItemCount: number; // for Junk Shield perk
  teammateCount: number; // for Bodyguards perk
}
```

Add `EnemyConditions` interface:
```typescript
export interface EnemyConditions {
  isCrippled: boolean; // at least one limb crippled
  crippledLimbCount: number; // 0-6 limbs
  statusEffectCount: number; // number of debuffs/impairments
  isGlowing: boolean; // glowing enemy variant
  isInsect: boolean; // insect creature type
}
```

Update `PlayerConfig`:
```typescript
export interface PlayerConfig {
  perks: PerkLoadout[];
  legendaryPerks: PerkLoadout[];
  weapon: WeaponConfig | null;
  armor: ArmorConfig;
  mutations: string[];
  consumables: string[];
  conditions: PlayerConditions; // NEW
}
```

Update `EnemyConfig`:
```typescript
export interface EnemyConfig {
  enemyId: string;
  legendaryRank: 0 | 1 | 2 | 3;
  mutation: string | null;
  weaponId: string | null;
  powerArmorId: string | null;
  conditions: EnemyConditions; // NEW
}
```

Add default factory functions:
```typescript
export function createDefaultPlayerConditions(): PlayerConditions;
export function createDefaultEnemyConditions(): EnemyConditions;
```

---

## Phase 3: Update Damage Calculation

### Modify `src/lib/damage-formulas.ts`

#### Add Helper Functions

```typescript
/**
 * Checks if a conditional bonus should apply based on player/enemy conditions
 */
function shouldApplyConditional(
  stat: Stat,
  playerConditions: PlayerConditions,
  enemyConditions: EnemyConditions
): boolean {
  // Check sneaking requirement
  if ([Stat.SneakDamageBonus, Stat.SneakCritDamageBonus].includes(stat)) {
    return playerConditions.isSneaking;
  }

  // Check crippled target requirement
  if (stat === Stat.DamageToCrippledBonus) {
    return enemyConditions.isCrippled;
  }

  // Check glowing enemy requirement
  if (stat === Stat.DamageToGlowingEnemiesBonus) {
    return enemyConditions.isGlowing;
  }

  // Check power armor requirement (for certain defensive perks)
  // etc...

  return true; // Default: apply unconditionally
}

/**
 * Gets the effective value of a stat, accounting for stacking mechanics
 */
function getEffectiveStatValue(
  stat: Stat,
  baseValue: number,
  playerConditions: PlayerConditions,
  enemyConditions: EnemyConditions
): number {
  // Stack-based multipliers
  if (stat === Stat.BulletStormDamagePerStack) {
    return baseValue * playerConditions.bulletStormStacks;
  }

  if (stat === Stat.OnslaughtDamageBonus) {
    return baseValue * playerConditions.onslaughtStacks;
  }

  if (stat === Stat.DamagePerCrippledLimb) {
    return baseValue * enemyConditions.crippledLimbCount;
  }

  if (stat === Stat.DamagePerStatusEffect) {
    return baseValue * enemyConditions.statusEffectCount;
  }

  // SPECIAL-scaled stats
  if (stat === Stat.DamageResist && /* Barbarian is equipped */) {
    return playerConditions.strength; // DR = STR value
  }

  // Default: return base value
  return baseValue;
}
```

#### Update Damage Calculation Logic

Modify `calculateOutgoingDamage` to:
1. Check weapon category and apply appropriate weapon-specific bonuses
2. Check conditions before applying conditional bonuses
3. Apply stacking bonuses with current stack counts
4. Apply SPECIAL-scaled bonuses
5. Handle per-limb and per-status-effect multipliers

Example additions:
```typescript
// Check weapon category and apply bonuses
const weaponClass = weaponData.weaponClass;
if (weaponClass === 'melee' || weaponClass === 'unarmed') {
  damageBonus += getPerkStatTotal(mode, perks, Stat.MeleeDamageBonus) / 100;

  if (weaponClass === 'unarmed') {
    damageBonus += getPerkStatTotal(mode, perks, Stat.UnarmedDamageBonus) / 100;
  }
} else if (weaponClass === 'bow') {
  damageBonus += getPerkStatTotal(mode, perks, Stat.BowDamageBonus) / 100;
  damageBonus += getPerkStatTotal(mode, perks, Stat.RangedDamageBonus) / 100;
} else {
  // All guns
  damageBonus += getPerkStatTotal(mode, perks, Stat.GunDamageBonus) / 100;
  damageBonus += getPerkStatTotal(mode, perks, Stat.RangedDamageBonus) / 100;
}

// Apply conditional bonuses
if (enemyConditions.isCrippled) {
  damageBonus += getPerkStatTotal(mode, perks, Stat.DamageToCrippledBonus) / 100;
}

// Apply per-limb multiplier
const perLimbBonus = getPerkStatTotal(mode, perks, Stat.DamagePerCrippledLimb);
damageBonus += (perLimbBonus * enemyConditions.crippledLimbCount) / 100;

// Apply per-status-effect multiplier
const perStatusBonus = getPerkStatTotal(mode, perks, Stat.DamagePerStatusEffect);
damageBonus += (perStatusBonus * enemyConditions.statusEffectCount) / 100;

// Apply stacking bonuses
const bulletStormPerStack = getPerkStatTotal(mode, perks, Stat.BulletStormDamagePerStack);
damageBonus += (bulletStormPerStack * playerConditions.bulletStormStacks) / 100;

// Apply glowing enemy bonus
if (enemyConditions.isGlowing) {
  damageBonus += getPerkStatTotal(mode, perks, Stat.DamageToGlowingEnemiesBonus) / 100;
}
```

---

## Phase 4: Populate Perk Data

### For BOTH `src/data/live/perks.ts` AND `src/data/pts/perks.ts`

Go through each perk and add `statsModified` arrays. Values are based on nukesdragons database.

#### Example Perks to Implement:

**STRENGTH:**
- Slugger: `[{ stat: Stat.DamageToCrippledBonus, value: 30 }]`
- Easy Target: `[{ stat: Stat.DamageToCrippledBonus, value: 75 }]`
- Shotgun Champ: `[{ stat: Stat.DamageToCrippledBonus, value: 10 }]` (per projectile - multiply by weapon projectile count)
- Basher: `[{ stat: Stat.BashDamageBonus, value: 50 }, { stat: Stat.LimbDamageBonus, value: 75 }]`
- Heavy Hitter: `[{ stat: Stat.PowerAttackDamageBonus, value: 50 }]`
- Knee-capper: `[{ stat: Stat.MeleeLimbDamageBonus, value: 50 }]`
- Bone Shatterer: `[{ stat: Stat.MeleeLimbDamageBonus, value: 75 }]`
- Incisor: `[{ stat: Stat.ArmorPenetration, value: 75 }]`
- Blocker: `[{ stat: Stat.IncomingDamageMultiplier, value: -45 }]`
- Bullet Storm: `[{ stat: Stat.BulletStormDamagePerStack, value: 9 }]` (max 10 stacks)
- Bear Arms: `[{ stat: Stat.BulletStormBashPerStack, value: 5 }]`
- Bringing the Big Guns: Doubles Bullet Storm max stacks to 20 (special handling needed)
- Barbarian: SPECIAL-scaled DR (special handling)
- Radioactive Strength (Legendary): `[{ stat: Stat.PowerAttackDamageBonus, value: 150 }, { stat: Stat.BashDamageBonus, value: 150 }]` (assumes high Glow)

**PERCEPTION:**
- Tank Killer: `[{ stat: Stat.ArmorPenetration, value: 40 }]`
- Exterminator: `[{ stat: Stat.ArmorPenetrationVsInsects, value: 75 }]`
- Bow Before Me: `[{ stat: Stat.ArmorPenetration, value: 40 }]` (bows only - check weapon class)
- Glow Sight: `[{ stat: Stat.DamageToGlowingEnemiesBonus, value: 60 }]`
- Tormentor: `[{ stat: Stat.DamagePerCrippledLimb, value: 20 }]`
- Center Masochist: `[{ stat: Stat.TorsoDamageBonus, value: 75 }]`
- Enforcer: `[{ stat: Stat.LimbDamageBonus, value: 75 }]`
- Grenadier: Doubles explosion radius (special handling - area effect, not direct damage)
- Deal Sealer: `[{ stat: Stat.DamagePerStatusEffect, value: 10 }]`
- Refractor: SPECIAL-scaled ER (special handling)

**ENDURANCE:**
- Fireproof: `[{ stat: Stat.IncomingExplosionDamageMultiplier, value: -45 }, { stat: Stat.FireResist, value: 45 }]`
- Ironclad: `[{ stat: Stat.DamageResist, value: 25 }, { stat: Stat.EnergyResist, value: 25 }]` (doubled with matching armor set - special handling)
- Rad Resistant: SPECIAL-scaled RR (special handling)
- Natural Resistance: SPECIAL-scaled elemental resists (special handling)
- Adamantium Skeleton: `[{ stat: Stat.LimbDamageReduction, value: 75 }]` (SPECIAL-scaled at higher levels)
- Thick Skin (Legendary): `[{ stat: Stat.IncomingDamageMultiplier, value: -10 }]` (no power armor)
- Radiation Power (Legendary): `[{ stat: Stat.OutgoingDamageMultiplier, value: 20 }]` (assumes high Glow)

**CHARISMA:**
- Lone Wanderer: SPECIAL-scaled DR/ER (solo only - special handling)
- Bodyguards: SPECIAL-scaled DR/ER per teammate (special handling)
- Tenderizer: Enemy debuff - each attack increases damage taken (special handling - affects enemy)
- Suppressor: Enemy debuff - reduces enemy damage output by 30% (special handling)

**INTELLIGENCE:**
- Demolition Expert: `[{ stat: Stat.OutgoingExplosionDamageMultiplier, value: 60 }]`
- Stabilized: `[{ stat: Stat.ArmorPenetration, value: 30 }]` (big guns only, doubled in PA - special handling)
- Pyro-Technician: SPECIAL-scaled fire damage (special handling)
- Cryologist: SPECIAL-scaled cryo damage (special handling)
- Science!: SPECIAL-scaled energy damage (special handling)
- Modern Renegade: `[{ stat: Stat.LimbDamageBonus, value: 75 }]`
- Mad Scientist (Legendary): `[{ stat: Stat.EnergyDamageBonus, value: 20 }]` (assumes high Glow)
- Bomb Scientist (Legendary): `[{ stat: Stat.OutgoingExplosionDamageMultiplier, value: 50 }]` (assumes high Glow)

**AGILITY:**
- Ninja: `[{ stat: Stat.SneakDamageBonus, value: 100 }]` (bows/throwing/melee only)
- Mister Sandman: `[{ stat: Stat.SneakDamageBonus, value: 100 }]` (silenced weapons only - special handling)
- Covert Operative: `[{ stat: Stat.SneakDamageBonus, value: 50 }]` (ranged attacks)
- Gunslinger Master: Grants +10 max Onslaught stacks (special handling)
- Gunslinger Expert: `[{ stat: Stat.OnslaughtWeakspotPerStack, value: 1 }]` (max 3 stacks)
- Guerrilla Master: `[{ stat: Stat.OnslaughtDamageBonus, value: 5 }]` (close range, max 5 stacks)
- Adrenaline: `[{ stat: Stat.OutgoingDamageMultiplier, value: 100 }]` (assumes max 10 stacks at +10% each)
- Evasive: SPECIAL-scaled evade chance (special handling)
- Dodgy: `[{ stat: Stat.DeflectChance, value: 5 }]`

**LUCK:**
- Better Criticals: `[{ stat: Stat.CriticalDamageBonus, value: 100 }]`
- Bloody Mess: `[{ stat: Stat.OutgoingDamageMultiplier, value: 15 }]`
- One Gun Army: `[{ stat: Stat.LimbDamageBonus, value: 75 }]` (heavy guns only)
- Faulty Spots (Legendary): `[{ stat: Stat.WeakspotDamageBonus, value: 15 }]`
- Glowing Criticals (Legendary): `[{ stat: Stat.CriticalDamageBonus, value: 50 }]` (assumes high Glow)
- Junk Shield: SPECIAL-scaled DR/ER based on junk (special handling)
- Ricochet: SPECIAL-scaled deflect chance (special handling)
- Serendipity: SPECIAL-scaled evade chance below 30% health (special handling)

### Special Handling Cases

Create a separate helper for perks that need special logic:
- SPECIAL-scaled perks (Barbarian, Refractor, Lone Wanderer, etc.)
- Enemy debuff perks (Tenderizer, Suppressor)
- Stacking limit perks (Bringing the Big Guns doubles Bullet Storm stacks)
- Conditional weapon perks (Mister Sandman requires silenced weapon)
- Armor set bonus perks (Ironclad doubled with matching set)

---

## Phase 5: Update UI Components

### Add to PlayerColumn Component

1. **SPECIAL Stat Inputs:**
   - 7 number inputs for S.P.E.C.I.A.L. stats
   - Range: 1-15 (can exceed 15 with legendary perks)
   - Default: 15 (assume max build)

2. **Combat Condition Toggles:**
   - Checkbox: "Sneaking"
   - Checkbox: "In Power Armor"
   - Checkbox: "Solo"
   - Slider: "Health %" (0-100)

3. **Stack Count Inputs:**
   - Slider: "Bullet Storm Stacks" (0-10 or 0-20 if Bringing the Big Guns equipped)
   - Slider: "Onslaught Stacks" (0-10)
   - Display Adrenaline as always max stacks (no input needed)

4. **Other Inputs:**
   - Number: "Junk Items" (for Junk Shield)
   - Number: "Teammates" (0-3 for Bodyguards)

### Add to EnemyColumn Component

1. **Enemy Condition Toggles:**
   - Checkbox: "Crippled"
   - Number: "Crippled Limbs" (0-6)
   - Number: "Status Effects" (0-10)
   - Checkbox: "Glowing Variant"
   - Checkbox: "Insect Type"

---

## Phase 6: Testing & Validation

1. **Test each perk individually:**
   - Enable one perk at a time
   - Verify damage calculation changes correctly
   - Check that conditions work (toggle sneaking, crippled, etc.)

2. **Test stacking mechanics:**
   - Verify Bullet Storm stacks multiply correctly (0-10 or 0-20)
   - Verify Onslaught stacks multiply correctly
   - Test per-limb and per-status-effect scaling

3. **Test SPECIAL scaling:**
   - Change SPECIAL values and verify perks scale correctly
   - Test with min (1) and max (15) values

4. **Test weapon categories:**
   - Test with melee, unarmed, bow, gun, explosive weapons
   - Verify correct bonuses apply to each weapon type

5. **Test edge cases:**
   - Multiple conditional bonuses active simultaneously
   - Max stacks + max SPECIAL + all conditions met
   - No perks equipped (should show base weapon damage)

---

## Files to Modify

1. **`src/data/stats.ts`** - Add ~20 new Stat types
2. **`src/types/index.ts`** - Add PlayerConditions, EnemyConditions, update configs
3. **`src/lib/damage-formulas.ts`** - Update calculation logic (300+ lines of changes)
4. **`src/data/pts/perks.ts`** - Add statsModified to all ~260 perks
5. **`src/data/live/perks.ts`** - Same as PTS (mirror for now)
6. **`src/components/player/PlayerColumn.tsx`** - Add SPECIAL inputs, condition toggles, stack sliders
7. **`src/components/enemy/EnemyColumn.tsx`** - Add enemy condition inputs
8. **`src/App.tsx`** - Update state management for new conditions

---

## Implementation Order

1. **Phase 1 first** - Extend stats (foundation for everything else)
2. **Phase 2** - Update types (needed before damage calc)
3. **Phase 3** - Update damage formulas (core logic)
4. **Phase 4** - Populate perk data (can be done incrementally by SPECIAL category)
5. **Phase 5** - Update UI (after backend is working)
6. **Phase 6** - Test everything

---

## Notes

- **Glow perks:** Always assume high Glow per user preference
- **Adrenaline stacks:** Always assume max (10 stacks) per user preference
- **Bullet Storm/Onslaught:** User can adjust stack count via sliders
- **Conditionals:** Add toggles for all conditions (sneaking, crippled, solo, etc.)
- **SPECIAL scaling:** User inputs their SPECIAL values for accurate calculations
- **Enemy debuffs:** Tenderizer and Suppressor affect enemy stats - may need special handling or simplification

---

## Estimated Effort

- Phase 1: ~1 hour (add stats)
- Phase 2: ~30 min (update types)
- Phase 3: ~2 hours (update damage formulas with all conditions)
- Phase 4: ~4-6 hours (populate all 260 perks - most time-consuming)
- Phase 5: ~2 hours (UI updates)
- Phase 6: ~2 hours (testing)

**Total: ~12-14 hours**
