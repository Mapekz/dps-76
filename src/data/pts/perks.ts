import type { Perk } from "@/types";
import { PerkId } from "@/data/perk-ids";
import { Special } from "@/data/special";
import { Stat } from "@/data/stats";

// PTS data - mirrors live for now, update when PTS changes
export const perks: Record<PerkId, Perk> = {
  // ============ STRENGTH ============
  [PerkId.Bandolier]: { name: "Bandolier", special: Special.Strength, maxRank: 2, statsModified: [] },
  [PerkId.BatteriesIncluded]: { name: "Batteries Included", special: Special.Strength, maxRank: 3, statsModified: [] },
  [PerkId.BearArms]: { name: "Bear Arms", special: Special.Strength, maxRank: 3, statsModified: [] },
  [PerkId.TightlyWound]: { name: "Tightly Wound", special: Special.Strength, maxRank: 3, statsModified: [] },
  [PerkId.Slugger]: { name: "Slugger", special: Special.Strength, maxRank: 3, statsModified: [{ stat: Stat.DamageToCrippledBonus, value: 30 }] },
  [PerkId.WoundSalter]: { name: "Wound Salter", special: Special.Strength, maxRank: 3, statsModified: [] },
  [PerkId.ThruHiker]: { name: "Thru Hiker", special: Special.Strength, maxRank: 3, statsModified: [] },
  [PerkId.BulletShield]: { name: "Bullet Shield", special: Special.Strength, maxRank: 3, statsModified: [] },
  [PerkId.IronFist]: { name: "Iron Fist", special: Special.Strength, maxRank: 3, statsModified: [{ stat: Stat.UnarmedDamageBonus, value: 20 }] },
  [PerkId.PackRat]: { name: "Pack Rat", special: Special.Strength, maxRank: 3, statsModified: [] },
  [PerkId.TravelingPharmacy]: { name: "Traveling Pharmacy", special: Special.Strength, maxRank: 3, statsModified: [] },
  [PerkId.Basher]: { name: "Basher", special: Special.Strength, maxRank: 3, statsModified: [{ stat: Stat.BashDamageBonus, value: 50 }, { stat: Stat.LimbDamageBonus, value: 75 }] },
  [PerkId.EasyTarget]: { name: "Easy Target", special: Special.Strength, maxRank: 3, statsModified: [{ stat: Stat.DamageToCrippledBonus, value: 75 }] },
  [PerkId.Incisor]: { name: "Incisor", special: Special.Strength, maxRank: 3, statsModified: [{ stat: Stat.ArmorPenetration, value: 75 }] },
  [PerkId.Barbarian]: { name: "Barbarian", special: Special.Strength, maxRank: 3, statsModified: [] }, // SPECIAL-scaled: DR = STR value
  [PerkId.Blocker]: { name: "Blocker", special: Special.Strength, maxRank: 3, statsModified: [{ stat: Stat.IncomingDamageMultiplier, value: -45 }] },
  [PerkId.NaturalStance]: { name: "Natural Stance", special: Special.Strength, maxRank: 3, statsModified: [] }, // -25% stagger - not implemented
  [PerkId.BloodLuster]: { name: "Blood Luster", special: Special.Strength, maxRank: 3, statsModified: [] }, // Team buff - not implemented
  [PerkId.Kneecapper]: { name: "Knee-capper", special: Special.Strength, maxRank: 3, statsModified: [{ stat: Stat.MeleeLimbDamageBonus, value: 50 }] },
  [PerkId.HeavyHitter]: { name: "Heavy Hitter", special: Special.Strength, maxRank: 3, statsModified: [{ stat: Stat.PowerAttackDamageBonus, value: 50 }] },
  [PerkId.LoveTheSpread]: { name: "Love the Spread", special: Special.Strength, maxRank: 3, statsModified: [] }, // +30% range - not damage
  [PerkId.ShotgunChamp]: { name: "Shotgun Champ", special: Special.Strength, maxRank: 3, statsModified: [{ stat: Stat.DamageToCrippledBonus, value: 10 }] }, // Per projectile
  [PerkId.BulletStorm]: { name: "Bullet Storm", special: Special.Strength, maxRank: 3, statsModified: [{ stat: Stat.BulletStormDamagePerStack, value: 9 }] },
  [PerkId.BringingOutTheBigGuns]: { name: "Bringing Out the Big Guns", special: Special.Strength, maxRank: 3, statsModified: [] }, // Doubles Bullet Storm max stacks - special handling
  [PerkId.MartialArtist]: { name: "Martial Artist", special: Special.Strength, maxRank: 3, statsModified: [] }, // +30% swing speed - not direct damage
  [PerkId.FullCharge]: { name: "Full Charge", special: Special.Strength, maxRank: 3, statsModified: [{ stat: Stat.PowerAttackDamageBonus, value: 50 }] },
  [PerkId.Scattershot]: { name: "Scattershot", special: Special.Strength, maxRank: 3, statsModified: [] }, // Shotgun-specific - need to verify
  [PerkId.StrongBack]: { name: "Strong Back", special: Special.Strength, maxRank: 4, statsModified: [] }, // Carry weight - not combat
  [PerkId.OrdnanceExpress]: { name: "Ordnance Express", special: Special.Strength, maxRank: 3, statsModified: [] }, // Weight reduction - not combat
  [PerkId.LockAndLoad]: { name: "Lock And Load", special: Special.Strength, maxRank: 3, statsModified: [] }, // Reload speed - indirect combat
  [PerkId.PainTrain]: { name: "Pain Train", special: Special.Strength, maxRank: 3, statsModified: [] }, // Sprint damage - not implemented
  [PerkId.ArmsKeeper]: { name: "Arms Keeper", special: Special.Strength, maxRank: 3, statsModified: [] }, // Durability - not combat

  // ============ PERCEPTION ============
  [PerkId.ConcentratedFire]: { name: "Concentrated Fire", special: Special.Perception, maxRank: 3, statsModified: [] }, // +3% accuracy & damage per shot - stacking mechanic not implemented
  [PerkId.GreenThumb]: { name: "Green Thumb", special: Special.Perception, maxRank: 1, statsModified: [] }, // Harvesting - not combat
  [PerkId.NightPerson]: { name: "Night Person", special: Special.Perception, maxRank: 3, statsModified: [] }, // Night time bonus - not implemented
  [PerkId.Pannapictagraphist]: { name: "Pannapictagraphist", special: Special.Perception, maxRank: 1, statsModified: [] }, // Photo mode - not combat
  [PerkId.Perceptibobble]: { name: "Perceptibobble", special: Special.Perception, maxRank: 1, statsModified: [] }, // Bobblehead duration - not combat
  [PerkId.Refractor]: { name: "Refractor", special: Special.Perception, maxRank: 5, statsModified: [] }, // SPECIAL-scaled: ER = PER value
  [PerkId.Sniper]: { name: "Sniper", special: Special.Perception, maxRank: 3, statsModified: [] }, // Scoped rifle damage - need weapon mod check
  [PerkId.ButchersBounty]: { name: "Butcher's Bounty", special: Special.Perception, maxRank: 3, statsModified: [] }, // Meat harvest - not combat
  [PerkId.PicklockExpert]: { name: "Picklock Expert", special: Special.Perception, maxRank: 1, statsModified: [] }, // Lockpicking - not combat
  [PerkId.PicklockMaster]: { name: "Picklock Master", special: Special.Perception, maxRank: 1, statsModified: [] }, // Lockpicking - not combat
  [PerkId.Picklock]: { name: "Picklock", special: Special.Perception, maxRank: 1, statsModified: [] }, // Lockpicking - not combat
  [PerkId.CrackShot]: { name: "Crack Shot", special: Special.Perception, maxRank: 3, statsModified: [] }, // Accuracy - not direct damage
  [PerkId.SkeetShooter]: { name: "Skeet Shooter", special: Special.Perception, maxRank: 3, statsModified: [] }, // Accuracy - not direct damage
  [PerkId.DownRanger]: { name: "Down Ranger", special: Special.Perception, maxRank: 3, statsModified: [] }, // +20% ranged damage to distant enemies - conditional
  [PerkId.GlowSight]: { name: "Glow Sight", special: Special.Perception, maxRank: 3, statsModified: [{ stat: Stat.DamageToGlowingEnemiesBonus, value: 60 }] },
  [PerkId.Awareness]: { name: "Awareness", special: Special.Perception, maxRank: 1, statsModified: [] }, // Enemy info display - not combat
  [PerkId.CenterMasochist]: { name: "Center Masochist", special: Special.Perception, maxRank: 3, statsModified: [{ stat: Stat.TorsoDamageBonus, value: 75 }] },
  [PerkId.FastFighter]: { name: "Fast Fighter", special: Special.Perception, maxRank: 3, statsModified: [] }, // Fire rate - not direct damage
  [PerkId.NumberCruncher]: { name: "Number Cruncher", special: Special.Perception, maxRank: 3, statsModified: [] }, // Damage numbers display - not combat
  [PerkId.StrongArm]: { name: "Strong Arm", special: Special.Perception, maxRank: 3, statsModified: [] }, // Throwing range - not direct damage
  [PerkId.RiflemanExpert]: { name: "Rifleman Expert", special: Special.Perception, maxRank: 3, statsModified: [] }, // Old weapon-type perk - reworked
  [PerkId.RiflemanMaster]: { name: "Rifleman Master", special: Special.Perception, maxRank: 3, statsModified: [] }, // Old weapon-type perk - reworked
  [PerkId.Exterminator]: { name: "Exterminator", special: Special.Perception, maxRank: 3, statsModified: [{ stat: Stat.ArmorPenetrationVsInsects, value: 75 }] },
  [PerkId.BowBeforeMe]: { name: "Bow Before Me", special: Special.Perception, maxRank: 3, statsModified: [{ stat: Stat.ArmorPenetration, value: 40 }] }, // Bow/crossbow only
  [PerkId.GroundPounder]: { name: "Ground Pounder", special: Special.Perception, maxRank: 3, statsModified: [] }, // Reload speed & accuracy - not direct damage
  [PerkId.TankKiller]: { name: "Tank Killer", special: Special.Perception, maxRank: 3, statsModified: [{ stat: Stat.ArmorPenetration, value: 40 }] },
  [PerkId.Grenadier]: { name: "Grenadier", special: Special.Perception, maxRank: 2, statsModified: [] }, // 2x explosion radius - area effect not damage
  [PerkId.LongShot]: { name: "Long Shot", special: Special.Perception, maxRank: 3, statsModified: [] }, // Range/accuracy - not direct damage
  [PerkId.NightEyes]: { name: "Night Eyes", special: Special.Perception, maxRank: 1, statsModified: [] }, // Night vision - not combat
  [PerkId.Archer]: { name: "Archer", special: Special.Perception, maxRank: 3, statsModified: [{ stat: Stat.BowDamageBonus, value: 60 }] },
  [PerkId.ArcherExpert]: { name: "Archer Expert", special: Special.Perception, maxRank: 3, statsModified: [{ stat: Stat.BowDamageBonus, value: 75 }] },
  [PerkId.ArcherMaster]: { name: "Archer Master", special: Special.Perception, maxRank: 3, statsModified: [{ stat: Stat.BowDamageBonus, value: 100 }] },

  // ============ ENDURANCE ============
  [PerkId.AquaBoyGirl]: { name: "Aqua Boy/Girl", special: Special.Endurance, maxRank: 1, statsModified: [] },
  [PerkId.Dromedary]: { name: "Dromedary", special: Special.Endurance, maxRank: 3, statsModified: [] },
  [PerkId.ProfessionalDrinker]: { name: "Professional Drinker", special: Special.Endurance, maxRank: 3, statsModified: [] },
  [PerkId.Revenant]: { name: "Revenant", special: Special.Endurance, maxRank: 2, statsModified: [{ stat: Stat.OutgoingDamageMultiplier, value: 25 }] }, // Increased damage while Feral
  [PerkId.SlowMetabolizer]: { name: "Slow Metabolizer", special: Special.Endurance, maxRank: 3, statsModified: [] },
  [PerkId.Vaccinated]: { name: "Vaccinated", special: Special.Endurance, maxRank: 3, statsModified: [] }, // Disease resistance - not combat
  [PerkId.GoodDoggy]: { name: "Good Doggy", special: Special.Endurance, maxRank: 3, statsModified: [] },
  [PerkId.IronStomach]: { name: "Iron Stomach", special: Special.Endurance, maxRank: 3, statsModified: [] },
  [PerkId.LeadBelly]: { name: "Lead Belly", special: Special.Endurance, maxRank: 3, statsModified: [] },
  [PerkId.ThirstQuencher]: { name: "Thirst Quencher", special: Special.Endurance, maxRank: 3, statsModified: [] },
  [PerkId.HydroFix]: { name: "Hydro Fix", special: Special.Endurance, maxRank: 3, statsModified: [] },
  [PerkId.NaturalResistance]: { name: "Natural Resistance", special: Special.Endurance, maxRank: 3, statsModified: [] }, // SPECIAL-scaled elemental resists
  [PerkId.RadResistant]: { name: "Rad Resistant", special: Special.Endurance, maxRank: 4, statsModified: [] }, // SPECIAL-scaled: RR = END value
  [PerkId.LifeGiver]: { name: "Life Giver", special: Special.Endurance, maxRank: 4, statsModified: [] }, // +45 HP - not damage
  [PerkId.AllNightLong]: { name: "All Night Long", special: Special.Endurance, maxRank: 3, statsModified: [] }, // Night time bonuses - not implemented
  [PerkId.ChemResistant]: { name: "Chem Resistant", special: Special.Endurance, maxRank: 2, statsModified: [] }, // Addiction resistance - not combat
  [PerkId.Fireproof]: { name: "Fireproof", special: Special.Endurance, maxRank: 3, statsModified: [{ stat: Stat.IncomingExplosionDamageMultiplier, value: -45 }, { stat: Stat.FireResist, value: 45 }] },
  [PerkId.Ghoulish]: { name: "Ghoulish", special: Special.Endurance, maxRank: 3, statsModified: [] }, // Rad healing - special mechanic
  [PerkId.Ironclad]: { name: "Ironclad", special: Special.Endurance, maxRank: 5, statsModified: [{ stat: Stat.DamageResist, value: 25 }, { stat: Stat.EnergyResist, value: 25 }] }, // +50% with matching armor set
  [PerkId.Rejuvenated]: { name: "Rejuvenated", special: Special.Endurance, maxRank: 2, statsModified: [] }, // Well fed/hydrated bonuses - not direct combat
  [PerkId.Cannibal]: { name: "Cannibal", special: Special.Endurance, maxRank: 3, statsModified: [] }, // Corpse eating - not combat
  [PerkId.ColaNut]: { name: "Cola Nut", special: Special.Endurance, maxRank: 2, statsModified: [] }, // Nuka-Cola bonuses - consumable effect
  [PerkId.MunchyResistance]: { name: "Munchy Resistance", special: Special.Endurance, maxRank: 3, statsModified: [] }, // Chem addiction - not combat
  [PerkId.AdamantiumSkeleton]: { name: "Adamantium Skeleton", special: Special.Endurance, maxRank: 3, statsModified: [{ stat: Stat.LimbDamageReduction, value: 75 }] },
  [PerkId.SunKissed]: { name: "Sun Kissed", special: Special.Endurance, maxRank: 3, statsModified: [] },
  [PerkId.Homebody]: { name: "Homebody", special: Special.Endurance, maxRank: 3, statsModified: [] },
  [PerkId.SolarPowered]: { name: "Solar Powered", special: Special.Endurance, maxRank: 3, statsModified: [] }, // Daytime STR/END bonus - not direct combat
  [PerkId.ChemFiend]: { name: "Chem Fiend", special: Special.Endurance, maxRank: 3, statsModified: [] }, // Chem duration - not direct combat
  [PerkId.NocturnalFortitude]: { name: "Nocturnal Fortitude", special: Special.Endurance, maxRank: 3, statsModified: [] }, // Night time DR/ER - conditional
  [PerkId.Radicool]: { name: "Radicool", special: Special.Endurance, maxRank: 1, statsModified: [] }, // +5 STR at high rads - stat boost not damage
  [PerkId.RadSponge]: { name: "Rad Sponge", special: Special.Endurance, maxRank: 3, statsModified: [] }, // Team rad reduction - not combat
  [PerkId.Photosynthetic]: { name: "Photosynthetic", special: Special.Endurance, maxRank: 2, statsModified: [] }, // Sunlight healing - not combat

  // ============ CHARISMA ============
  [PerkId.AnimalFriend]: { name: "Animal Friend", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.Bodyguards]: { name: "Bodyguards", special: Special.Charisma, maxRank: 4, statsModified: [] }, // SPECIAL-scaled DR/ER per teammate
  [PerkId.FriendlyFire]: { name: "Friendly Fire", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.HappyCamper]: { name: "Happy Camper", special: Special.Charisma, maxRank: 2, statsModified: [] },
  [PerkId.HappyGoLucky]: { name: "Happy-Go-Lucky", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.HardBargain]: { name: "Hard Bargain", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.Inspirational]: { name: "Inspirational", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.LoneWanderer]: { name: "Lone Wanderer", special: Special.Charisma, maxRank: 4, statsModified: [] }, // SPECIAL-scaled DR/ER when solo
  [PerkId.PartyBoyGirl]: { name: "Party Boy/Girl", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.QuackSurgeon]: { name: "Quack Surgeon", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.SpiritualHealer]: { name: "Spiritual Healer", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.Philanthropist]: { name: "Philanthropist", special: Special.Charisma, maxRank: 1, statsModified: [] },
  [PerkId.SquadManeuvers]: { name: "Squad Maneuvers", special: Special.Charisma, maxRank: 2, statsModified: [] },
  [PerkId.StrangeInNumbers]: { name: "Strange In Numbers", special: Special.Charisma, maxRank: 1, statsModified: [] },
  [PerkId.TeamMedic]: { name: "Team Medic", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.Bloodsucker]: { name: "Bloodsucker", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.EMT]: { name: "EMT", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.MagneticPersonality]: { name: "Magnetic Personality", special: Special.Charisma, maxRank: 2, statsModified: [] },
  [PerkId.FieldSurgeon]: { name: "Field Surgeon", special: Special.Charisma, maxRank: 1, statsModified: [] },
  [PerkId.Injector]: { name: "Injector", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.Suppressor]: { name: "Suppressor", special: Special.Charisma, maxRank: 3, statsModified: [] }, // Enemy debuff - reduces enemy damage by 30%
  [PerkId.DryNurse]: { name: "Dry Nurse", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.HealingHands]: { name: "Healing Hands", special: Special.Charisma, maxRank: 1, statsModified: [] },
  [PerkId.TravelAgent]: { name: "Travel Agent", special: Special.Charisma, maxRank: 1, statsModified: [] },
  [PerkId.OverlyGenerous]: { name: "Overly Generous", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.AntiEpidemic]: { name: "Anti Epidemic", special: Special.Charisma, maxRank: 3, statsModified: [] },
  [PerkId.Tenderizer]: { name: "Tenderizer", special: Special.Charisma, maxRank: 3, statsModified: [] }, // Enemy debuff - stacking damage taken
  [PerkId.WastelandWhisperer]: { name: "Wasteland Whisperer", special: Special.Charisma, maxRank: 3, statsModified: [] },

  // ============ INTELLIGENCE ============
  [PerkId.FirstAid]: { name: "First Aid", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // Stimpak healing - not combat
  [PerkId.Hacker]: { name: "Hacker", special: Special.Intelligence, maxRank: 1, statsModified: [] }, // Hacking - not combat
  [PerkId.MakeshiftWarrior]: { name: "Makeshift Warrior", special: Special.Intelligence, maxRank: 5, statsModified: [] }, // Melee durability - not combat
  [PerkId.HackerMaster]: { name: "Hacker Master", special: Special.Intelligence, maxRank: 1, statsModified: [] }, // Hacking - not combat
  [PerkId.Contractor]: { name: "Contractor", special: Special.Intelligence, maxRank: 2, statsModified: [] }, // Workshop costs - not combat
  [PerkId.Science]: { name: "Science!", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // SPECIAL-scaled energy damage OR crafting
  [PerkId.LicensedPlumber]: { name: "Licensed Plumber", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // Fusion core duration - not direct combat
  [PerkId.Pharmacist]: { name: "Pharmacist", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // RadAway healing - not combat
  [PerkId.HackerExpert]: { name: "Hacker Expert", special: Special.Intelligence, maxRank: 1, statsModified: [] }, // Hacking - not combat
  [PerkId.DemolitionExpert]: { name: "Demolition Expert", special: Special.Intelligence, maxRank: 5, statsModified: [{ stat: Stat.OutgoingExplosionDamageMultiplier, value: 100 }] },
  [PerkId.Gunsmith]: { name: "Gunsmith", special: Special.Intelligence, maxRank: 5, statsModified: [] }, // Gun durability - not direct combat
  [PerkId.PowerUser]: { name: "Power User", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // Fusion core duration - not direct combat
  [PerkId.PowerSmith]: { name: "Power Smith", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // PA crafting - not combat
  [PerkId.FixItGood]: { name: "Fix It Good", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // Repair bonus - not combat
  [PerkId.PowerPatcher]: { name: "Power Patcher", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // PA repair - not combat
  [PerkId.Scrapper]: { name: "Scrapper", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // Scrap materials - not combat
  [PerkId.Armorer]: { name: "Armorer", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // Armor crafting - not combat
  [PerkId.Chemist]: { name: "Chemist", special: Special.Intelligence, maxRank: 1, statsModified: [] }, // Chem crafting - not combat
  [PerkId.RoboticsExpert]: { name: "Robotics Expert", special: Special.Intelligence, maxRank: 3, statsModified: [{ stat: Stat.OutgoingDamageMultiplier, value: 75 }] }, // +75% damage to robots
  [PerkId.PyroTechnician]: { name: "Pyro-Technician", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // SPECIAL-scaled fire damage
  [PerkId.Cryologist]: { name: "Cryologist", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // SPECIAL-scaled cryo damage
  [PerkId.WreckingBall]: { name: "Wrecking Ball", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // +100% damage to objects - not enemy combat
  [PerkId.Stabilized]: { name: "Stabilized", special: Special.Intelligence, maxRank: 3, statsModified: [{ stat: Stat.ArmorPenetration, value: 30 }] }, // Big guns, doubled in PA
  [PerkId.WeaponArtisan]: { name: "Weapon Artisan", special: Special.Intelligence, maxRank: 3, statsModified: [] },
  [PerkId.NerdRage]: { name: "Nerd Rage", special: Special.Intelligence, maxRank: 3, statsModified: [] }, // Low health damage boost - conditional
  [PerkId.StableTools]: { name: "Stable Tools", special: Special.Intelligence, maxRank: 3, statsModified: [] },

  // ============ AGILITY ============
  [PerkId.Adrenaline]: { name: "Adrenaline", special: Special.Agility, maxRank: 5, statsModified: [{ stat: Stat.OutgoingDamageMultiplier, value: 100 }] }, // +10% per kill, max 10 stacks = +100%
  [PerkId.Dodgy]: { name: "Dodgy", special: Special.Agility, maxRank: 3, statsModified: [{ stat: Stat.DeflectChance, value: 5 }] },
  [PerkId.GoatLegs]: { name: "Goat Legs", special: Special.Agility, maxRank: 2, statsModified: [] },
  [PerkId.GunFu]: { name: "Gun Fu", special: Special.Agility, maxRank: 3, statsModified: [] }, // VATS target switching +90% damage - VATS specific
  [PerkId.Marathoner]: { name: "Marathoner", special: Special.Agility, maxRank: 3, statsModified: [] }, // Sprint AP cost - not direct damage
  [PerkId.MisterSandman]: { name: "Mister Sandman", special: Special.Agility, maxRank: 3, statsModified: [{ stat: Stat.SneakDamageBonus, value: 100 }] }, // Silenced weapons only
  [PerkId.GunRunner]: { name: "Gun Runner", special: Special.Agility, maxRank: 2, statsModified: [] }, // ADS movement speed - not direct damage
  [PerkId.ActionBoyGirl]: { name: "Action Boy/Girl", special: Special.Agility, maxRank: 3, statsModified: [] }, // AP regen - not direct damage
  [PerkId.BornSurvivor]: { name: "Born Survivor", special: Special.Agility, maxRank: 3, statsModified: [] }, // Auto stim - not combat
  [PerkId.DeadManSprinting]: { name: "Dead Man Sprinting", special: Special.Agility, maxRank: 3, statsModified: [] }, // Sprint bonuses - not direct damage
  [PerkId.MovingTarget]: { name: "Moving Target", special: Special.Agility, maxRank: 3, statsModified: [] }, // Movement speed evasion - not direct damage
  [PerkId.Guerrilla]: { name: "Guerrilla", special: Special.Agility, maxRank: 3, statsModified: [] }, // Reworked perk - see GuerrillaMaster
  [PerkId.PackinLight]: { name: "Packin' Light", special: Special.Agility, maxRank: 3, statsModified: [] }, // Weight reduction - not combat
  [PerkId.Gunslinger]: { name: "Gunslinger", special: Special.Agility, maxRank: 3, statsModified: [] }, // Reworked perk - see GunslingerMaster
  [PerkId.SecretAgent]: { name: "Secret Agent", special: Special.Agility, maxRank: 3, statsModified: [] }, // Sneak movement - not direct damage
  [PerkId.GuerrillaExpert]: { name: "Guerrilla Expert", special: Special.Agility, maxRank: 3, statsModified: [{ stat: Stat.OnslaughtWeakspotPerStack, value: 1 }] }, // +1% weak spot per stack, max 3
  [PerkId.HomeDefense]: { name: "Home Defense", special: Special.Agility, maxRank: 3, statsModified: [] }, // Trap damage - not direct combat
  [PerkId.Lightfooted]: { name: "Light Footed", special: Special.Agility, maxRank: 2, statsModified: [] }, // No trap trigger - not combat
  [PerkId.GuerrillaMaster]: { name: "Guerrilla Master", special: Special.Agility, maxRank: 3, statsModified: [{ stat: Stat.OnslaughtDamageBonus, value: 5 }] }, // +5% close range per stack, max 5
  [PerkId.Ninja]: { name: "Ninja", special: Special.Agility, maxRank: 3, statsModified: [{ stat: Stat.SneakDamageBonus, value: 100 }] }, // Melee/bow/thrown only
  [PerkId.GunslingerExpert]: { name: "Gunslinger Expert", special: Special.Agility, maxRank: 3, statsModified: [{ stat: Stat.OnslaughtWeakspotPerStack, value: 1 }] }, // +1% weak spot per stack, max 3
  [PerkId.GunslingerMaster]: { name: "Gunslinger Master", special: Special.Agility, maxRank: 3, statsModified: [] }, // Grants +10 max Onslaught stacks - special handling
  [PerkId.Evasive]: { name: "Evasive", special: Special.Agility, maxRank: 3, statsModified: [] }, // SPECIAL-scaled evade chance
  [PerkId.CovertOperative]: { name: "Covert Operative", special: Special.Agility, maxRank: 3, statsModified: [{ stat: Stat.SneakDamageBonus, value: 50 }] }, // Ranged attacks
  [PerkId.EscapeArtist]: { name: "Escape Artist", special: Special.Agility, maxRank: 1, statsModified: [] }, // Stealth after hit - not direct damage
  [PerkId.ModernRenegade]: { name: "Modern Renegade", special: Special.Agility, maxRank: 3, statsModified: [{ stat: Stat.LimbDamageBonus, value: 75 }] }, // Small guns, +30% hip fire accuracy
  [PerkId.Sneak]: { name: "Sneak", special: Special.Agility, maxRank: 3, statsModified: [] }, // Stealth detection - enables sneak damage
  [PerkId.Enforcer]: { name: "Enforcer", special: Special.Agility, maxRank: 3, statsModified: [{ stat: Stat.LimbDamageBonus, value: 75 }] }, // Small guns, +15% stagger
  [PerkId.Ammosmith]: { name: "Ammosmith", special: Special.Agility, maxRank: 2, statsModified: [] }, // Craft more ammo - not combat
  [PerkId.WhiteKnight]: { name: "White Knight", special: Special.Agility, maxRank: 3, statsModified: [] }, // Armor durability/cost - not combat

  // ============ LUCK ============
  [PerkId.CanDo]: { name: "Can Do!", special: Special.Luck, maxRank: 3, statsModified: [] },
  [PerkId.GrimReapersSprint]: { name: "Grim Reaper's Sprint", special: Special.Luck, maxRank: 3, statsModified: [] }, // VATS kills restore AP - not direct damage
  [PerkId.LuckOfTheDraw]: { name: "Luck Of The Draw", special: Special.Luck, maxRank: 3, statsModified: [] },
  [PerkId.MysteriousSavior]: { name: "Mysterious Savior", special: Special.Luck, maxRank: 3, statsModified: [] },
  [PerkId.MysteriousStranger]: { name: "Mysterious Stranger", special: Special.Luck, maxRank: 3, statsModified: [] },
  [PerkId.MysteryMeat]: { name: "Mystery Meat", special: Special.Luck, maxRank: 3, statsModified: [] },
  [PerkId.Scrounger]: { name: "Scrounger", special: Special.Luck, maxRank: 3, statsModified: [] },
  [PerkId.StarchedGenes]: { name: "Starched Genes", special: Special.Luck, maxRank: 2, statsModified: [] },
  [PerkId.PharmaFarma]: { name: "Pharma Farma", special: Special.Luck, maxRank: 3, statsModified: [] },
  [PerkId.Serendipity]: { name: "Serendipity", special: Special.Luck, maxRank: 3, statsModified: [] }, // SPECIAL-scaled evade below 30% health
  [PerkId.GoodWithSalt]: { name: "Good With Salt", special: Special.Luck, maxRank: 3, statsModified: [] },
  [PerkId.JunkShield]: { name: "Junk Shield", special: Special.Luck, maxRank: 3, statsModified: [] }, // SPECIAL-scaled DR/ER based on junk
  [PerkId.Psychopath]: { name: "Psychopath", special: Special.Luck, maxRank: 3, statsModified: [] }, // Non-VATS hits fill crit meter - not direct damage
  [PerkId.QuickHands]: { name: "Quick Hands", special: Special.Luck, maxRank: 3, statsModified: [] },
  [PerkId.WoodChucker]: { name: "Wood Chucker", special: Special.Luck, maxRank: 1, statsModified: [] },
  [PerkId.Ricochet]: { name: "Ricochet", special: Special.Luck, maxRank: 3, statsModified: [] }, // SPECIAL-scaled deflect chance
  [PerkId.StormChaser]: { name: "Storm Chaser", special: Special.Luck, maxRank: 3, statsModified: [] },
  [PerkId.Tormentor]: { name: "Tormentor", special: Special.Luck, maxRank: 3, statsModified: [{ stat: Stat.DamagePerCrippledLimb, value: 20 }] },
  [PerkId.CapCollector]: { name: "Cap Collector", special: Special.Luck, maxRank: 2, statsModified: [] },
  [PerkId.CriticalSavvy]: { name: "Critical Savvy", special: Special.Luck, maxRank: 3, statsModified: [] }, // Crits consume 55% meter - not direct damage
  [PerkId.LastLaugh]: { name: "Last Laugh", special: Special.Luck, maxRank: 3, statsModified: [] }, // Drop grenade on death - not direct combat
  [PerkId.SuperDuper]: { name: "Super Duper", special: Special.Luck, maxRank: 3, statsModified: [] },
  [PerkId.FortuneFinder]: { name: "Fortune Finder", special: Special.Luck, maxRank: 3, statsModified: [] },
  [PerkId.LuckyBreak]: { name: "Lucky Break", special: Special.Luck, maxRank: 3, statsModified: [] },
  [PerkId.Curator]: { name: "Curator", special: Special.Luck, maxRank: 2, statsModified: [] },
  [PerkId.FourLeafClover]: { name: "Four Leaf Clover", special: Special.Luck, maxRank: 3, statsModified: [] }, // VATS misses fill crit meter - not direct damage
  [PerkId.OneGunArmy]: { name: "One Gun Army", special: Special.Luck, maxRank: 3, statsModified: [{ stat: Stat.LimbDamageBonus, value: 75 }] }, // Heavy guns, +12% stagger
  [PerkId.BloodyMess]: { name: "Bloody Mess", special: Special.Luck, maxRank: 3, statsModified: [{ stat: Stat.OutgoingDamageMultiplier, value: 15 }] },
  [PerkId.ClassFreak]: { name: "Class Freak", special: Special.Luck, maxRank: 3, statsModified: [] }, // Reduces mutation negatives - not direct combat
  [PerkId.BetterCriticals]: { name: "Better Criticals", special: Special.Luck, maxRank: 3, statsModified: [{ stat: Stat.CriticalDamageBonus, value: 100 }] },

  // ============ LEGENDARY PERKS ============
  [PerkId.RadSpecialist]: { name: "Rad Specialist", special: Special.Endurance, maxRank: 4, statsModified: [] },
  [PerkId.RadioactiveStrength]: { name: "Radioactive Strength", special: Special.Strength, maxRank: 4, statsModified: [{ stat: Stat.PowerAttackDamageBonus, value: 150 }, { stat: Stat.BashDamageBonus, value: 150 }] }, // Assumes high Glow
  [PerkId.MadScientist]: { name: "Mad Scientist", special: Special.Intelligence, maxRank: 4, statsModified: [{ stat: Stat.EnergyDamageBonus, value: 20 }] }, // Assumes high Glow
  [PerkId.EyeOfTheHunter]: { name: "Eye Of The Hunter", special: Special.Perception, maxRank: 4, statsModified: [] }, // +30% VATS accuracy at long range - not direct damage
  [PerkId.BrickWall]: { name: "Brick Wall", special: Special.Strength, maxRank: 4, statsModified: [] }, // Stagger immunity when Glow high - not damage
  [PerkId.ChemDiet]: { name: "Chem Diet", special: Special.Endurance, maxRank: 4, statsModified: [] }, // Chem weight reduction - not combat
  [PerkId.ScienceMonster]: { name: "Science Monster", special: Special.Intelligence, maxRank: 4, statsModified: [{ stat: Stat.OutgoingDamageMultiplier, value: 15 }] }, // +15% damage for 10s when hit with Glow
  [PerkId.BombScientist]: { name: "Bomb Scientist", special: Special.Intelligence, maxRank: 4, statsModified: [{ stat: Stat.OutgoingExplosionDamageMultiplier, value: 50 }] }, // Assumes high Glow
  [PerkId.MoralSupport]: { name: "Moral Support", special: Special.Charisma, maxRank: 4, statsModified: [] }, // Team damage/resistances - not implemented
  [PerkId.RadReaver]: { name: "Rad Reaver", special: Special.Endurance, maxRank: 4, statsModified: [] }, // Rad heal & damage - complex
  [PerkId.GunTricks]: { name: "Gun Tricks", special: Special.Agility, maxRank: 4, statsModified: [] }, // 30% reload speed - not direct damage
  [PerkId.HyperReflexes]: { name: "Hyper Reflexes", special: Special.Agility, maxRank: 4, statsModified: [{ stat: Stat.DeflectChance, value: 20 }] }, // Assumes high Glow, no PA
  [PerkId.GlowingOne]: { name: "Glowing One", special: Special.Endurance, maxRank: 4, statsModified: [] }, // SPECIAL-scaled HP & resistances when Glow high
  [PerkId.GlowingHunter]: { name: "Glowing Hunter", special: Special.Perception, maxRank: 4, statsModified: [{ stat: Stat.DamageToGlowingEnemiesBonus, value: 30 }] }, // Additional bonus vs Glowing
  [PerkId.ThickSkin]: { name: "Thick Skin", special: Special.Endurance, maxRank: 4, statsModified: [{ stat: Stat.IncomingDamageMultiplier, value: -10 }] }, // No PA
  [PerkId.BattleGenes]: { name: "Battle Genes", special: Special.Luck, maxRank: 4, statsModified: [] }, // Melee scaling - complex
  [PerkId.FeralPresence]: { name: "Feral Presence", special: Special.Endurance, maxRank: 4, statsModified: [] }, // -30% enemy damage while Feral - enemy debuff
  [PerkId.UnitedOrdeal]: { name: "United Ordeal", special: Special.Charisma, maxRank: 4, statsModified: [] }, // Team bonuses - not implemented
  [PerkId.FaultySpots]: { name: "Faulty Spots", special: Special.Luck, maxRank: 4, statsModified: [{ stat: Stat.WeakspotDamageBonus, value: 15 }] },
  [PerkId.GlowingGut]: { name: "Glowing Gut", special: Special.Endurance, maxRank: 4, statsModified: [] }, // Healing restores Glow - not direct combat
  [PerkId.JaguarSpeed]: { name: "Jaguar Speed", special: Special.Agility, maxRank: 4, statsModified: [] }, // Movement speed - not direct damage
  [PerkId.ActionGhoul]: { name: "Action Ghoul", special: Special.Agility, maxRank: 4, statsModified: [] }, // AP regen - not direct damage
  [PerkId.GlowingCriticals]: { name: "Glowing Criticals", special: Special.Luck, maxRank: 4, statsModified: [{ stat: Stat.CriticalDamageBonus, value: 50 }] }, // Assumes high Glow
  [PerkId.RadiationPower]: { name: "Radiation Power", special: Special.Endurance, maxRank: 4, statsModified: [{ stat: Stat.OutgoingDamageMultiplier, value: 20 }] }, // Assumes high Glow
  [PerkId.WildWestHands]: { name: "Wild West Hands", special: Special.Agility, maxRank: 4, statsModified: [] }, // 36% instant reload chance - not direct damage
  [PerkId.BreathItIn]: { name: "Breath It In", special: Special.Endurance, maxRank: 4, statsModified: [] }, // Rad immunity - not direct combat
  [PerkId.BoneShatterer]: { name: "Bone Shatterer", special: Special.Strength, maxRank: 4, statsModified: [{ stat: Stat.MeleeLimbDamageBonus, value: 75 }] },
};
