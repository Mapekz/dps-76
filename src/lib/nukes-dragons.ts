import { PerkId } from "@/data/perk-ids";
import type { ParsedPerk, PerkLoadout } from "@/types";

// Mapping from Nukes & Dragons URL keys to PerkId
export const nukesDragonsPerks: Record<string, PerkId> = {
  // Strength
  s0: PerkId.Bandolier,
  s1: PerkId.BatteriesIncluded,
  s2: PerkId.BearArms,
  s3: PerkId.TightlyWound,
  s4: PerkId.Slugger,
  s5: PerkId.WoundSalter,
  s7: PerkId.ThruHiker,
  s8: PerkId.BulletShield,
  s9: PerkId.IronFist,
  sa: PerkId.PackRat,
  sb: PerkId.TravelingPharmacy,
  sc: PerkId.Basher,
  sd: PerkId.EasyTarget,
  se: PerkId.Incisor,
  sf: PerkId.Barbarian,
  sg: PerkId.Blocker,
  si: PerkId.NaturalStance,
  sj: PerkId.BloodLuster,
  sm: PerkId.Kneecapper,
  sn: PerkId.HeavyHitter,
  so: PerkId.LoveTheSpread,
  sp: PerkId.ShotgunChamp,
  sq: PerkId.BulletStorm,
  sr: PerkId.BringingOutTheBigGuns,
  ss: PerkId.MartialArtist,
  st: PerkId.FullCharge,
  su: PerkId.Scattershot,
  sv: PerkId.StrongBack,
  sw: PerkId.OrdnanceExpress,
  sx: PerkId.LockAndLoad,
  sy: PerkId.PainTrain,
  sz: PerkId.ArmsKeeper,

  // Perception
  p0: PerkId.ConcentratedFire,
  p1: PerkId.GreenThumb,
  p2: PerkId.NightPerson,
  p3: PerkId.Pannapictagraphist,
  p4: PerkId.Perceptibobble,
  p5: PerkId.Refractor,
  p6: PerkId.Sniper,
  p7: PerkId.ButchersBounty,
  p8: PerkId.PicklockExpert,
  p9: PerkId.PicklockMaster,
  pa: PerkId.Picklock,
  pb: PerkId.CrackShot,
  pc: PerkId.SkeetShooter,
  pd: PerkId.DownRanger,
  pe: PerkId.GlowSight,
  pf: PerkId.Awareness,
  pg: PerkId.CenterMasochist,
  ph: PerkId.FastFighter,
  pi: PerkId.NumberCruncher,
  pj: PerkId.StrongArm,
  pk: PerkId.RiflemanExpert,
  pl: PerkId.RiflemanMaster,
  pm: PerkId.Exterminator,
  pn: PerkId.BowBeforeMe,
  po: PerkId.GroundPounder,
  pp: PerkId.TankKiller,
  pq: PerkId.Grenadier,
  pr: PerkId.LongShot,
  ps: PerkId.NightEyes,
  pt: PerkId.Archer,
  pu: PerkId.ArcherExpert,
  pv: PerkId.ArcherMaster,

  // Endurance
  e0: PerkId.AquaBoyGirl,
  e1: PerkId.Dromedary,
  e2: PerkId.ProfessionalDrinker,
  e3: PerkId.Revenant,
  e4: PerkId.SlowMetabolizer,
  e5: PerkId.Vaccinated,
  e6: PerkId.GoodDoggy,
  e7: PerkId.IronStomach,
  e8: PerkId.LeadBelly,
  e9: PerkId.ThirstQuencher,
  ea: PerkId.HydroFix,
  eb: PerkId.NaturalResistance,
  ed: PerkId.RadResistant,
  ee: PerkId.LifeGiver,
  ef: PerkId.AllNightLong,
  eg: PerkId.ChemResistant,
  eh: PerkId.Fireproof,
  ei: PerkId.Ghoulish,
  ej: PerkId.Ironclad,
  ek: PerkId.Rejuvenated,
  el: PerkId.Cannibal,
  em: PerkId.ColaNut,
  en: PerkId.MunchyResistance,
  eo: PerkId.AdamantiumSkeleton,
  ep: PerkId.SunKissed,
  eq: PerkId.Homebody,
  er: PerkId.SolarPowered,
  es: PerkId.ChemFiend,
  et: PerkId.NocturnalFortitude,
  eu: PerkId.Radicool,
  ev: PerkId.RadSponge,
  ew: PerkId.Photosynthetic,

  // Charisma
  c0: PerkId.AnimalFriend,
  c1: PerkId.Bodyguards,
  c2: PerkId.FriendlyFire,
  c3: PerkId.HappyCamper,
  c4: PerkId.HappyGoLucky,
  c5: PerkId.HardBargain,
  c6: PerkId.Inspirational,
  c7: PerkId.LoneWanderer,
  c8: PerkId.PartyBoyGirl,
  c9: PerkId.QuackSurgeon,
  ca: PerkId.SpiritualHealer,
  cc: PerkId.Philanthropist,
  cd: PerkId.SquadManeuvers,
  ce: PerkId.StrangeInNumbers,
  cf: PerkId.TeamMedic,
  cg: PerkId.Bloodsucker,
  ci: PerkId.EMT,
  cj: PerkId.MagneticPersonality,
  ck: PerkId.FieldSurgeon,
  cl: PerkId.Injector,
  cm: PerkId.Suppressor,
  co: PerkId.DryNurse,
  cq: PerkId.HealingHands,
  cr: PerkId.TravelAgent,
  cs: PerkId.OverlyGenerous,
  ct: PerkId.AntiEpidemic,
  cu: PerkId.Tenderizer,
  cv: PerkId.WastelandWhisperer,

  // Intelligence
  i1: PerkId.FirstAid,
  i3: PerkId.Hacker,
  i4: PerkId.MakeshiftWarrior,
  i5: PerkId.HackerMaster,
  i6: PerkId.Contractor,
  i7: PerkId.Science,
  i8: PerkId.LicensedPlumber,
  i9: PerkId.Pharmacist,
  ia: PerkId.HackerExpert,
  ib: PerkId.DemolitionExpert,
  ic: PerkId.Gunsmith,
  id: PerkId.PowerUser,
  ie: PerkId.PowerSmith,
  if: PerkId.FixItGood,
  ih: PerkId.PowerPatcher,
  ii: PerkId.Scrapper,
  ij: PerkId.Armorer,
  ik: PerkId.Chemist,
  il: PerkId.RoboticsExpert,
  im: PerkId.PyroTechnician,
  in: PerkId.Cryologist,
  io: PerkId.WreckingBall,
  ip: PerkId.Stabilized,
  iq: PerkId.WeaponArtisan,
  ir: PerkId.NerdRage,
  is: PerkId.StableTools,

  // Agility
  a0: PerkId.Adrenaline,
  a1: PerkId.Dodgy,
  a2: PerkId.GoatLegs,
  a3: PerkId.GunFu,
  a4: PerkId.Marathoner,
  a5: PerkId.MisterSandman,
  a6: PerkId.GunRunner,
  a7: PerkId.ActionBoyGirl,
  a8: PerkId.BornSurvivor,
  a9: PerkId.DeadManSprinting,
  aa: PerkId.MovingTarget,
  ab: PerkId.Guerrilla,
  ac: PerkId.PackinLight,
  ad: PerkId.Gunslinger,
  ae: PerkId.SecretAgent,
  af: PerkId.GuerrillaExpert,
  ag: PerkId.HomeDefense,
  ah: PerkId.Lightfooted,
  ai: PerkId.GuerrillaMaster,
  aj: PerkId.Ninja,
  ak: PerkId.GunslingerExpert,
  al: PerkId.GunslingerMaster,
  am: PerkId.Evasive,
  an: PerkId.CovertOperative,
  ao: PerkId.EscapeArtist,
  ap: PerkId.ModernRenegade,
  ar: PerkId.Sneak,
  as: PerkId.Enforcer,
  at: PerkId.Ammosmith,
  au: PerkId.WhiteKnight,

  // Luck
  l0: PerkId.CanDo,
  l1: PerkId.GrimReapersSprint,
  l2: PerkId.LuckOfTheDraw,
  l3: PerkId.MysteriousSavior,
  l4: PerkId.MysteriousStranger,
  l5: PerkId.MysteryMeat,
  l6: PerkId.Scrounger,
  l7: PerkId.StarchedGenes,
  l9: PerkId.PharmaFarma,
  la: PerkId.Serendipity,
  lb: PerkId.GoodWithSalt,
  lc: PerkId.JunkShield,
  ld: PerkId.Psychopath,
  le: PerkId.QuickHands,
  lf: PerkId.WoodChucker,
  lg: PerkId.Ricochet,
  lh: PerkId.StormChaser,
  li: PerkId.Tormentor,
  lj: PerkId.CapCollector,
  lk: PerkId.CriticalSavvy,
  ll: PerkId.LastLaugh,
  lm: PerkId.SuperDuper,
  ln: PerkId.FortuneFinder,
  lp: PerkId.LuckyBreak,
  lq: PerkId.Curator,
  lr: PerkId.FourLeafClover,
  ls: PerkId.OneGunArmy,
  lt: PerkId.BloodyMess,
  lu: PerkId.ClassFreak,
  lv: PerkId.BetterCriticals,

  // Ghoul perks (regular SPECIAL cards, ghoul-only). N&D's "0"-prefixed key
  // space, case-sensitive — "0d"/"0D" and "0n"/"0N" are DIFFERENT perks.
  "01": PerkId.RadSpecialist,
  "03": PerkId.RadioactiveStrength,
  "05": PerkId.ArmsOfSteel,
  "07": PerkId.MadScientist,
  "09": PerkId.EyeOfTheHunter,
  "0B": PerkId.BrickWall,
  "0F": PerkId.ChemDiet,
  "0H": PerkId.ScienceMonster,
  "0J": PerkId.BombScientist,
  "0L": PerkId.MoralSupport,
  "0P": PerkId.RadReaver,
  "0R": PerkId.GunTricks,
  "0T": PerkId.HyperReflexes,
  "0V": PerkId.GlowingOne,
  "0X": PerkId.GlowingHunter,
  "0b": PerkId.ThickSkin,
  "0f": PerkId.BattleGenes,
  "0d": PerkId.FeralPresence,
  "0h": PerkId.UnitedOrdeal,
  "0j": PerkId.FaultySpots,
  "0l": PerkId.GlowingGut,
  "0p": PerkId.JaguarSpeed,
  "0r": PerkId.ActionGhoul,
  "0n": PerkId.GlowingCriticals,
  "0t": PerkId.RadiationPower,
  "0v": PerkId.WildWestHands,
  "0x": PerkId.BreathItIn,
  "0z": PerkId.BoneShatterer,

  // Legendary perks: N&D's "x"-prefixed keys, plus the two ghoul-exclusive
  // legendary cards 0D (Action Diet) and 0N (Feral Rage) which share the
  // ghoul "0" key space. Verified against N&D's own character bundle
  // (data.nukesdragons.com/db/fallout-76/character.bundle.json).
  x0: PerkId.AmmoFactory,
  x1: PerkId.FunkyDuds,
  x2: PerkId.HackAndSlash,
  x3: PerkId.SizzlingStyle,
  x4: PerkId.LegendaryAgility,
  x5: PerkId.LegendaryCharisma,
  x6: PerkId.LegendaryEndurance,
  x7: PerkId.LegendaryIntelligence,
  x8: PerkId.LegendaryLuck,
  x9: PerkId.LegendaryPerception,
  xa: PerkId.LegendaryStrength,
  xb: PerkId.MasterInfiltrator,
  xd: PerkId.PowerSprinter,
  xe: PerkId.SurvivalShortcut,
  xf: PerkId.BloodSacrifice,
  xg: PerkId.BrawlingChemist,
  xh: PerkId.CollateralDamage,
  xi: PerkId.DetonationContagion,
  xj: PerkId.ElectricAbsorption,
  xk: PerkId.ExplodingPalm,
  xl: PerkId.FarFlungFireworks,
  xm: PerkId.FollowThrough,
  xn: PerkId.PowerArmorReboot,
  xo: PerkId.Retribution,
  xp: PerkId.TakingOneForTheTeam,
  xq: PerkId.WhatRads,
  "0D": PerkId.ActionDiet,
  "0N": PerkId.FeralRage,
};

/**
 * N&D keys of legendary perk cards. An explicit set, NOT a prefix rule:
 * ghoul perks own most of the "0" key space (case-sensitively — "0d" is the
 * ghoul card Feral Presence while "0D" is the legendary Action Diet), and
 * legendary perks use "x" keys plus those two "0" stragglers.
 */
const LEGENDARY_PERK_KEYS: ReadonlySet<string> = new Set([
  "x0", "x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8", "x9", "xa", "xb",
  "xd", "xe", "xf", "xg", "xh", "xi", "xj", "xk", "xl", "xm", "xn", "xo",
  "xp", "xq", "0D", "0N",
]);

/** Returns true if the given N&D key belongs to a legendary perk. */
export function isLegendaryPerkKey(key: string): boolean {
  return LEGENDARY_PERK_KEYS.has(key);
}

/**
 * PerkIds that are legendary perk cards: derived from the legendary N&D keys,
 * plus an explicit union of the Legendary SPECIAL cards — redundant with the
 * x4–xa keys but kept as a safety net since those seven drive the perk-point
 * budget derivation (src/lib/player-stats.ts).
 */
export const legendaryPerkIds: ReadonlySet<string> = new Set<string>([
  ...Object.entries(nukesDragonsPerks)
    .filter(([key]) => isLegendaryPerkKey(key))
    .map(([, perkId]) => perkId),
  PerkId.LegendaryStrength,
  PerkId.LegendaryPerception,
  PerkId.LegendaryEndurance,
  PerkId.LegendaryCharisma,
  PerkId.LegendaryIntelligence,
  PerkId.LegendaryAgility,
  PerkId.LegendaryLuck,
]);

/**
 * Parse a Nukes & Dragons build URL to extract perks.
 *
 * The `p=` param carries regular perks (keys like "ad") including ghoul cards
 * ("0"-keys); the `lp=` param carries legendary perk cards ("x"-keys plus
 * 0D/0N) in the same 3-char chunk encoding — verified against the live N&D
 * planner (v=2 URLs). Both are parsed and merged here; callers separate them
 * by checking `isLegendaryPerkKey(perk.key)`, so a perk arriving in either
 * param still lands in the right list.
 */
export function parseBuildUrl(url: string): ParsedPerk[] {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    return [
      ...parsePerkString(params.get("p") ?? ""),
      ...parsePerkString(params.get("lp") ?? ""),
    ];
  } catch {
    return parsePerkString(url);
  }
}

// Decodes nukesdragons.com's own build-share URL perk chunks (externally
// fixed: base-10 rank, capped at 5 — not ours to change). Deliberately kept
// separate from src/lib/persist/codec.ts encodePerks/decodePerks, our richer
// internal wire format (base-36, rank capped at 35, plus fallback array).
// The shared nukesDragonsPerks dictionary (key → PerkId) is the one genuine
// shared seam between the two files.
export function parsePerkString(perkString: string): ParsedPerk[] {
  const perks: ParsedPerk[] = [];
  for (let i = 0; i + 2 < perkString.length; i += 3) {
    const key = perkString.slice(i, i + 2);
    const rankChar = perkString[i + 2];
    const rank = parseInt(rankChar, 10);
    const perkId = nukesDragonsPerks[key];
    if (perkId && !isNaN(rank) && rank >= 1 && rank <= 5) {
      perks.push({ key, name: perkId, rank });
    }
  }
  return perks;
}

/**
 * Convert parsed perks to PerkLoadout entries.
 *
 * BUG FIX: the previous implementation used `perk.key` (the 2-char N&D URL key,
 * e.g. "ad") as the perkId.  The damage formula looks up perks by PerkId (e.g.
 * "Gunslinger"), so nothing resolved.  `perk.name` already holds the correct PerkId.
 */
export function parsedPerksToLoadout(parsedPerks: ParsedPerk[]): PerkLoadout[] {
  return parsedPerks.map((perk) => ({ perkId: perk.name, rank: perk.rank }));
}

/**
 * Re-sorts a decoded perk/legendaryPerk split against the CURRENT
 * legendaryPerkIds set. Builds encoded before the ghoul-card/legendary-perk
 * reclassification stored now-regular PerkIds (e.g. RadSpecialist) under
 * legendaryPerks; this moves every perk to the list its PerkId belongs in.
 */
export function reclassifyPerkLoadouts(
  perks: PerkLoadout[],
  legendaryPerks: PerkLoadout[]
): { perks: PerkLoadout[]; legendaryPerks: PerkLoadout[]; migrated: number } {
  const all = [...perks, ...legendaryPerks];
  const migrated =
    perks.filter((p) => legendaryPerkIds.has(p.perkId)).length +
    legendaryPerks.filter((p) => !legendaryPerkIds.has(p.perkId)).length;
  return {
    perks: all.filter((p) => !legendaryPerkIds.has(p.perkId)),
    legendaryPerks: all.filter((p) => legendaryPerkIds.has(p.perkId)),
    migrated,
  };
}

/**
 * Parse the `s=` param: 7 hex digits in S-P-E-C-I-A-L order (a–f = 10–15).
 * Returns null when the param is absent/malformed.
 */
export function parseSpecialFromUrl(url: string): ParsedSpecial | null {
  try {
    const params = new URLSearchParams(new URL(url).search);
    const s = params.get('s');
    if (!s || s.length < 7) return null;
    const values = [...s.slice(0, 7)].map(ch => parseInt(ch, 16));
    if (values.some(v => Number.isNaN(v))) return null;
    const [strength, perception, endurance, charisma, intelligence, agility, luck] = values;
    return { strength, perception, endurance, charisma, intelligence, agility, luck };
  } catch {
    return null;
  }
}

export interface ParsedSpecial {
  strength: number;
  perception: number;
  endurance: number;
  charisma: number;
  intelligence: number;
  agility: number;
  luck: number;
}

export function parseBuildName(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const name = params.get("n");
    return name ? decodeURIComponent(name) : null;
  } catch {
    return null;
  }
}

export function isValidNukesDragonsUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.hostname === "nukesdragons.com" &&
      urlObj.pathname.includes("/fallout-76/character")
    );
  } catch {
    return false;
  }
}

export function getPerkId(key: string): PerkId | undefined {
  return nukesDragonsPerks[key];
}
