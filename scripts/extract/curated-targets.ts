import type { BodyPartRaceCategory } from '../../src/types/generated';

/**
 * The curated enemy target list — shared join key for every per-enemy
 * extractor (body parts, NPC stats). The ESM has hundreds of RACE/NPC_
 * records (children, dev dupes, subgraph-data stubs) and display names
 * collide, so notable combat enemies are named explicitly here. Rows may
 * name a RACE edid directly or an NPC_ edid, which lets boss entries that
 * share a race stay distinct in the picker. Labels are in-game FULL names
 * verified against the 20260702 dump (20260710 for the rows added since).
 *
 * `id` (the picker key, persisted as EnemyConditions.targetRace) is this
 * row's `edid` — do not rename an existing edid without a migration.
 *
 * Originally lived in extract-bodyparts.ts (which still owns the
 * `conditionPartsOnly`/`crippleImmune` BPTD escape hatches — see that file's
 * header for their semantics); hoisted here 2026-07-18 so extract-npcs.ts can
 * share the exact same row set without a circular import.
 */
export interface CuratedTarget {
  edid: string;
  label: string;
  category: BodyPartRaceCategory;
  /** Keep only Actor-Value-tracked parts (drop perk-gated phantom weak points). BPTD-only — see extract-bodyparts.ts. */
  conditionPartsOnly?: boolean;
  /** Actor takes zero limb damage — force every part non-crippable. BPTD-only — see extract-bodyparts.ts. */
  crippleImmune?: boolean;
}

export const CURATED_TARGETS: CuratedTarget[] = [
  { edid: 'HumanRace', label: 'Human', category: 'standard' },
  { edid: 'FeralGhoulRace', label: 'Feral Ghoul', category: 'standard' },
  { edid: 'ScorchedRace', label: 'Scorched', category: 'standard' },
  { edid: 'SuperMutantRace', label: 'Super Mutant', category: 'standard' },
  // Daily Ops boss; shares SuperMutantRace (BPTD 0x0002B4C3) with the row
  // above — see the CURATED_TARGETS header note.
  { edid: 'LvlSuperMutantBoss_DailyOps', label: 'Super Mutant Firestarter', category: 'standard' },
  { edid: 'SupermutantBehemothRace', label: 'Behemoth', category: 'standard' },
  { edid: 'MoleMinerRace', label: 'Mole Miner', category: 'standard' },
  { edid: 'ViciousDogRace', label: 'Wild Mongrel', category: 'standard' },
  { edid: 'WendigoRace', label: 'Wendigo', category: 'standard' },
  // Earle Williams (the E06 world boss) is a scripted spawn of this same
  // race with no unique BPTD (NPC_ EN06_LvlWendigoColossus_Nuked resolves to
  // the same WendigoColossusRace / BPTD 0x0055AEC9) — merged into one row
  // rather than added as a duplicate.
  { edid: 'WendigoColossusRace', label: 'Earle / Wendigo Colossus', category: 'standard' },
  { edid: 'YaoGuaiRace', label: 'Yao Guai', category: 'standard' },
  { edid: 'DeathclawRace', label: 'Deathclaw', category: 'standard' },
  { edid: 'MirelurkRace', label: 'Mirelurk', category: 'standard' },
  { edid: 'MirelurkHunterRace', label: 'Mirelurk Hunter', category: 'standard' },
  { edid: 'MirelurkKingRace', label: 'Mirelurk King', category: 'standard' },
  { edid: 'MirelurkQueenRace', label: 'Mirelurk Queen', category: 'standard' },
  { edid: 'MothmanRace', label: 'Mothman', category: 'standard' },
  // The Scorchbeast Queen has no separate RACE — she shares ScorchBeastRace.
  { edid: 'ScorchBeastRace', label: 'Scorchbeast', category: 'standard' },
  // Shares ScorchBeastRace (BPTD 0x00017DD5) with the row above — see the
  // CURATED_TARGETS header note.
  { edid: 'EncScorchbeastQueen01Template', label: 'Scorchbeast Queen', category: 'standard' },
  { edid: 'RadScorpionRace', label: 'Radscorpion', category: 'standard' },
  { edid: 'SnallyGasterRace', label: 'Snallygaster', category: 'standard' },
  { edid: 'GraftonMonsterRace', label: 'Grafton Monster', category: 'standard' },
  { edid: 'SheepsquatchRace', label: 'Sheepsquatch', category: 'standard' },
  { edid: 'MegaSlothRace', label: 'Megasloth', category: 'standard' },
  { edid: 'HoneyBeastRace', label: 'Honey Beast', category: 'standard' },
  { edid: 'DLC03_AnglerRace', label: 'Angler', category: 'standard' },
  { edid: 'DLC03_FogCrawlerRace', label: 'Fog Crawler', category: 'standard' },
  { edid: 'DLC03_GulperRace', label: 'Gulper', category: 'standard' },
  { edid: 'FlatwoodsMonsterRace', label: 'Flatwoods Monster', category: 'standard' },
  // NoCripple KYWD 0x00248D2D sits on the NPC_ EncBlueDevil (0x006A063D),
  // not this RACE — hand-flagged since a RACE-keyed curated row can't see it.
  { edid: 'BlueDevilRace', label: 'Blue Devil', category: 'standard', crippleImmune: true },
  { edid: 'OguaRace', label: 'Ogua', category: 'standard' },
  // In-game name is "Ultracite Titan" (edid kept — persisted as EnemyConditions.targetRace).
  { edid: 'UltraciteAbominationRace', label: 'Ultracite Titan', category: 'standard' },
  { edid: 'AssaultronRace', label: 'Assaultron', category: 'standard' },
  { edid: 'ProtectronRace', label: 'Protectron', category: 'standard' },
  { edid: 'SentryBotRace', label: 'Sentry Bot', category: 'standard' },
  { edid: 'LiberatorRace', label: 'Liberator', category: 'standard' },
  { edid: 'StormBossRace', label: 'Storm Goliath', category: 'standard' },
  // NoCripplePerk 0x004121E8 directly on the boss NPC_ EncBigfootTemplate.
  { edid: 'BigfootRace', label: 'Bigfoot', category: 'standard', crippleImmune: true },
  // NoCripplePerk 0x004121E8 directly on the NPC_ (not the shared DeathclawRace,
  // so the plain "Deathclaw" entry above stays crippable).
  { edid: 'Burn_E01_EncDeathclawMatriarch', label: 'Deathclaw Matriarch', category: 'standard', crippleImmune: true },

  // Gleaming Depths raid (RD01_) encounter bosses. The Ultragenetic Mole
  // Miner Stalker is deliberately absent — it takes no damage. The Terror's
  // tail/body NPCs have their own races, but every part there is a null-AV
  // ×1.0 (the head race carries the real weakpoints — eyes + armor plates),
  // so only the head entry is listed. The Guardian's torso and 5 of its 6
  // "limbs" are gated by the actor perk RD01_Enc01_PreventLimbDamage_Perk
  // (0x0077459D, EP "Mod Body Part Damage Mult" ×0 while its shield is up) —
  // only its shield generator and torso carry a real Actor Value, so
  // `conditionPartsOnly` drops the 5 phantom ×3 "weak points" the BPTD lists.
  { edid: 'RD01_Enc01_GuardianBot', label: 'EN06 Guardian', category: 'raid', conditionPartsOnly: true },
  { edid: 'RD01_Enc04_Grenadier', label: 'Epsilon Squad - Lynx', category: 'raid' },
  { edid: 'RD01_Enc04_Assassin', label: 'Epsilon Squad - Vulture', category: 'raid' },
  { edid: 'RD01_Enc04_Brute', label: 'Epsilon Squad - Bloodhound', category: 'raid' },
  { edid: 'RD01_Enc06_ScorchtongueHead', label: 'Ultracite Terror', category: 'raid' },

  // Infestation event bosses (HTO_): tiers T1–T5 share name/race — T5 listed.
  { edid: 'HTO_LvlBloodEagle_Boss_T5', label: 'Blood Eagle Destroyer', category: 'infestation' },
  { edid: 'HTO_LvlPRCGhoul_Boss_T5', label: 'Communist Commissar', category: 'infestation' },
  { edid: 'HTO_LvlCultist_Boss_T5', label: 'Cultist Prophet', category: 'infestation' },
  { edid: 'HTO_LvlMoleMiner_Boss_T5', label: 'Mole Miner Juggernaut', category: 'infestation' },
  { edid: 'HTO_LvlSuperMutant_Boss_T5', label: 'Super Mutant Primus', category: 'infestation' },
  { edid: 'HTO_LvlScorched_Boss_T5', label: 'Scorched Exterminator', category: 'infestation' },
  { edid: 'HTO_LvlRobot_Boss_T5', label: 'Assaultron Intimidator', category: 'infestation' },
  // Slasher season boss (tiers T1–T5 share race/name — T5 listed, per the
  // convention above). Resolves to HumanRace, like the other humanoid rows.
  {
    edid: 'SDOW_HTO_LvlSlasherShadow_Boss_T5',
    label: 'Pint-Sized Phantom Trespasser',
    category: 'infestation',
  },

  // Head Hunt bounty bosses (Burning Springs, Burn_BountyTarget_BIG_*): all
  // 30 named targets, plus the shipped Slasher-season boss below. The two
  // _Template rows and remaining zzz*/SDOW_* records are placeholders/
  // seasonal-test, not listed.
  { edid: 'Burn_BountyTarget_BIG_Death', label: 'The Pale Horseman', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_War', label: 'The Red Rider', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Pestilence', label: 'The White Horseman', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Famine', label: 'The Black Horseman', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Granny', label: 'Granny Dolores', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Astronaut', label: 'The Space Ranger', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_AntiGhoul', label: 'Cletus Brimstone', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Irradiated', label: 'Irene The Irradiated', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Pilot', label: 'The Ace', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_NukaQueen', label: 'Anna The Nuka-Queen', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_QuackDoctor', label: 'The Malpractitioner', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Patriot', label: 'Corporal Jane', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Foreman', label: 'The Foreman', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Researcher', label: 'The Chief Researcher', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_ScoutLeader', label: 'Scout Leader Karen', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_BarryTone', label: 'Ragtime Randy', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Devil', label: 'The Devil of Defiance', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Rich', label: 'Baron Boris Wazie', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Gambler', label: 'Vito "The Vic" Bronco', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Mechanist', label: 'Tincan Toni', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Fisherman', label: 'Amadi the Piranha', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_RoboBrain', label: 'Chief Engineer Lewis', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Sniper', label: 'Charlie Half-Cocked', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Boxer', label: 'Becca The Heavyweight', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Gunslinger', label: 'Cowgirl Janine', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_BigGun', label: 'Richie Finesse', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Crusher', label: 'Gentle Gary', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Commie', label: 'The Proletariat Punisher', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Abraxo', label: 'The Cleaner', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Hunter', label: 'Colt the Bolt', category: 'headhunt' },
  // Slasher season Head Hunt boss (SDOW_ = seasonal — now shipped, unlike
  // the placeholder/test SDOW_ records excluded above). Resolves to
  // GhoulRace, like the other Head Hunt bounty bosses.
  {
    edid: 'SDOW_Burn_BountyTarget_BIG_Slasher',
    label: 'The Reborn Pint-Sized Slasher',
    category: 'headhunt',
  },
];
