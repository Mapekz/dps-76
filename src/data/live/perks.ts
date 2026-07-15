import type { PerkNameEntry } from "@/data/perk-cards";
import { PerkId } from "@/data/perk-ids";

/**
 * Name-only perk registry: PerkId -> display name. SPECIAL/maxRank/costs are
 * DERIVED from the ESM-generated perk cards (src/data/perk-cards.ts,
 * wired in src/data/dataset.ts) — this file only supplies the join key
 * (the display name) and preserves PerkId ordering/section grouping.
 */
export const perks: Record<PerkId, PerkNameEntry> = {
  // ============ STRENGTH ============
  [PerkId.Bandolier]: { name: "Bandolier" },
  [PerkId.BatteriesIncluded]: { name: "Batteries Included" },
  [PerkId.BearArms]: { name: "Bear Arms" },
  [PerkId.TightlyWound]: { name: "Tightly Wound" },
  [PerkId.Slugger]: { name: "Slugger" },
  [PerkId.WoundSalter]: { name: "Wound Salter" },
  [PerkId.ThruHiker]: { name: "Thru Hiker" },
  [PerkId.BulletShield]: { name: "Bullet Shield" },
  [PerkId.IronFist]: { name: "Iron Fist" },
  [PerkId.PackRat]: { name: "Pack Rat" },
  [PerkId.TravelingPharmacy]: { name: "Traveling Pharmacy" },
  [PerkId.Basher]: { name: "Basher" },
  [PerkId.EasyTarget]: { name: "Easy Target" },
  [PerkId.Incisor]: { name: "Incisor" },
  [PerkId.Barbarian]: { name: "Barbarian" }, // SPECIAL-scaled: DR = STR value
  [PerkId.Blocker]: { name: "Blocker" },
  [PerkId.NaturalStance]: { name: "Natural Stance" }, // -25% stagger - not implemented
  [PerkId.BloodLuster]: { name: "Blood Luster" }, // Team buff - not implemented
  [PerkId.Kneecapper]: { name: "Knee-capper" },
  [PerkId.HeavyHitter]: { name: "Heavy Hitter" },
  [PerkId.LoveTheSpread]: { name: "Love the Spread" }, // +30% range - not damage
  [PerkId.ShotgunChamp]: { name: "Shotgun Champ" }, // Per projectile
  [PerkId.BulletStorm]: { name: "Bullet Storm" },
  [PerkId.BringingOutTheBigGuns]: { name: "Bringing Out the Big Guns" }, // Doubles Bullet Storm max stacks - special handling
  [PerkId.MartialArtist]: { name: "Martial Artist" }, // +30% swing speed - not direct damage
  [PerkId.FullCharge]: { name: "Full Charge" },
  [PerkId.Scattershot]: { name: "Scattershot" }, // Shotgun-specific - need to verify
  [PerkId.StrongBack]: { name: "Strong Back" }, // Carry weight - not combat
  [PerkId.OrdnanceExpress]: { name: "Ordnance Express" }, // Weight reduction - not combat
  [PerkId.LockAndLoad]: { name: "Lock And Load" }, // Reload speed - indirect combat
  [PerkId.PainTrain]: { name: "Pain Train" }, // Sprint damage - not implemented
  [PerkId.ArmsKeeper]: { name: "Arms Keeper" }, // Durability - not combat
  [PerkId.PortablePower]: { name: "Portable Power" },
  [PerkId.SturdyFrame]: { name: "Sturdy Frame" },

  // ============ PERCEPTION ============
  [PerkId.ConcentratedFire]: { name: "Concentrated Fire" }, // +3% accuracy & damage per shot - stacking mechanic not implemented
  [PerkId.GreenThumb]: { name: "Green Thumb" }, // Harvesting - not combat
  [PerkId.NightPerson]: { name: "Night Person" }, // Night time bonus - not implemented
  [PerkId.Pannapictagraphist]: { name: "Pannapictagraphist" }, // Photo mode - not combat
  [PerkId.Perceptibobble]: { name: "Perceptibobble" }, // Bobblehead duration - not combat
  [PerkId.Refractor]: { name: "Refractor" }, // SPECIAL-scaled: ER = PER value
  [PerkId.Sniper]: { name: "Sniper" }, // Scoped rifle damage - need weapon mod check
  [PerkId.ButchersBounty]: { name: "Butcher's Bounty" }, // Meat harvest - not combat
  [PerkId.PicklockExpert]: { name: "Picklock Expert" }, // Lockpicking - not combat
  [PerkId.PicklockMaster]: { name: "Picklock Master" }, // Lockpicking - not combat
  [PerkId.Picklock]: { name: "Picklock" }, // Lockpicking - not combat
  [PerkId.CrackShot]: { name: "Crack Shot" }, // Accuracy - not direct damage
  [PerkId.SkeetShooter]: { name: "Skeet Shooter" }, // Accuracy - not direct damage
  [PerkId.DownRanger]: { name: "Down Ranger" }, // +20% ranged damage to distant enemies - conditional
  [PerkId.GlowSight]: { name: "Glow Sight" },
  [PerkId.Awareness]: { name: "Awareness" }, // Enemy info display - not combat
  [PerkId.CenterMasochist]: { name: "Center Masochist" },
  [PerkId.FastFighter]: { name: "Fast Fighter" }, // Fire rate - not direct damage
  [PerkId.NumberCruncher]: { name: "Number Cruncher" }, // Damage numbers display - not combat
  [PerkId.StrongArm]: { name: "Strong Arm" }, // Throwing range - not direct damage
  [PerkId.RiflemanExpert]: { name: "Rifleman Expert" }, // Old weapon-type perk - reworked
  [PerkId.RiflemanMaster]: { name: "Rifleman Master" }, // Old weapon-type perk - reworked
  [PerkId.Exterminator]: { name: "Exterminator" },
  [PerkId.BowBeforeMe]: { name: "Bow Before Me" }, // Bow/crossbow only
  [PerkId.GroundPounder]: { name: "Ground Pounder" }, // Reload speed & accuracy - not direct damage
  [PerkId.TankKiller]: { name: "Tank Killer" },
  [PerkId.Grenadier]: { name: "Grenadier" }, // 2x explosion radius - area effect not damage
  [PerkId.LongShot]: { name: "Long Shot" }, // Range/accuracy - not direct damage
  [PerkId.NightEyes]: { name: "Night Eyes" }, // Night vision - not combat
  [PerkId.Archer]: { name: "Archer" },
  [PerkId.ArcherExpert]: { name: "Archer Expert" },
  [PerkId.ArcherMaster]: { name: "Archer Master" },

  // ============ ENDURANCE ============
  [PerkId.AquaBoyGirl]: { name: "Aqua Boy/Girl" },
  [PerkId.Dromedary]: { name: "Dromedary" },
  [PerkId.ProfessionalDrinker]: { name: "Professional Drinker" },
  [PerkId.Revenant]: { name: "Revenant" },
  [PerkId.SlowMetabolizer]: { name: "Slow Metabolizer" },
  [PerkId.Vaccinated]: { name: "Vaccinated" },
  [PerkId.GoodDoggy]: { name: "Good Doggy" },
  [PerkId.IronStomach]: { name: "Iron Stomach" },
  [PerkId.LeadBelly]: { name: "Lead Belly" },
  [PerkId.ThirstQuencher]: { name: "Thirst Quencher" },
  [PerkId.HydroFix]: { name: "Hydro Fix" },
  [PerkId.NaturalResistance]: { name: "Natural Resistance" },
  [PerkId.RadResistant]: { name: "Rad Resistant" },
  [PerkId.LifeGiver]: { name: "Life Giver" },
  [PerkId.AllNightLong]: { name: "All Night Long" },
  [PerkId.ChemResistant]: { name: "Chem Resistant" },
  [PerkId.Fireproof]: { name: "Fireproof" },
  [PerkId.Ghoulish]: { name: "Ghoulish" }, // Rad healing - special mechanic
  [PerkId.Ironclad]: { name: "Ironclad" }, // +50% with matching armor set
  [PerkId.Rejuvenated]: { name: "Rejuvenated" }, // Well fed/hydrated bonuses - not direct combat
  [PerkId.Cannibal]: { name: "Cannibal" }, // Corpse eating - not combat
  [PerkId.ColaNut]: { name: "Cola Nut" }, // Nuka-Cola bonuses - consumable effect
  [PerkId.MunchyResistance]: { name: "Munchy Resistance" }, // Chem addiction - not combat
  [PerkId.AdamantiumSkeleton]: { name: "Adamantium Skeleton" },
  [PerkId.SunKissed]: { name: "Sun Kissed" },
  [PerkId.Homebody]: { name: "Homebody" },
  [PerkId.SolarPowered]: { name: "Solar Powered" },
  [PerkId.ChemFiend]: { name: "Chem Fiend" },
  [PerkId.NocturnalFortitude]: { name: "Nocturnal Fortitude" },
  [PerkId.Radicool]: { name: "Radicool" },
  [PerkId.RadSponge]: { name: "Rad Sponge" },
  [PerkId.Photosynthetic]: { name: "Photosynthetic" },

  // ============ CHARISMA ============
  [PerkId.AnimalFriend]: { name: "Animal Friend" },
  [PerkId.Bodyguards]: { name: "Bodyguards" }, // SPECIAL-scaled DR/ER per teammate
  [PerkId.FriendlyFire]: { name: "Friendly Fire" },
  [PerkId.HappyCamper]: { name: "Happy Camper" },
  [PerkId.HappyGoLucky]: { name: "Happy-Go-Lucky" },
  [PerkId.HardBargain]: { name: "Hard Bargain" },
  [PerkId.Inspirational]: { name: "Inspirational" },
  [PerkId.LoneWanderer]: { name: "Lone Wanderer" }, // SPECIAL-scaled DR/ER when solo
  [PerkId.PartyBoyGirl]: { name: "Party Boy/Girl" },
  [PerkId.QuackSurgeon]: { name: "Quack Surgeon" },
  [PerkId.SpiritualHealer]: { name: "Spiritual Healer" },
  [PerkId.Philanthropist]: { name: "Philanthropist" },
  [PerkId.SquadManeuvers]: { name: "Squad Maneuvers" },
  [PerkId.StrangeInNumbers]: { name: "Strange In Numbers" },
  [PerkId.TeamMedic]: { name: "Team Medic" },
  [PerkId.Bloodsucker]: { name: "Bloodsucker" },
  [PerkId.EMT]: { name: "EMT" },
  [PerkId.MagneticPersonality]: { name: "Magnetic Personality" },
  [PerkId.FieldSurgeon]: { name: "Field Surgeon" },
  [PerkId.Injector]: { name: "Injector" },
  [PerkId.Suppressor]: { name: "Suppressor" }, // Enemy debuff - reduces enemy damage by 30%
  [PerkId.DryNurse]: { name: "Dry Nurse" },
  [PerkId.HealingHands]: { name: "Healing Hands" },
  [PerkId.TravelAgent]: { name: "Travel Agent" },
  [PerkId.OverlyGenerous]: { name: "Overly Generous" },
  [PerkId.AntiEpidemic]: { name: "Anti Epidemic" },
  [PerkId.Tenderizer]: { name: "Tenderizer" }, // Enemy debuff - stacking damage taken
  [PerkId.WastelandWhisperer]: { name: "Wasteland Whisperer" },

  // ============ INTELLIGENCE ============
  [PerkId.FirstAid]: { name: "First Aid" },
  [PerkId.Hacker]: { name: "Hacker" },
  [PerkId.MakeshiftWarrior]: { name: "Makeshift Warrior" },
  [PerkId.HackerMaster]: { name: "Hacker Master" },
  [PerkId.Contractor]: { name: "Contractor" },
  [PerkId.Science]: { name: "Science!" },
  [PerkId.LicensedPlumber]: { name: "Licensed Plumber" },
  [PerkId.Pharmacist]: { name: "Pharmacist" },
  [PerkId.HackerExpert]: { name: "Hacker Expert" },
  [PerkId.DemolitionExpert]: { name: "Demolition Expert" },
  [PerkId.Gunsmith]: { name: "Gunsmith" },
  [PerkId.PowerUser]: { name: "Power User" },
  [PerkId.PowerSmith]: { name: "Power Smith" },
  [PerkId.FixItGood]: { name: "Fix It Good" },
  [PerkId.PowerPatcher]: { name: "Power Patcher" },
  [PerkId.Scrapper]: { name: "Scrapper" },
  [PerkId.Armorer]: { name: "Armorer" },
  [PerkId.Chemist]: { name: "Chemist" },
  [PerkId.RoboticsExpert]: { name: "Robotics Expert" },
  [PerkId.PyroTechnician]: { name: "Pyro-Technician" }, // SPECIAL-scaled fire damage
  [PerkId.Cryologist]: { name: "Cryologist" }, // SPECIAL-scaled cryo damage
  [PerkId.WreckingBall]: { name: "Wrecking Ball" }, // +100% damage to objects - not enemy combat
  [PerkId.Stabilized]: { name: "Stabilized" }, // Big guns, doubled in PA
  [PerkId.WeaponArtisan]: { name: "Weapon Artisan" },
  [PerkId.NerdRage]: { name: "Nerd Rage" }, // Low health damage boost - conditional
  [PerkId.StableTools]: { name: "Stable Tools" },

  // ============ AGILITY ============
  [PerkId.Adrenaline]: { name: "Adrenaline" }, // +10% per kill, max 10 stacks = +100%
  [PerkId.Dodgy]: { name: "Dodgy" },
  [PerkId.GoatLegs]: { name: "Goat Legs" },
  [PerkId.GunFu]: { name: "Gun Fu" },
  [PerkId.Marathoner]: { name: "Marathoner" },
  [PerkId.MisterSandman]: { name: "Mister Sandman" }, // Silenced weapons only
  [PerkId.GunRunner]: { name: "Gun Runner" },
  [PerkId.ActionBoyGirl]: { name: "Action Boy/Girl" },
  [PerkId.BornSurvivor]: { name: "Born Survivor" },
  [PerkId.DeadManSprinting]: { name: "Dead Man Sprinting" },
  [PerkId.MovingTarget]: { name: "Moving Target" },
  [PerkId.Guerrilla]: { name: "Guerrilla" },
  [PerkId.PackinLight]: { name: "Packin' Light" },
  [PerkId.Gunslinger]: { name: "Gunslinger" },
  [PerkId.SecretAgent]: { name: "Secret Agent" },
  [PerkId.GuerrillaExpert]: { name: "Guerrilla Expert" },
  [PerkId.HomeDefense]: { name: "Home Defense" },
  [PerkId.Lightfooted]: { name: "Light Footed" },
  [PerkId.GuerrillaMaster]: { name: "Guerrilla Master" },
  [PerkId.Ninja]: { name: "Ninja" }, // Melee/bow/thrown only
  [PerkId.GunslingerExpert]: { name: "Gunslinger Expert" },
  [PerkId.GunslingerMaster]: { name: "Gunslinger Master" },
  [PerkId.Evasive]: { name: "Evasive" }, // SPECIAL-scaled evade chance
  [PerkId.CovertOperative]: { name: "Covert Operative" }, // Ranged attacks
  [PerkId.EscapeArtist]: { name: "Escape Artist" },
  [PerkId.ModernRenegade]: { name: "Modern Renegade" }, // Small guns, +30% hip fire accuracy
  [PerkId.Sneak]: { name: "Sneak" },
  [PerkId.Enforcer]: { name: "Enforcer" }, // Small guns, +15% stagger
  [PerkId.Ammosmith]: { name: "Ammosmith" },
  [PerkId.WhiteKnight]: { name: "White Knight" },

  // ============ LUCK ============
  [PerkId.CanDo]: { name: "Can Do!" },
  [PerkId.GrimReapersSprint]: { name: "Grim Reaper's Sprint" },
  [PerkId.LuckOfTheDraw]: { name: "Luck Of The Draw" },
  [PerkId.MysteriousSavior]: { name: "Mysterious Savior" },
  [PerkId.MysteriousStranger]: { name: "Mysterious Stranger" },
  [PerkId.MysteryMeat]: { name: "Mystery Meat" },
  [PerkId.Scrounger]: { name: "Scrounger" },
  [PerkId.StarchedGenes]: { name: "Starched Genes" },
  [PerkId.PharmaFarma]: { name: "Pharma Farma" },
  [PerkId.Serendipity]: { name: "Serendipity" }, // SPECIAL-scaled evade below 30% health
  [PerkId.GoodWithSalt]: { name: "Good With Salt" },
  [PerkId.JunkShield]: { name: "Junk Shield" }, // SPECIAL-scaled DR/ER based on junk
  [PerkId.Psychopath]: { name: "Psychopath" },
  [PerkId.QuickHands]: { name: "Quick Hands" },
  [PerkId.WoodChucker]: { name: "Wood Chucker" },
  [PerkId.Ricochet]: { name: "Ricochet" }, // SPECIAL-scaled deflect chance
  [PerkId.StormChaser]: { name: "Storm Chaser" },
  [PerkId.Tormentor]: { name: "Tormentor" },
  [PerkId.CapCollector]: { name: "Cap Collector" },
  [PerkId.CriticalSavvy]: { name: "Critical Savvy" },
  [PerkId.LastLaugh]: { name: "Last Laugh" },
  [PerkId.SuperDuper]: { name: "Super Duper" },
  [PerkId.FortuneFinder]: { name: "Fortune Finder" },
  [PerkId.LuckyBreak]: { name: "Lucky Break" },
  [PerkId.Curator]: { name: "Curator" },
  [PerkId.FourLeafClover]: { name: "Four Leaf Clover" },
  [PerkId.OneGunArmy]: { name: "One Gun Army" }, // Heavy guns, +12% stagger
  [PerkId.BloodyMess]: { name: "Bloody Mess" },
  [PerkId.ClassFreak]: { name: "Class Freak" },
  [PerkId.BetterCriticals]: { name: "Better Criticals" },

  // ============ GHOUL PERKS ============
  // Regular SPECIAL-slotted cards usable by ghoul characters only (ESM GHL_*
  // families; N&D "0"-prefixed keys). SPECIAL and maxRank sourced from the
  // Nukes & Dragons character bundle (data.nukesdragons.com) and cross-checked
  // against ESM rank counts — the two agree on every card.
  [PerkId.RadSpecialist]: { name: "Rad Specialist" }, // Armor Glow intake - not direct damage
  [PerkId.RadioactiveStrength]: { name: "Radioactive Strength" }, // Assumes high Glow
  [PerkId.ArmsOfSteel]: { name: "Arms of Steel" }, // Unarmed/melee AP - not direct damage
  [PerkId.MadScientist]: { name: "Mad Scientist" }, // Assumes high Glow
  [PerkId.EyeOfTheHunter]: { name: "Eye Of The Hunter" }, // +30% VATS accuracy at long range - not direct damage
  [PerkId.BrickWall]: { name: "Brick Wall" }, // Stagger immunity when Glow high - not damage
  [PerkId.ChemDiet]: { name: "Chem Diet" }, // Chem weight reduction - not combat
  [PerkId.ScienceMonster]: { name: "Science Monster" }, // +15% damage for 10s when hit with Glow
  [PerkId.BombScientist]: { name: "Bomb Scientist" }, // Assumes high Glow
  [PerkId.MoralSupport]: { name: "Moral Support" }, // Team damage/resistances - not implemented
  [PerkId.RadReaver]: { name: "Rad Reaver" }, // Rad heal & damage - complex
  [PerkId.GunTricks]: { name: "Gun Tricks" }, // 30% reload speed - not direct damage
  [PerkId.HyperReflexes]: { name: "Hyper Reflexes" }, // Assumes high Glow, no PA
  [PerkId.GlowingOne]: { name: "Glowing One" }, // SPECIAL-scaled HP & resistances when Glow high
  [PerkId.GlowingHunter]: { name: "Glowing Hunter" }, // Additional bonus vs Glowing
  [PerkId.ThickSkin]: { name: "Thick Skin" }, // No PA
  [PerkId.BattleGenes]: { name: "Battle Genes" }, // Melee scaling - complex
  [PerkId.FeralPresence]: { name: "Feral Presence" }, // -30% enemy damage while Feral - enemy debuff
  [PerkId.UnitedOrdeal]: { name: "United Ordeal" }, // Ghoul + teammateCount>=1: +1/+2/+3 all SPECIAL by rank
  [PerkId.FaultySpots]: { name: "Faulty Spots" },
  [PerkId.GlowingGut]: { name: "Glowing Gut" }, // Healing restores Glow - not direct combat
  [PerkId.JaguarSpeed]: { name: "Jaguar Speed" }, // Movement speed - not direct damage
  [PerkId.ActionGhoul]: { name: "Action Ghoul" }, // AP regen - not direct damage
  [PerkId.GlowingCriticals]: { name: "Glowing Criticals" }, // Assumes high Glow
  [PerkId.RadiationPower]: { name: "Radiation Power" }, // Assumes high Glow
  [PerkId.WildWestHands]: { name: "Wild West Hands" }, // 36% instant reload chance - not direct damage
  [PerkId.BreathItIn]: { name: "Breathe It In" }, // Rad immunity - not direct combat
  [PerkId.BoneShatterer]: { name: "Bone Shatterer" },

  // ============ LEGENDARY PERKS ============
  // Not tied to any SPECIAL (no `special` field). ESM LGN_*_Perk families;
  // N&D "x"-prefixed keys except the two ghoul-exclusive cards (0D/0N).
  // Effects are not yet extracted (empty ESM modifiers) — display/slotting only.
  [PerkId.AmmoFactory]: { name: "Ammo Factory" }, // Ammo crafting - not combat
  [PerkId.BloodSacrifice]: { name: "Blood Sacrifice!" }, // VATS AP costs HP - not direct damage
  [PerkId.BrawlingChemist]: { name: "Brawling Chemist" }, // Chem generation - not combat
  [PerkId.CollateralDamage]: { name: "Collateral Damage" }, // Corpse explosions - not modeled
  [PerkId.DetonationContagion]: { name: "Detonation Contagion" }, // Kill explosions - not modeled
  [PerkId.ElectricAbsorption]: { name: "Electric Absorption" }, // Energy damage absorption - defensive
  [PerkId.ExplodingPalm]: { name: "Exploding Palm" }, // Melee explosion proc - not modeled
  [PerkId.FarFlungFireworks]: { name: "Far-Flung Fireworks" }, // Kill explosions - not modeled
  [PerkId.FollowThrough]: { name: "Follow Through" }, // Ranged sneak → target takes more damage (wholeDamage bucket, pending extraction)
  [PerkId.FunkyDuds]: { name: "Funky Duds" }, // Poison resistance - defensive
  [PerkId.HackAndSlash]: { name: "Hack and Slash" }, // Melee AoE proc - not modeled
  [PerkId.MasterInfiltrator]: { name: "Master Infiltrator" }, // Lockpick/hack - not combat
  [PerkId.PowerArmorReboot]: { name: "Power Armor Reboot" }, // Fusion core revive - not combat
  [PerkId.PowerSprinter]: { name: "Power Sprinter" }, // PA sprint AP - not combat
  [PerkId.Retribution]: { name: "Retribution" }, // Counterattack proc - not modeled
  [PerkId.SizzlingStyle]: { name: "Sizzling Style" }, // Fire resistance - defensive
  [PerkId.SurvivalShortcut]: { name: "Survival Shortcut" }, // Chem generation - not combat
  [PerkId.TakingOneForTheTeam]: { name: "Taking One For The Team" }, // Attackers take more damage (wholeDamage bucket, pending extraction)
  [PerkId.WhatRads]: { name: "What Rads?" }, // Rad immunity - defensive
  [PerkId.ActionDiet]: { name: "Action Diet" }, // Ghoul-exclusive (N&D key 0D): on-kill heal + feral reduction
  [PerkId.FeralRage]: { name: "Feral Rage" }, // Ghoul-exclusive (N&D key 0N)
  // Legendary SPECIAL cards: +1/+2/+3/+5 stat and perk points by rank (ESM
  // families LGN_Legendary*_Perk; the bonus is applied via the perk-budget
  // derivation keyed by PerkId in LEGENDARY_SPECIAL_PERKS — no `special`
  // field, these are legendary slots, not SPECIAL-slotted cards. Their PERK
  // records emit no modifiers, so there is no double-count with the specialX
  // buff buckets).
  [PerkId.LegendaryStrength]: { name: "Legendary Strength" },
  [PerkId.LegendaryPerception]: { name: "Legendary Perception" },
  [PerkId.LegendaryEndurance]: { name: "Legendary Endurance" },
  [PerkId.LegendaryCharisma]: { name: "Legendary Charisma" },
  [PerkId.LegendaryIntelligence]: { name: "Legendary Intelligence" },
  [PerkId.LegendaryAgility]: { name: "Legendary Agility" },
  [PerkId.LegendaryLuck]: { name: "Legendary Luck" },
};
