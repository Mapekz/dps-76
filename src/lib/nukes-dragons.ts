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

  // Legendary Perks
  "01": PerkId.RadSpecialist,
  "03": PerkId.RadioactiveStrength,
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
};

/**
 * Returns true if the given N&D key belongs to a legendary perk.
 * All legendary perk keys in the nukesDragonsPerks map start with "0".
 */
export function isLegendaryPerkKey(key: string): boolean {
  return key.startsWith("0");
}

/**
 * Parse a Nukes & Dragons build URL to extract perks.
 *
 * The `p=` param contains both regular perks (keys like "ad") and, when present,
 * legendary perk cards (keys like "01", "0b", etc.).  Both are parsed here; callers
 * can separate them by checking `isLegendaryPerkKey(perk.key)`.
 *
 * Note on the `cd=` param: its encoding is not yet reverse-engineered from the
 * sample URL.  See todos/special-parsing.md and todos/fire-rate.md for context.
 * If legendary perk ranks are absent from results after fixing `parsedPerksToLoadout`,
 * revisit whether they are encoded in `cd=` rather than in `p=`.
 */
export function parseBuildUrl(url: string): ParsedPerk[] {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const perkString = params.get("p") ?? "";
    return parsePerkString(perkString);
  } catch {
    return parsePerkString(url);
  }
}

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
