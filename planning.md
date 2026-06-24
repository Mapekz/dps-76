I want to ship an MVP of this DPS calculator as soon as possible. I overdesigned and engineered the first pass of it and that has put me in a spot where I can't quickly iterate on it.

1. Nukes & Dragons link uploads are meant to work, and are meant to set correct ranks for your different perks and leggo perks.
2. I only need latest Live version working right now - we can do the PTS toggle later.
3. I only need to focus on player outgoing DPS numbers to start; we can worry about enemy resists and such later.
4. I have to pull the latest player DPS curve tables from @/mnt/data/FO76-Tools/source/pts/68.7/ (ignore the folder name, the live curves are the same as pts update 68's since
current pts is on pts update 70)
5. We can ignore weapon mods for now - let's get the perks + base weapon + non-legendary stuff working first. The next pass will be to add legendary and normal weapon mods.
The pass after that the armor mods.
6. Do not care about aim models / recoil / spread. We're going to assume perfect hit chance against a weakpoint and perfect hit chance against a non-weakpoint (so we will show
two sets of numbers, damage/hit and DPS for each weakpoint/non-weakpoint) and maxed fire rate in both cases. For manual aim we can put a note that realistically you will be
missing between 30% to 70% of your shots depending on movement and target size or have to burst fire your attacks due to recoil/spread (in turn reducing your fire rate by
30-50%), so effective DPS will be equally lower.
7. For AP cost for VATS or power tools (automatic melee) we can later worry about AP drain/sec and AP regen/sec.
8. We won't care about reload speed/times or durability for now. We'll assume infinite magazine sizes and zero condition loss on hit.
9. We won't care about range damage falloff or explosive radius damage falloff either. We'll assume everything is in melee range and explosions are direct hits.
10. We don't care about bash damage for now
11. We don't need _every_ single weapon to start. Just stick with Gatling Plasma, The Fixer, Plasma Gun (pistol/rifle is the same thing DPS wise without factoring in aim model adjustments), Light Machine Gun, Single Action Revolver, Deathclaw Gauntlet (unarmed fist weapon), Super Sledge, and Pickaxe. ALL OF THESE ARE WITHOUT MODS so no stat changes from default. You will likely need to prompt me for all the relevant stats and I can provide those to you at the end - for now just stub everything.

All the exceptions listed above, and any others you come up with or recommend, should be put into a todos/ folder to enhance the calculator at a later time.

Outgoing Damage/hit formula = BaseWeaponDamage x (1 + DamageBonusMult) x Multipliers

DamageBonusMult = all additive DBMs, including power attack DBM when doing a power attack or using a power tool (auto melee) weapon, including Strength modifier for melee attacks (10% of total STR for unarmed/gauntlet/fist weapons, 5% of total STR for 1h and 2h weapons), CritDamageBonusMult (which is baseline equal to 100% of base dmg, but can be increased or decreased depending on the weapon and which mods it has and perks/etc, only activates on a VATS Crit), SneakDamageBonusMult (same as CritDBM, starts at a baseline 100% of base dmg but can be increased or decreased depending on the weapon and which mods and perks etc; only activates when sneaking), etc

Multipliers = include perks like Taking One for the Team, Follow Through; includes WeakPointDBM (which unfortunately breaks the pattern of other additive DBMs) as well as BodyPartMult (which includes weakpoints and strongpoint multipliers on the enemy body); includes 1.5 (2.0x in power armor) multiplier from power attacks; Smart Shot perk that grants a multiplier specifically when hitting a weakpoint while scoped; a handful of others I am not forgetting at the moment

Main goal for MVP is to show an average comfort build vs a min/maxed VATS build vs a min/maxed VATS + Sneak build. Each SPECIAL can only have 15 perk points / ranks maximum, and Legendary Special Perks can grant up to 6 diff SPECIALS with +5 perk points (still not exceeding the 15 perk point cap), and at level 50 your base non-legendary SPECIALs cap at 56 (7 base, 1 in each special, that cannot be lowered to 0 + 49 from level ups on the way to 50). So that means max you can have 86 perk points if you do 6 leggo specials, or 56 if you have 0 leggo specials.

Leggo is shorthand for Legendary going forward.

Please ask me ANY questions needed to formalize the DPS calculator so it's mostly accurate. And please reference the entire perks database at https://nukesdragons.com/fallout-76/db/perks and ask any clarifying questions if something is or isn't clear as to where it goes or how it gets factored in or if we should defer it for later.
