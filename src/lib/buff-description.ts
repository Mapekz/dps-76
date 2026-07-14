import type { GeneratedBuff } from '@/types/generated';
import type { Bucket, Condition, Modifier } from '@/types/modifiers';
import { formatPercent } from '@/lib/format';

/**
 * Short human-readable "what this actually does" line for a magazine or
 * bobblehead, derived from its extracted `Modifier[]` — NOT from ESM
 * description/flavor text. The two can disagree (Guns and Bullets 7's card
 * text says "without scopes" but its extracted modifier carries no such
 * condition), so deriving from the data we actually compute with is the only
 * way the displayed bonus always matches the applied one.
 */

/** Buckets whose Modifier.value is a decimal fraction (0.1 = +10%). */
const PERCENT_BUCKET_LABELS: Partial<Record<Bucket, string>> = {
  dbm: 'damage',
  critDmgBonus: 'critical damage',
  sneakBonus: 'sneak attack damage',
  weakpointBonus: 'weakpoint damage',
  powerAttackBonus: 'power attack damage',
  limbDamage: 'limb damage',
};

/** SPECIAL buckets: Modifier.value is a flat point add, not a percentage. */
const SPECIAL_BUCKET_LABELS: Partial<Record<Bucket, string>> = {
  specialStrength: 'Strength',
  specialPerception: 'Perception',
  specialEndurance: 'Endurance',
  specialCharisma: 'Charisma',
  specialIntelligence: 'Intelligence',
  specialAgility: 'Agility',
  specialLuck: 'Luck',
};

const WEAPON_KEYWORD_LABELS: Record<string, string> = {
  WeaponTypeBallistic: 'ballistic weapons',
  WeaponTypeEnergy: 'energy weapons',
  WeaponTypeLaser: 'laser weapons',
  WeaponTypePlasma: 'plasma weapons',
  WeaponTypeAlienBlaster: 'alien blasters',
  WeaponTypeHeavyGun: 'heavy guns',
  WeaponTypeMeleeGeneral: 'melee weapons',
  WeaponTypeMelee1H: 'one-handed melee weapons',
  WeaponTypeMelee2H: 'two-handed melee weapons',
  WeaponTypeUnarmed: 'unarmed',
  WeaponTypeThrowingKnife: 'throwing weapons',
};

const ENEMY_KEYWORD_LABELS: Record<string, string> = {
  ActorTypeAnimal: 'animals',
  ActorTypeGhoul: 'ghouls',
  ActorTypeFeralGhoul: 'feral ghouls',
  ActorTypeRobot: 'robots',
  ActorTypeScorched: 'the Scorched',
  ActorTypeSuperMutant: 'super mutants',
  ActorTypeSuperMutantBehemoth: 'Behemoths',
  ActorTypeMirelurk: 'Mirelurks',
  ActorTypeMirelurkHunter: 'Mirelurk Hunters',
  ActorTypeMirelurkKing: 'Mirelurk Kings',
  ActorTypeMirelurkQueen: 'Mirelurk Queens',
  ActorTypeYaoGuai: 'Yao Guai',
  ActorTypeWendigo: 'Wendigos',
  ActorTypeMothman: 'the Mothman',
  ActorTypeFlatwoodsMonster: 'the Flatwoods Monster',
  ActorTypeGraftonMonster: 'the Grafton Monster',
  ActorTypeSnallygaster: 'the Snallygaster',
  ActorTypeScorchbeast: 'Scorchbeasts',
  ActorTypeLiberator: 'Liberators',
  HumanRace: 'humans',
};

const weaponLabel = (edid: string): string => WEAPON_KEYWORD_LABELS[edid] ?? edid;
const enemyLabel = (edid: string): string => ENEMY_KEYWORD_LABELS[edid] ?? edid;

/** Qualifier clause for one modifier's conditions, plus whether any of them are currently inert. */
function describeConditions(conditions: readonly Condition[]): { clause: string; inactive: boolean } {
  const clauses: string[] = [];
  let inactive = false;
  for (const c of conditions) {
    switch (c.kind) {
      case 'weaponKeyword':
        clauses.push(c.present ? `with ${weaponLabel(c.keyword)}` : `non-${weaponLabel(c.keyword)}`);
        break;
      case 'weaponKeywordAny':
        clauses.push(`with ${c.keywords.map(weaponLabel).join(' or ')}`);
        break;
      case 'damageTypeScope':
        clauses.push(`${c.types.join('/')} damage only`);
        break;
      case 'enemyType':
        clauses.push(`vs ${enemyLabel(c.keywordOrRace)}`);
        break;
      case 'enemyTypeAny':
        clauses.push(`vs ${c.keywordsOrRaces.map(enemyLabel).join(' or ')}`);
        break;
      case 'unresolved':
        inactive = true;
        break;
      default:
        // Other condition kinds aren't produced by magazine/bobblehead
        // extraction today (see docs/assumptions.md "Magazines & bobbleheads").
        break;
    }
  }
  return { clause: clauses.join(', '), inactive };
}

function describeModifier(m: Modifier): string | null {
  if (m.curve) return null; // not produced by magazine/bobblehead extraction today
  const percentLabel = PERCENT_BUCKET_LABELS[m.bucket];
  const specialLabel = SPECIAL_BUCKET_LABELS[m.bucket];
  let base: string;
  if (percentLabel) {
    base = `${formatPercent(m.value)} ${percentLabel}`;
  } else if (specialLabel) {
    base = `${m.value > 0 ? '+' : ''}${m.value} ${specialLabel}`;
  } else {
    return null; // unmodeled bucket — omit rather than show something unverified
  }
  const { clause, inactive } = describeConditions(m.conditions);
  if (clause) base += ` (${clause})`;
  if (inactive) base += ' — not modeled yet, no effect';
  return base;
}

/** Short "+10% damage (with ballistic weapons)" summary, or null if nothing describable. */
export function describeBuffModifiers(buff: GeneratedBuff): string | null {
  const parts = buff.modifiers.map(describeModifier).filter((s): s is string => s !== null);
  return parts.length > 0 ? parts.join('; ') : null;
}
